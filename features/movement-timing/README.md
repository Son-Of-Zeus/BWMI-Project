# Movement Timing

## Goal

Make the companion's visual pointer and spoken instruction feel like one calm
guidance step.

## Current Extension Implementation

`apps/extension/guide/guide-controller.ts` waits for the companion and
highlight transition to settle before starting speech. The default wait is
520ms, matching the cursor's eased travel duration so it settles before
speech begins;
reduced-motion preferences
bypass the delay. The wait is injectable for deterministic tests and is
cancellation-aware, so a new request cannot speak after movement was canceled.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run guide/guide-controller.test.ts runtime/extension-runtime.test.ts
```

## Interaction Rules

- target placement and highlighting happen before the wait begins
- only the cursor moves; the status panel remains docked
- speech starts only after movement settles
- reduced-motion users do not receive an artificial animation delay
- cancellation during movement clears guidance and prevents speech

## Definition of Done

A user sees the companion arrive beside the target before hearing the short
instruction, without delayed or stale speech after a canceled request.
