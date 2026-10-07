# Home Coach

Static, dependency-free guided workout player (HTML/CSS/JS, no build step, no CDN).

- `index.html`, `style.css`, `figures.js`, `app.js`: the app
- `sessions.js`: **all session definitions** (edit this to change routines; block types documented at the top)
- `build.py`: inlines everything into one self-contained `dist/index.html`
- `tests/`: headless-Chrome checks (Playwright) used during development

## URLs
- `?s=pelvic&w=1`: Core & pelvic floor (week 1-2: 5 s hold, 3-4: 8 s, 5+: 10 s)
- `?s=workout`: Home full-body, week 1
- `?s=breaks`: 3-minute desk reset
- Debug: add `&speed=10` to run timers 10x faster.

## Run locally
    python3 -m http.server 8000   # then open http://localhost:8000/?s=pelvic&w=1

## Deploy
Any static host works: GitHub Pages (main branch, root), Netlify Drop, Cloudflare Pages, Vercel.
For a single file, upload `dist/index.html` (re-run `python3 build.py` after edits).
