# Companion UI

## Goal

Create the feeling of a knowledgeable person sitting beside the user and pointing at the page.

The companion is not the mouse pointer and must never replace the system cursor.

## Current Implementation

The extension implementation lives in `apps/extension/companion/`.
`Companion.tsx` renders the eight required states as a red overlay cursor plus
a compact docked status panel with reset control and expandable latency
breakdown. The panel remains fixed at the viewport edge during guidance; only
the cursor moves beside the highlighted target. It
uses explicit `left`/`top` coordinates in both its docked and target states so
the browser can interpolate one continuous, eased path, and flips horizontally
when it must sit on the target's left. The external store retains labeled-region, busy,
live-status,
retry, follow-up, demo-reset, and slow-work semantics. `companion-ui.ts`
provides fixed-position, target-aligned focus-mask and red highlight layers
plus guide-controller adapters. Overlay layers use `pointer-events: none`, and
position/motion helpers clamp the cursor to the viewport, use calm motion,
and respect reduced motion.

Run the focused tests from `apps/extension/` with:

```sh
npx vitest run companion/companion-ui.test.ts
```

## Required States

```text
idle
listening
thinking
guiding
speaking
waiting
success
error
```

## Visual Language

Recommended MVP form:

- red overlay cursor with a separately docked status panel
- calm scale or glow changes
- subtle directional motion
- no character animation dependency
- no excessive bouncing
- clear contrast against the page
- controls contained within one surface rather than separate floating pills

## Guiding Sequence

When a target is selected:

1. page de-emphasizes
2. target remains clear
3. halo appears around target
4. companion moves near target
5. optional small pulse/arrow indicates the exact control
6. voice gives one short instruction
7. animation settles while waiting

## Positioning

Render in a fixed Shadow DOM overlay.

Given a target rectangle:

```ts
const x = rect.right + 16;
const y = rect.top + rect.height / 2;
```

Then clamp to viewport edges.

If right-side space is insufficient, position on the left.

## Focus Mask

The focus mask should:

- reduce unrelated visual noise
- preserve enough context to understand the page
- not make text unreadable
- never capture normal page pointer events

## Highlight

Prefer an outer halo rather than changing the website's own styles.

This avoids damaging layouts or CSS transitions.

## Motion

Desktop-first.

Keep animation durations calm and short.

Support `prefers-reduced-motion`.

## Captions

Tiny temporary captions may exist for accessibility/debugging, but should not become a persistent conversation UI.

No:

- chat history
- message feed
- sidebar
- assistant transcript panel

## Definition of Done

A first-time viewer can immediately understand which page element the assistant is referring to without reading a chat message.
