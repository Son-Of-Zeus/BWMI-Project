# Backend APIs

## Goal

Keep provider secrets and external AI calls outside the Chrome extension.

The backend is a deliberately small prototype boundary. It uses Node's built-in
HTTP server and has no runtime dependencies or database.

## Run and test

From `backend/`:

```sh
npm test     # run the HTTP and adapter contract tests
npm start    # listen on 127.0.0.1:8787
```

Set `PORT`, `HOST`, or a comma-separated `ALLOWED_ORIGINS` when needed. The
default adapters are deterministic demo adapters: STT returns the sample PF
transcript, TTS returns a short silent WAV, and reasoning selects targets from
the supplied semantic snapshot. They keep the extension demo usable without
provider credentials; real LLM/Sarvam adapters can be injected at the same
interfaces later.

The implementation is split into `src/contracts.js` (validation),
`src/prototype-adapters.js` (demo behavior), and `src/server.js` (HTTP
transport). `test/server.test.js` covers the public routes and safety boundary.

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

Use the simplest deployment compatible with:

- HTTPS
- low latency
- environment secrets
- binary audio requests/responses

No database is needed for MVP.

## Definition of Done

The extension can call reasoning and voice services through this boundary
without exposing any third-party API key in its distributed bundle. Prototype
reliability is sufficient for the demo; retries, authentication, persistence,
and production observability are intentionally out of scope.
