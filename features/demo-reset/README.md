# Demo Reset

## Goal

Give a presenter one explicit control to return the extension to a fresh,
idle workflow without changing the website.

## Current Extension Implementation

The reset button is rendered by `apps/extension/companion/Companion.tsx` and is
wired through `companion-ui.ts`, `extension-runtime.ts`, and the flow
controller. Reset cancels microphone capture, speech playback, guidance, and
stale asynchronous work; clears session and registry context; rescans the
current page; and returns the companion to `idle`.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run flow/flow-controller.test.ts runtime/extension-runtime.test.ts companion/Companion.test.tsx
```

## Boundary

- the reset action is a real, keyboard-focusable extension button
- reset does not click, submit, navigate, reload, or mutate page controls
- the current page remains available as fresh semantic context after reset
- late results from the previous request cannot restore waiting or success state

## Definition of Done

A demo operator can stop a partial journey and immediately begin again with no
stale goal, pending action, transcript, highlight, or audio operation left in
the extension.
