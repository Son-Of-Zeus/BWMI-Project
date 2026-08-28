# React + Vite

## Hosted voice companion demo

The portal routes remain unchanged. Each page displays the shared prototype
disclaimer and synthetic-data notice. The root app mounts the existing voice
companion in an isolated Shadow DOM so the jury can open the hosted site without
installing a Chrome extension.

### Local development

Run the site from this directory:

```sh
npm install
npm run dev
```

When `VITE_VOICE_COMPANION_BACKEND_URL` is not set, the embedded companion uses
the local backend at `http://127.0.0.1:8787`. Copy `.env.example` and set the
variable for a hosted deployment.

### Vercel deployment

Create a Vercel project with this directory as its root:

```text
/Users/vpranav/Desktop/Dev/BuildWhatMovesIndia/pf-voice-companion-readmes/test site
```

Use `npm run build` as the build command and `dist` as the output directory.
The included `vercel.json` preserves the React Router SPA fallback for direct
loads of `/dashboard` and other portal routes.
Set `VITE_VOICE_COMPANION_BACKEND_URL` to the backend project's public `/api`
URL, for example `https://voice-companion-api.vercel.app/api`. This variable is
public by design; provider credentials belong only to the backend project.

The deployed site must use HTTPS so the browser can grant microphone access.

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
