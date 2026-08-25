# Development Diagnostics

## Goal

Make extension behavior inspectable during development without leaking DOM
references, sensitive values, or debug UI into the demo.

## Current Extension Implementation

`apps/extension/runtime/extension-runtime.ts` accepts two opt-in boundaries:
`development: { enabled: true }` selects injected development transcripts and a
mock reasoner, while `debug: { enabled: true }` emits cloned semantic snapshots
and numeric target rectangles through an injectable logger. Both are disabled
by default. Snapshot events contain model-safe elements only; target events
contain no `HTMLElement` references.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run runtime/extension-runtime.test.ts
```

## Safety Boundary

- development adapters are never selected unless the flag is explicit
- debug events are opt-in and can be routed to a test logger instead of the console
- semantic events exclude DOM nodes and control values
- target-box events expose only IDs and viewport geometry
- diagnostics do not add controls, overlays, or behavior to the website

## Definition of Done

A developer can inspect the semantic page and target geometry or run a
deterministic mock voice/reasoning loop, while a normal extension install stays
quiet and production-oriented.
