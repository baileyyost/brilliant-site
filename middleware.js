// Two-step access gate (Vercel Routing Middleware). Runs on Vercel's servers before any file is sent.
// Step 1: visitor enters an approved email + the site password. Step 2: they open the link emailed to them.
// Setup steps are in README.md. All four environment variables are required:
//   SESSION_SECRET    long random string used to sign links and sessions
//   SITE_PASSWORD     shared site password
//   AIRTABLE_TOKEN    Airtable personal access token (data.records:read + write)
//   AIRTABLE_BASE_ID  starts with "app"
// Optional: AIRTABLE_REVIEWERS_TABLE (default "Reviewers"), AIRTABLE_REQUESTS_TABLE (default "Access Requests")

const NOINDEX = 'noindex, nofollow, noarchive, nosnippet';
const COOKIE = 'bai_session';
const LINK_TTL = 60 * 60;              // emailed link works for 1 hour
const SESSION_TTL = 7 * 24 * 60 * 60;  // stay signed in for 7 days
const RECHECK = 60 * 60;               // re-check "Approved" in Airtable every hour
const PUBLIC = [/^\/signin(\.html)?$/, /^\/assets\/lockup-white\.png$/, /^\/assets\/mark\.png$/];

export default async function middleware(request) {
  const url = new URL(request.url);
  const path = url.pathname;
  const env = process.env;
  if (!env.SESSION_SECRET || !env.SITE_PASSWORD || !env.AIRTABLE_TOKEN || !env.AIRTABLE_BASE_ID) {
    return new Response('Site access is not configured.', { status: 503, headers: baseHeaders() });
  }

  if (path === '/api/request-link' && request.method === 'POST') return requestLink(request, url);
  if (path === '/auth') return redeem(url);
  if (path === '/signout') return redirect('/signin?out=1', clearCookie());
  if (PUBLIC.some((r) => r.test(path))) return;

  const session = await readToken(getCookie(request, COOKIE), 's');
  if (!session) return redirect('/signin?next=' + encodeURIComponent(path + url.search));

  // Sessions end when SITE_PASSWORD changes.
  if (session.pv !== (await passwordVersion())) return redirect('/signin?error=changed', clearCookie());

  if (now() - session.c > RECHECK) {
    let approved;
    try { approved = !!(await findReviewer(session.e)); }
    catch (e) { return redirect('/signin?error=unavailable'); }
    if (!approved) return redirect('/signin?error=revoked', clearCookie());
    return redirect(path + url.search, await sessionCookie(session.e, session.exp, { pv: session.pv }));
  }
  // signed in: continue to the page
}

async function passwordMatches(given) {
  // Compare HMACs so the check takes the same time whatever is typed.
  const [a, b] = await Promise.all([hmac('pw:' + given), hmac('pw:' + process.env.SITE_PASSWORD)]);
  return a === b;
}

const passwordVersion = async () => (await hmac('pv:' + process.env.SITE_PASSWORD)).slice(0, 16);

async function requestLink(request, url) {
  const form = await request.formData().catch(() => null);
  const email = String((form && form.get('email')) || '').trim().toLowerCase();
  const next = safeNext(form && form.get('next'));
  const password = String((form && form.get('password')) || '');
  const back = '&next=' + encodeURIComponent(next);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return redirect('/signin?error=email' + back);
  if (!(await passwordMatches(password))) {
    await new Promise((r) => setTimeout(r, 1000)); // slow down guessing
    return redirect('/signin?error=password' + back);
  }
  try {
    if (await findReviewer(email)) {
      const nonce = crypto.randomUUID();
      const token = await sign({ k: 'l', e: email, exp: now() + LINK_TTL, n: nonce, t: next, pv: await passwordVersion() });
      const link = url.origin + '/auth?token=' + token;
      await airtable('POST', table('AIRTABLE_REQUESTS_TABLE', 'Access Requests'), {
        fields: { Email: email, Link: link, Nonce: nonce },
        typecast: true,
      });
    }
  } catch (e) {
    return redirect('/signin?error=unavailable');
  }
  // Same reply whether or not the email is approved, so the list can't be probed.
  return redirect('/signin?sent=1');
}

