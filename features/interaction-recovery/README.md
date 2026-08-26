# Unexpected-Action Recovery

## Goal

Keep active guidance stable while the user interacts with the page, and only
advance when the expected action or a real navigation is observed.

## Current Extension Implementation

`apps/extension/flow/flow-controller.ts` ignores unmatched semantic clicks and
text-entry events, leaving the current highlight, pending target, and workflow
phase intact. This prevents a normal click into a guided input from looking
like a request to stop the assistant. Matched actions and navigation continue
through the normal transition path. The website's event is never prevented.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run flow/flow-controller.test.ts interaction/interaction-observer.test.ts
```

## Safety Boundary

- unmatched actions remain fully user-controlled and do not stop guidance
- no click, input, or select is replayed by the extension
- text-input guidance remains pending until explicit voice completion
- matched actions and navigation still use the live registry and redaction

## Definition of Done

Clicking or typing in the page does not dismiss active guidance. The assistant
advances only after the expected action/navigation, or stops through an
explicit companion action, reset, or teardown.
