# PhD Map — European Astrophysics & Cosmology PhD Navigator

Interactive Leaflet map, searchable directory, and application Kanban tracker for European astrophysics and cosmology PhD openings, universities, and research supervisors.

## Repository Structure

```text
├── .github/
│   └── workflows/
│       └── deploy.yml          # GitHub Actions build & GitHub Pages deployment
├── data.json                   # Primary dataset (universities, openings, supervisors)
├── public/
│   ├── .nojekyll                # Disables Jekyll processing on GitHub Pages
│   └── detail.json              # Lazy-loaded research descriptions & summaries
├── src/
│   ├── app.js                   # Entry point, filters, cards & Kanban board
│   ├── calendar.ts              # Firebase Auth, Google Calendar API & reminder modals
│   ├── data.js                  # App config, utilities, dataset & localStorage store
│   ├── style.css                # Application styles, dark mode & mobile layout
│   └── views.js                 # Map, detail drawer, accounts, notes & JSON importer
├── firebase-applet-config.json  # Firebase Web SDK configuration
├── index.html                   # HTML shell
├── package.json
└── vite.config.js               # Vite config (`base: './'` + root `data.json` emission)
```

## Local Development

```bash
npm install
npm run dev
```

Build and preview the production bundle locally:

```bash
npm run build
npm run preview
```

## Deploying to GitHub Pages

1. Push this repository to GitHub on the `main` branch.
2. Open **Settings → Pages** in your GitHub repository.
3. Under **Build and deployment → Source**, select **GitHub Actions**.
4. The workflow in `.github/workflows/deploy.yml` builds `dist/` via Vite and publishes it automatically on every push to `main`.

### Optional: Google Sign-In & Calendar Sync on GitHub Pages
Local features (map, filters, `Naman`/`Peehu` local accounts, notes, Kanban board, JSON importer) work immediately on any static host. To enable **Sign in with Google** and **Google Calendar** sync on your `*.github.io` URL:

- Add `<your-username>.github.io` (or your custom domain) under **Firebase Console → Authentication → Settings → Authorized domains** for the configured Firebase project.