# Chrome Extension Shell

## Goal

Own all companion behavior inside a Chrome Manifest V3 extension.

The extension is the product.

## Current Implementation

The shell is a WXT-powered Manifest V3 extension with a background entrypoint and a React content-script UI mounted in a Shadow DOM overlay. During development it is scoped to `http://localhost/*` and `http://127.0.0.1/*`, so it can run against the local mock portal without requesting `<all_urls>`.

The mock portal is complete and must not be modified. All ongoing implementation and testing work belongs in this extension.

From this directory:

```sh
npm install
npm run dev
npm run build
```

The visible control is intentionally a shell placeholder. The DOM semantic layer now scans accessible interactive candidates, infers bounded labels and section context, tracks visibility separately from viewport position, and exposes a debounced `MutationObserver` scanner. Session state, action observation, reasoning, guidance, and voice are added in their respective feature passes.

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
├── voice/
├── session/
└── shared/
```

## Content Script Bootstrap

High-level boot sequence:

```ts
async function bootstrap() {
  mountShadowRoot();
  startSemanticScanner();
  startInteractionObserver();
  initializeSession();
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

The extension may call:

```text
POST /reason
POST /speech/transcribe
POST /speech/synthesize
```

No provider API keys live in the extension bundle.

## Dev Mode

Provide a development flag for:

- mocked transcript
- mocked reasoner
- semantic snapshot logging
- target box debugging

These are development tools, not demo UX.

## Definition of Done

Installing the extension and visiting the mock portal causes the companion to appear without any code changes to the portal.
