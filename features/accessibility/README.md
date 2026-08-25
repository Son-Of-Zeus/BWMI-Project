# Companion Accessibility

## Goal

Make the voice companion understandable and operable without depending on
color, motion, or an unwritten chat interaction.

## Current Extension Implementation

`apps/extension/companion/Companion.tsx` exposes a labeled region, busy state,
state-specific button actions, and a live status announcement. Errors announce
assertively and provide a retry label; waiting and success states explain what
the next microphone action will do. `style.css` preserves visible focus,
supports reduced motion, and adds high-contrast and forced-colors rules.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run companion/Companion.test.tsx companion/companion-ui.test.ts
```

## Interaction Rules

- the microphone remains a real keyboard-focusable button
- the current state is available as text, not only animation or color
- focus-mask and highlight layers remain `aria-hidden` and pointer-transparent
- error recovery is available through the same explicit microphone control

## Definition of Done

A keyboard or assistive-technology user can identify the companion state,
understand the available microphone action, and recover from an error without
opening a chat panel.
