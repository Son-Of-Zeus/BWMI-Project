# Settled Input Completion

## Goal

Avoid advancing a form workflow on the first keystroke while keeping input
observation responsive and data-minimized.

## Current Extension Implementation

`apps/extension/interaction/interaction-observer.ts` coalesces text-input
events with a 250 ms default debounce and cancels the prior timer when another
keystroke arrives. A `change` event flushes the pending completion immediately;
`inputCompletionDebounceMs` can be set to zero for deterministic tests or an
alternate deployment policy. Select controls continue to complete on change.

Run the focused test from `apps/extension/` with:

```sh
npm test -- --run interaction/interaction-observer.test.ts
```

## Safety Boundary

- no input value is stored in the timer or emitted in the event
- stale timers are cleared on replacement and observer teardown
- validation-aware matching still blocks empty or invalid controls
- the observer never edits or submits the form

## Definition of Done

Typing produces one settled semantic completion after the user pauses or
commits the field, without advancing the workflow on every keystroke.
