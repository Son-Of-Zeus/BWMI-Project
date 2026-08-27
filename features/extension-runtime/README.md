# Extension Runtime

## Goal

Compose the extension-owned services at the content-script boundary and give
the companion a clean lifecycle.

## Current Extension Implementation

`apps/extension/runtime/extension-runtime.ts` constructs the scanner, registry,
session, interaction observer, voice controller, guide controller, and PF flow
controller. It binds the companion microphone to `requestVoice()`, binds the
demo-reset control to the flow reset boundary, maps runtime states into the UI,
announces slow reasoning or speech after a bounded latency threshold, and
routes an error-state microphone press to transcript-aware flow retry. It
accepts injected adapters for deterministic tests or a different backend
deployment; the guide defaults to the companion's 520ms movement timing while
allowing tests and deployments to inject a deterministic wait. An explicit
development flag selects mock transcript/reasoner adapters, while a separate
debug flag emits safe semantic snapshots and target rectangles.

`entrypoints/content/index.tsx` starts the runtime when the Shadow DOM mounts
and stops it before teardown. Reasoning defaults to `/reason`, speech defaults
to the provider-neutral speech paths, and no provider credentials are stored
in the extension.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run runtime/extension-runtime.test.ts
```

## Lifecycle

```text
mount → create services → start scanner/observer → listen → flow → stop
```

Teardown removes the microphone handler, cancels active speech and guidance,
and stops DOM observers before the Shadow DOM is removed.

## Definition of Done

Installing the extension mounts a working companion runtime without adding
hooks, IDs, or assistant state to the website.
