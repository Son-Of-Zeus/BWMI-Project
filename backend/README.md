# Backend APIs

## Goal

Keep provider secrets and external AI calls outside the Chrome extension.

The backend is a deliberately small prototype boundary. It uses Node's built-in
HTTP server and has no runtime dependencies or database.

## Run and test

From `backend/`:

```sh
npm test     # run the HTTP and adapter contract tests
npm start    # run Groq/Sarvam-backed API on 127.0.0.1:8787
PROTOTYPE_MODE=true npm start  # use deterministic adapters without provider keys
```

When started with `npm start`, the backend automatically loads `backend/.env`
if it exists. Shell environment variables still take precedence. Set `PORT`,
`HOST`, or a comma-separated `ALLOWED_ORIGINS` when needed. The normal server
calls Groq's OpenAI-compatible Chat Completions endpoint directly for
reasoning and Sarvam REST APIs for speech. Configure `GROQ_API_KEY`, with
optional `GROQ_MODEL` and `GROQ_API_BASE_URL` overrides. The default Groq model
is `openai/gpt-oss-120b`; Sarvam model, speaker, and language settings are also
environment-configurable. Speech requests automatically retry transient
network, rate-limit, and upstream server failures up to three times, respecting
the provider's `Retry-After` value when present. Reasoning requests use the
Node HTTPS transport with IPv4 preference and the same bounded retry behavior;
when no usable header is provided, the configured exponential fallback is used.
Permanent provider rejections are returned without retrying. The Groq adapter uses strict
structured output for `openai/gpt-oss-120b`; the model must include a generic
intent-readiness assessment before it can return `guide`. If that assessment
reports missing or ambiguous information, the adapter safely returns
`clarify`, even if the model selected a target. Consequence-aware validation
still remains a server-side safety gate. Groq response/error logs include an
operation ID, readiness state, bounded requirement counts/names, response keys,
target safety classification, and consequence presence/length, but never the
prompt, user utterance, or spoken text. Groq prompt caching is automatic for
GPT-OSS-120B when requests share an exact prefix; the stable system prompt is
kept first, and response logs expose `promptTokens`, `cachedPromptTokens`, and
`promptCacheHit` so cache hits can be verified without logging prompt content.
Sarvam retry and terminal
error logs include an operation ID and a safe reason such as `invalid-json`,
`empty-audios`, `invalid-base64`, or `transport`. Set
`SARVAM_LOG_RESPONSES=true` to log parsed STT and TTS provider responses
(including error bodies) in the backend console. TTS audio is logged as a
compact base64-length summary instead of the full audio payload. STT logs can
contain transcripts and timestamps, so disable them after debugging.
Provider secrets stay in the backend process and never enter the extension
bundle.

`PROTOTYPE_MODE=true` explicitly selects the deterministic adapters: a PF
transcript for the first voice turn, an “I'm done” transcript for the next
voice turn, silent WAV synthesis, and local target-selection heuristics. This
mode is retained for offline UI tests only and is not the final MVP path; real
spoken phrases require the provider-backed STT adapter.

The implementation is split into `src/contracts.js` (validation),
`src/groq-adapter.js` (reasoning), `src/sarvam-adapters.js` (speech),
`src/prototype-adapters.js` (offline behavior), and `src/server.js` (HTTP
transport). The backend test files cover transport, provider request shapes,
response mapping, and safety boundaries.

When the Groq adapter is active, the backend logs `[Groq call]` immediately
before each upstream reasoning request and `[Groq response]` after a parsed
response. It also coalesces identical in-flight requests and reuses a
successful response for a short two-second window; these events are logged as
`[Groq dedupe]` with `reason: "in-flight"` or `reason: "recent-response"`.
The `requestSignature` is a short one-way fingerprint for correlating duplicate
requests and is not the request content. The associated metadata contains only
the model, operation ID, bounded workflow status/counts/names, element count,
and consequence-target IDs/types; it does not log the prompt, page labels, user
utterance, API key, or spoken text. Workflow names in diagnostics are redacted
for likely email, currency, phone, and long-number values.

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

Output must match the strict `GuideAction` schema and include the generic
`workflow` assessment:

```json
{
  "action": "clarify",
  "targetId": null,
  "spokenInstruction": "Which option do you need?",
  "consequence": null,
  "expectedUserAction": null,
  "language": "en-IN",
  "workflow": {
    "intent": "complete the requested task",
    "requiredInformation": ["option"],
    "knownInformation": [],
    "missingInformation": ["option"],
    "readiness": "needs_clarification",
    "clarifyingQuestion": "Which option do you need?"
  }
}
```

`guide` is accepted only when `workflow.readiness` is `ready` and
`missingInformation` is empty. Requirement arrays contain names/categories,
not user values. The extension retains this bounded status between voice turns
so the model can continue a multi-turn clarification safely.

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

The extension can call Groq and Sarvam through this boundary without
exposing any third-party API key in its distributed bundle. Prototype
reliability is sufficient for the local demo; authentication, retries,
persistence, and production observability remain deferred with deployment.
