# Brilliant AI website

Static site. No build step.

## Pages
- `/` → index.html
- `/what-we-do` → what-we-do.html
- `/how-we-work` → how-we-work.html
- `/experience` → experience.html

## Deploy on Vercel
1. Push this folder to a new GitHub repo (the files sit at the repo root).
2. In Vercel: Add New → Project → import the repo.
3. Framework preset: **Other**. Leave build command and output directory empty.
4. Deploy.

`vercel.json` enables clean URLs (no .html).

## Preview locally
Links are root-relative, so serve the folder rather than opening files directly:
`npx serve .`

## Notes
- `support.js` is the runtime that renders each page in the browser. Keep it at the root.
- Fonts load from Google Fonts (Manrope, Inter).
- The "Start a conversation" buttons point to the closing section on each page. Wire them to a contact form or mailto when ready.
