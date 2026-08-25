# Loading Latency Treatment

## Goal

Keep the voice-first interaction understandable when reasoning or speech
services take longer than the normal response window.

## Current Extension Implementation

`apps/extension/runtime/extension-runtime.ts` starts a latency timer whenever
the companion enters `thinking` or `speaking`. After the default 1.2-second
threshold, the companion keeps its busy state but announces `Still working…`
and exposes a slow-latency data state. The threshold is injectable for
deterministic tests and the notice clears on completion, cancellation, reset,
or teardown.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run runtime/extension-runtime.test.ts companion/Companion.test.tsx
```

## Interaction Rules

- microphone capture remains `Listening…`; it never implies backend progress
- reasoning and speech show their normal state before the delayed notice
- the notice does not fake progress, add a transcript, or trigger an action
- `aria-busy` remains true until the active operation actually settles

## Definition of Done

A user receives calm, accessible feedback during a slow model or speech
operation and returns to the correct waiting, success, error, or idle state
without stale latency messaging.
