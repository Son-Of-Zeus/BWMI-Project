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

Every live run also records actual durations for microphone recording, speech
recognition, semantic scanning, reasoning, page/layout settling, companion
movement, speech synthesis, and audio playback. The compact companion shows
the measured total with an expandable per-stage breakdown. Each measurement is
also emitted to the browser console as `[Voice Companion latency]` so repeated
runs can be compared while optimizing provider and UI delays. Recording and
playback are shown separately because they include user/audio duration and are
not backend processing latency.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run runtime/extension-runtime.test.ts companion/Companion.test.tsx
```

## Interaction Rules

- microphone capture remains `Listening…`; it never implies backend progress
- reasoning and speech show their normal state before the delayed notice
- a new voice run clears the previous measurement breakdown
- measurements are bounded to the latest 12 stages and contain no form values
- the notice does not fake progress, add a transcript, or trigger an action
- `aria-busy` remains true until the active operation actually settles

## Definition of Done

A user can see which stage consumed the time, compare the same stage in the
browser console across runs, and returns to the correct waiting, success,
error, or idle state without stale latency messaging.
