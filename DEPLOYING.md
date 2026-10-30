# Deploying the Brilliant AI website

The site runs on Vercel, with the code held on GitHub. Visitors need both of these to get in:

- **The site password:** one shared password you give out.
- **An approved email:** they finish signing in with a link sent to that address. Only emails you approve in Airtable get a link.

A leaked password alone isn't enough, and neither is an approved email alone. GitHub, Vercel and Airtable free plans all work.

## What's in the package

- `index.html`, `what-we-do.html`, `how-we-work.html`, `experience.html` (the four pages)
- `signin.html` (the sign-in page)
- `support.js` (renders the pages; keep it at the top level)
- `assets/` (logos)
- `middleware.js` (the access gate; runs on Vercel's servers before any page is sent)
- `vercel.json` (clean page addresses, and headers telling search engines not to index)
- `robots.txt` (tells search engines not to crawl)
- `README.md` (this guide)

## How sign-in works

1. A visitor opens the site and is sent to the sign-in page.
2. They enter their email and the site password. A wrong password is rejected straight away, with a short delay to slow down guessing. If the password is right and the email is ticked as Approved in Airtable, a new row is added to the Access Requests table, and an Airtable automation emails them the link.
3. The link works for one hour. Opening it signs them in for 7 days and records the time in Airtable.
4. Untick someone in Airtable and they lose access within an hour.
5. Change `SITE_PASSWORD` and redeploy, and everyone is signed out. Unused links stop working too.

Someone who has the password and can read an approved reviewer's inbox can get in. This suits named reviewers, but isn't enough protection for highly sensitive material.

## 1. Put the code on GitHub

1. On github.com, click **+** (top right), then **New repository**. Name it, leave "Add a README" unticked, and click **Create repository**.
2. Click **uploading an existing file**. Select everything inside the `brilliant-site` folder (not the folder itself) and drag it onto the page.
3. Check that `assets` appears as a folder. Click **Commit changes**.

If the repo already exists, use **Add file → Upload files** and upload the changed files instead.

## 2. Set up Airtable

### Create the base
1. On airtable.com, create a new base from scratch. Name it e.g. `Brilliant site access`.
2. Copy the base ID from the address bar. It's the part starting with `app`, e.g. `appAbC123xyz`.

### Table 1: Reviewers
Rename the first table to exactly `Reviewers` and set up these fields (names must match exactly):

| Field | Type |
|---|---|
| Email | Email |
| Name | Single line text |
| Approved | Checkbox |

Add a row for each person who should have access, with Approved ticked. Include yourself.

### Table 2: Access Requests
Add a second table named exactly `Access Requests` with these fields:

| Field | Type |
|---|---|
| Email | Email |
| Link | URL |
| Nonce | Single line text |
| Requested at | Created time |
| Opened at | Date (turn on "Include time") |

Delete any blank rows Airtable creates.

### The email automation
1. Click **Automations** (top of the base), then **Create automation**.
2. Trigger: **When a record is created**, Table: **Access Requests**.
3. Add action: **Send email**.
   - **To:** click **+**, choose the trigger record's **Email** field.
   - **Subject:** `Your link to the Brilliant AI site`
   - **Message:** e.g. `Here's your sign-in link. It works for one hour.` then click **+** and insert the **Link** field.
4. Click **Test action**, then turn the automation **On**.

### Create an access token
1. Go to airtable.com/create/tokens and click **Create token**.
2. Name it `Brilliant site`.
3. Scopes: add `data.records:read` and `data.records:write`.
4. Access: add the `Brilliant site access` base.
5. Click **Create token** and copy it. You only see it once.

## 3. Set up Vercel

1. If the project doesn't exist yet: on vercel.com click **Add New… → Project**, import the repo, set Framework Preset to **Other**, leave build settings empty, and deploy.
2. Go to **Settings → Environment Variables** and add all four, ticking **Production** and **Preview** for each:

| Key | Value |
|---|---|
| `SESSION_SECRET` | A long random string, 40+ characters. Generate it with a password manager. Don't reuse a password. |
| `SITE_PASSWORD` | The password you give to visitors |
| `AIRTABLE_TOKEN` | The token from step 2 |
| `AIRTABLE_BASE_ID` | The base ID starting with `app` |

3. If you previously set `SITE_USERNAME`, delete it. It's no longer used.
4. Go to **Deployments**, open the **⋯** menu on the latest deployment, and click **Redeploy**.

## 4. Check it works

1. Open the site in a private browser window. You should land on the sign-in page.
2. Enter an approved email with a wrong password. You should see "That password isn't right".
3. Enter an approved email with the right password. The email should arrive within a minute (check spam). A row appears in Access Requests.
4. Open the link. You should see the homepage, and Opened at fills in.
5. Try an email that isn't in Reviewers, with the right password. The page says the same thing, but no email is sent.
6. Visit `/signout` to sign out.
If you see "Site access is not configured", one of the four variables is missing, or you haven't redeployed since adding it.

## Managing access

- **Add someone:** add a row in Reviewers with Approved ticked.
- **Remove someone:** untick Approved. They lose access within an hour.
- **Change the password:** edit `SITE_PASSWORD` in Vercel and redeploy. Everyone has to sign in again with the new one.
- **Sign everyone out at once:** change `SESSION_SECRET` in Vercel and redeploy.
- **Audit log:** the Access Requests table shows each link requested and when it was first opened. Some work email systems open links automatically to scan them, which can fill in Opened at before the person clicks.

## Limits

- The Airtable free plan includes a limited number of automation runs per month. Each link request uses one.
- Emails are sent by Airtable, so they may land in spam the first time. Ask reviewers to mark them as not spam.

## Making changes later

- **Update the site:** edit or re-upload files in the GitHub repo. Vercel redeploys automatically on each commit.
- **Use your own domain:** Vercel project → **Settings → Domains**.

## Preview locally (optional)

Open a terminal in the folder and run `npx serve .`. The access gate only runs on Vercel, so you won't see it locally.
