# Prototype Backend API

## Goal

Keep reasoning and speech provider boundaries outside the Chrome extension while
preserving the extension's small, provider-neutral contracts.

## Current implementation

`backend/src/server.js` exposes `POST /reason`, `POST /speech/transcribe`, and
`POST /speech/synthesize`. The normal adapters call Groq's OpenAI-compatible
Chat Completions endpoint and Sarvam's REST STT/TTS endpoints. Groq requests
honor the provider's `Retry-After` header and coalesce duplicate in-flight or
immediately repeated requests. `backend/src/contracts.js` validates
semantic-only requests, strict `GuideAction` responses, language hints,
consequence text, generic intent-readiness metadata, and bounded speech
payloads. Raw DOM references, disabled guide targets, unknown target IDs,
missing conversational prerequisites, and executable instruction text are
rejected. Empty page-entry fields are guided as manual textbox actions.

Set `PROTOTYPE_MODE=true` to use deterministic offline adapters. The normal
server requires `GROQ_API_KEY`, `GROQ_MODEL` is optional, and
`SARVAM_API_KEY`; provider-specific details stay behind the same HTTP contract
and extension code.

Run the backend tests from `backend/`:

```sh
npm test
```

## Safety boundary

The backend may recommend a target, but the extension validates the response
again and the user performs every click, input, selection, consent, OTP, and
financial action. Request bodies are not logged. CORS is configurable through
`ALLOWED_ORIGINS`; deployment authentication, persistence, retries, and
production observability are intentionally deferred.
