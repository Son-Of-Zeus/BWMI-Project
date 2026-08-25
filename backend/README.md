# Backend APIs

## Goal

Keep provider secrets and external AI calls outside the Chrome extension.

The backend is a deliberately small prototype boundary. It uses Node's built-in
HTTP server and has no runtime dependencies or database.

## Run and test

From `backend/`:

```sh
npm test     # run the HTTP and adapter contract tests
npm start    # run LiteLLM/Sarvam-backed API on 127.0.0.1:8787
PROTOTYPE_MODE=true npm start  # use deterministic adapters without provider keys
```

Set `PORT`, `HOST`, or a comma-separated `ALLOWED_ORIGINS` when needed. The
normal server uses a LiteLLM OpenAI-compatible `/chat/completions` endpoint for
reasoning and Sarvam REST APIs for speech. Configure `LITELLM_BASE_URL`,
`LITELLM_MODEL`, optional `LITELLM_API_KEY`, and `SARVAM_API_KEY`; Sarvam model,
speaker, and language settings are also environment-configurable. Provider
secrets stay in the backend process and never enter the extension bundle.

`PROTOTYPE_MODE=true` explicitly selects the deterministic adapters: a PF
transcript for the first voice turn, an “I'm done” transcript for the next
voice turn, silent WAV synthesis, and local target-selection heuristics. This
mode is retained for offline UI tests only and is not the final MVP path; real
spoken phrases require the provider-backed STT adapter.

The implementation is split into `src/contracts.js` (validation),
`src/litellm-adapter.js` (reasoning), `src/sarvam-adapters.js` (speech),
`src/prototype-adapters.js` (offline behavior), and `src/server.js` (HTTP
transport). The backend test files cover transport, provider request shapes,
response mapping, and safety boundaries.

## Endpoints

```text
POST /reason
POST /speech/transcribe
POST /speech/synthesize
```

## `/reason`

Input:

```json
{
  "userUtterance": "Mujhe PF ka paisa nikalna hai",
  "userLanguage": "hi-IN",
  "session": {
    "goal": "PF withdrawal",
    "recentActions": []
  },
  "page": {
    "title": "Member Dashboard",
    "elements": [
      {
        "id": "el_17",
        "role": "button",
        "label": "Online Services",
        "visible": true,
        "disabled": false
      }
    ]
  }
}
```

Output must match the strict `GuideAction` schema.

## `/speech/transcribe`

Accept recorded audio and forward it to Sarvam STT.

Return a provider-neutral result:

```json
{
  "transcript": "Mujhe PF ka paisa nikalna hai",
  "language": "hi-IN"
}
```

## `/speech/synthesize`

Input:

```json
{
  "text": "Online Services par click kariye.",
  "language": "hi-IN"
}
```

Return playable audio.

## Security

- strict allow-listed JSON fields reject raw DOM references and executable text
- `/reason`, JSON speech, and binary audio bodies have bounded sizes
- target IDs are checked against the current semantic element list
- consequential guide actions must include a short consequence explanation
- CORS can be restricted to extension/demo origins with `ALLOWED_ORIGINS`
- the server does not log request bodies or expose a prompt/tool execution API
- provider keys belong in server environment variables when real adapters are added

## Deployment

The current prototype is local-only: the mock portal is expected at
`http://localhost:5173` and the backend at `http://127.0.0.1:8787`. Deployment
is intentionally deferred. A later deployment must be compatible with:

- HTTPS
- low latency
- environment secrets
- binary audio requests/responses

No database is needed for MVP.

## Definition of Done

The extension can call LiteLLM and Sarvam through this boundary without
exposing any third-party API key in its distributed bundle. Prototype
reliability is sufficient for the local demo; authentication, retries,
persistence, and production observability remain deferred with deployment.
