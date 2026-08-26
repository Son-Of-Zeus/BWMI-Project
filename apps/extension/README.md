# Chrome Extension Shell

## Goal

Own all companion behavior inside a Chrome Manifest V3 extension.

The extension is the product.

## Current Implementation

The shell is a WXT-powered Manifest V3 extension with a background entrypoint and a React content-script UI mounted in a Shadow DOM overlay. The local prototype targets the mock portal at `http://localhost:5173` or `http://127.0.0.1:5173` and the backend at `http://127.0.0.1:8787`, without requesting `<all_urls>`.

The mock portal is complete and must not be modified. All ongoing implementation and testing work belongs in this extension. The element registry now retains runtime IDs for surviving DOM nodes, reconciles rescans, and exposes live-target and model-safe snapshot APIs. Session state now provides bounded goal/action memory, pending-action tracking, and explicit companion-state transitions in memory. The interaction observer now captures semantic clicks, input status without auto-advancing text fields, select completion, and SPA navigation without preventing the website's own events. The reasoning boundary now builds minimal requests, carries an optional detected speech-language hint, posts to the backend, and strictly validates target-safe structured actions. The guide controller now orchestrates live-target scrolling, transition-aligned companion movement, target-aligned focus masks, consequence-aware speech, overlay/companion/speech adapters, cancellation, and layout remeasurement without auto-clicking. The voice boundary now provides cancellation-aware STT/TTS orchestration, backend-only speech requests, development transcripts, and browser audio adapters. The safety boundary now redacts sensitive request values, classifies consequential targets, requires a spoken consequence explanation, and blocks disabled guidance before speech or pending-action creation. The flow controller now connects voice, rescans, reasoning, guidance, explicit input-completion phrases, unexpected-action recovery, observed user actions, demo reset, and slow-work cancellation into a cancellable PF journey loop. The runtime now composes these services at content-script mount, wires microphone and reset controls, gives slow reasoning and speech a delayed status notice, retries recoverable failures, and tears everything down with the Shadow DOM.

From this directory:

```sh
npm install
npm run dev
npm run build
```

The compact red companion control is wired to the extension runtime and
exposes accessible state, retry, follow-up, explicit busy-operation stop,
demo-reset, slow-work semantics, and an expandable per-stage latency
breakdown. Unmatched page clicks and text entry no longer dismiss active
guidance. The DOM semantic layer scans accessible interactive candidates,
infers bounded labels and section context, tracks visibility separately from
viewport position, and exposes a debounced `MutationObserver` scanner.
Session state, action observation, reasoning, guidance, voice, safety, flow
orchestration, runtime composition, accessibility, demo reset, loading
latency, and error recovery are covered by their respective feature
boundaries.

## Responsibilities

The extension owns:

- content-script injection
- Shadow DOM UI root
- microphone control
- DOM semantic extraction
- element registry
- companion rendering
- highlight/focus mask
- guide orchestration
- user-action observation
- backend communication
- local session state

## Proposed Structure

```text
extension/
├── entrypoints/
│   ├── background.ts
│   └── content/
│       └── index.tsx
├── dom/
├── registry/
├── reasoning/
├── guide/
├── companion/
├── flow/
├── runtime/
├── voice/
├── session/
└── shared/
```

## Content Script Bootstrap

High-level boot sequence:

```ts
async function bootstrap() {
  mountShadowRoot();
  const runtime = createExtensionRuntime({ companion });
  runtime.start();
  renderCompanion();
}
```

## Shadow DOM

Inject one root into the page:

```text
document
├── website
└── #voice-companion-root
    └── shadowRoot
        ├── Companion
        ├── FocusMask
        ├── TargetHighlight
        └── VoiceButton
```

Reasons:

- isolate styles from hostile/legacy page CSS
- avoid accidental page layout changes
- keep z-index management predictable
- make later support for arbitrary sites safer

## UI Positioning

Companion and overlays should use fixed viewport coordinates.

The guide controller reads:

```ts
element.getBoundingClientRect()
```

and maps that rectangle to the fixed overlay layer.

Do not insert the companion beside elements in the website DOM.

## Host Permissions

For the hackathon, scope permissions to the deployed mock portal where possible.

Do not start with `<all_urls>` unless required for testing.

## Backend Calls

The extension calls the local backend by default:

```text
POST http://127.0.0.1:8787/reason
POST http://127.0.0.1:8787/speech/transcribe
POST http://127.0.0.1:8787/speech/synthesize
```

No provider API keys live in the extension bundle.

## Dev Mode

Pass `development: { enabled: true }` to use injected development transcripts
and a mock reasoner, and pass `debug: { enabled: true }` to opt into safe
semantic-snapshot and target-box diagnostics. Debug events contain model-safe
semantic data and numeric rectangles only; neither mode is enabled by default
or presented as demo UX.

## Definition of Done

Installing the extension and visiting the local mock portal causes the companion
to appear without any code changes to the portal. Live reasoning and voice
require the backend's Groq and Sarvam environment configuration.
