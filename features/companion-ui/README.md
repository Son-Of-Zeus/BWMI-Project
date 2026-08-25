# Companion UI

## Goal

Create the feeling of a knowledgeable person sitting beside the user and pointing at the page.

The companion is not the mouse pointer and must never replace the system cursor.

## Current Implementation

The extension implementation lives in `apps/extension/companion/`. `Companion.tsx` renders the eight required states through an external UI store with labeled region, busy, live-status, retry, follow-up, and demo-reset semantics, while `companion-ui.ts` provides fixed-position focus-mask and highlight layers plus guide-controller adapters. Overlay layers use `pointer-events: none`, and position/motion helpers clamp the companion to the viewport and respect reduced motion.

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

- small orb / intelligent dot
- calm scale or glow changes
- subtle directional motion
- no character animation dependency
- no excessive bouncing
- clear contrast against the page

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
