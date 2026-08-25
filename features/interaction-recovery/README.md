# Unexpected-Action Recovery

## Goal

Keep the extension resilient when the user chooses a different visible
control than the one currently highlighted.

## Current Extension Implementation

`apps/extension/flow/flow-controller.ts` clears stale guide overlays when the
interaction observer reports an unmatched semantic action, preserves the
pending workflow target, waits for the page to settle, and reasons again from
the current semantic snapshot. Matched actions and navigation continue to use
the normal transition path. The website's event is never prevented.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run flow/flow-controller.test.ts interaction/interaction-observer.test.ts
```

## Safety Boundary

- unexpected actions remain fully user-controlled
- no click, input, or select is replayed by the extension
- the pending goal is retained for recovery, but stale visual guidance is cleared
- the next reasoning request still uses the live registry and existing redaction

## Definition of Done

An unmatched semantic action triggers a fresh reasoning pass against the
current page without blocking the user's action or losing the active workflow.