async function redeem(url) {
  const link = await readToken(url.searchParams.get('token'), 'l');
  if (!link) return redirect('/signin?error=expired');
  if (link.pv !== (await passwordVersion())) return redirect('/signin?error=changed');
  try {
    if (!(await findReviewer(link.e))) return redirect('/signin?error=revoked');
  } catch (e) {
    return redirect('/signin?error=unavailable');
  }
  try {
    const tbl = table('AIRTABLE_REQUESTS_TABLE', 'Access Requests');
    const rec = await findOne(tbl, "{Nonce}='" + esc(link.n) + "'");
    if (rec && !rec.fields['Opened at']) {
      await airtable('PATCH', tbl + '/' + rec.id, { fields: { 'Opened at': new Date().toISOString() }, typecast: true });
    }
  } catch (e) {} // logging failure shouldn't block sign-in
  return redirect(safeNext(link.t), await sessionCookie(link.e, now() + SESSION_TTL, { pv: link.pv }));
}

// Airtable
const table = (key, fallback) => encodeURIComponent(process.env[key] || fallback);
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
const findReviewer = (email) =>
  findOne(table('AIRTABLE_REVIEWERS_TABLE', 'Reviewers'), "AND(LOWER(TRIM({Email}))='" + esc(email) + "',{Approved})");

async function findOne(tbl, formula) {
  const q = new URLSearchParams({ filterByFormula: formula, maxRecords: '1' });
  const data = await airtable('GET', tbl + '?' + q.toString());
  return (data.records && data.records[0]) || null;
}

async function airtable(method, path, body) {
  const res = await fetch('https://api.airtable.com/v0/' + process.env.AIRTABLE_BASE_ID + '/' + path, {
    method,
    headers: { Authorization: 'Bearer ' + process.env.AIRTABLE_TOKEN, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error('Airtable ' + res.status);
  return res.json();
}

// Signed tokens (HMAC-SHA256)
const enc = new TextEncoder();
const now = () => Math.floor(Date.now() / 1000);
let keyPromise;
const key = () =>
  keyPromise || (keyPromise = crypto.subtle.importKey('raw', enc.encode(process.env.SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));

async function hmac(text) {
  return b64(new Uint8Array(await crypto.subtle.sign('HMAC', await key(), enc.encode(text))));
}

async function sign(payload) {
  const body = b64(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', await key(), enc.encode(body));
  return body + '.' + b64(new Uint8Array(sig));
}

async function readToken(token, kind) {
  if (!token || token.indexOf('.') < 0) return null;
  const [body, sig] = token.split('.');
  try {
    const ok = await crypto.subtle.verify('HMAC', await key(), unb64(sig), enc.encode(body));
    if (!ok) return null;
    const p = JSON.parse(new TextDecoder().decode(unb64(body)));
    return p.k === kind && p.exp > now() ? p : null;
  } catch (e) {
    return null;
  }
}

const b64 = (bytes) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64 = (s) =>
  Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));

// Cookies and responses
async function sessionCookie(email, exp, extra) {
  const token = await sign(Object.assign({ k: 's', e: email, exp, c: now() }, extra));
  return COOKIE + '=' + token + '; Path=/; Max-Age=' + Math.max(0, exp - now()) + '; HttpOnly; Secure; SameSite=Lax';
}
const clearCookie = () => COOKIE + '=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax';

function getCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

function safeNext(v) {
  const s = String(v || '');
  return s.startsWith('/') && !s.startsWith('//') && !s.startsWith('/\\') ? s : '/';
}

const baseHeaders = () => ({ 'Cache-Control': 'no-store', 'X-Robots-Tag': NOINDEX });

function redirect(location, cookie) {
  const headers = Object.assign(baseHeaders(), { Location: location });
  if (cookie) headers['Set-Cookie'] = cookie;
  return new Response(null, { status: 303, headers });
}
