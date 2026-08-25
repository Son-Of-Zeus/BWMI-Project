# Readable Focus Mask

## Goal

Reduce visual noise around the guided control while keeping the target itself
clear, readable, and usable.

## Current Extension Implementation

`apps/extension/companion/companion-ui.ts` positions the focus mask over the
live target rectangle before applying the outside dimmer. The guide controller
updates that rectangle on scroll, resize, and meaningful DOM changes alongside
the highlight. The layers remain pointer-transparent and `aria-hidden`; the
mask uses restrained opacity with stronger high-contrast and forced-colors
rules.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run companion/companion-ui.test.ts guide/guide-controller.test.ts
```

## Interaction Rules

- the target opening follows the same live rectangle as the highlight
- unrelated content is dimmed without changing page styles
- the mask never captures pointer or keyboard input
- reduced motion removes mask geometry transitions

## Definition of Done

The guided control remains visually readable after scrolling or layout shifts,
while surrounding page noise is reduced and the website remains interactive.
