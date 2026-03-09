# cmate (web)

Web version of **cmate**: use your device camera to **read text aloud**. No app store, no Apple/Google developer account, no native build. Works in a modern browser on desktop or phone.

- **Camera**: browser `getUserMedia` (must use HTTPS or localhost)
- **OCR**: [Tesseract.js](https://github.com/naptha/tesseract.js) (runs in the browser, no server needed)
- **Read aloud**: Web Speech API (`speechSynthesis`)

## Run locally

```bash
cd web
npm install
npm run dev
```

Open the URL shown (e.g. `http://localhost:5173`) in your browser. On a phone, use the same URL on the same Wi‑Fi network (or deploy somewhere with HTTPS).

**Camera:** Browsers require a secure context (HTTPS or `localhost`) to access the camera. Allow camera access when prompted.

## Build for production

```bash
npm run build
```

Output is in `dist/`. Serve that folder with any static host (Vercel, Netlify, GitHub Pages, etc.).

### Deploy on Netlify

This repo includes a `netlify.toml` at the **repo root** so Netlify builds the web app from the `web/` folder.

1. Push the repo to GitHub (or GitLab/Bitbucket).
2. In [Netlify](https://app.netlify.com): **Add new site → Import an existing project**.
3. Connect the repo. Netlify will use the root `netlify.toml`; no need to set Base directory—the config sets `base = "web"`.
4. Deploy. The site will be built with `npm run build` in `web/` and published from `web/dist`.

Your app will be served over **HTTPS**, so the camera will work on phones when they open the Netlify URL.

## Compared to the Expo app

| | Web app | Expo (native) |
|--|--------|----------------|
| Cost | Free, no account needed | Dev build: free; App Store: needs Apple dev account |
| OCR | Tesseract.js (good, not as accurate as native ML) | ML Kit / Apple Vision (very accurate) |
| Run on iPhone | Open in Safari (or Chrome); add to Home Screen for app-like use | Install dev build or Expo Go |

Use the web app when you want to avoid native builds and accounts; use the Expo app when you want best OCR and a full native experience.
