# Prototype Backend API

## Goal

Keep reasoning and speech provider boundaries outside the Chrome extension while
preserving the extension's small, provider-neutral contracts.

## Current implementation

`backend/src/server.js` exposes `POST /reason`, `POST /speech/transcribe`, and
`POST /speech/synthesize`. `backend/src/contracts.js` validates semantic-only
requests, strict `GuideAction` responses, language hints, consequence text, and
bounded speech payloads. Raw DOM references, disabled targets, unknown target
IDs, and executable instruction text are rejected.

The default adapters are deterministic prototype behavior: reasoning selects
from the supplied semantic snapshot, transcription returns the sample PF
transcript, and synthesis returns a short silent WAV. Provider-specific LLM,
Sarvam STT, and TTS clients can replace these adapters without changing the
HTTP contract or extension code.

Run the backend tests from `backend/`:

```sh
npm test
```

## Safety boundary

The backend may recommend a target, but the extension validates the response
again and the user performs every click, input, selection, consent, OTP, and
financial action. Request bodies are not logged. CORS is configurable through
`ALLOWED_ORIGINS`; prototype authentication, persistence, retries, and
production observability are intentionally out of scope.
