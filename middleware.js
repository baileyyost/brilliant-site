// Password gate for the whole site (Vercel Routing Middleware).
// Set SITE_PASSWORD in Vercel → Settings → Environment Variables.
// Optional: SITE_USERNAME (defaults to accepting any username).

const NOINDEX = 'noindex, nofollow, noarchive, nosnippet';

export default function middleware(request) {
  const password = process.env.SITE_PASSWORD;
  const username = process.env.SITE_USERNAME;

  if (!password) {
    return new Response('Site password not configured.', { status: 503, headers: { 'X-Robots-Tag': NOINDEX } });
  }

  const header = request.headers.get('authorization') || '';
  if (header.startsWith('Basic ')) {
    try {
      const decoded = atob(header.slice(6));
      const i = decoded.indexOf(':');
      const user = decoded.slice(0, i);
      const pass = decoded.slice(i + 1);
      if (safeEqual(pass, password) && (!username || safeEqual(user, username))) {
        return; // authorised: continue to the page
      }
    } catch (e) {}
  }

  return new Response('Password required.', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Brilliant AI", charset="UTF-8"',
      'X-Robots-Tag': NOINDEX,
      'Cache-Control': 'no-store',
    },
  });
}

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
