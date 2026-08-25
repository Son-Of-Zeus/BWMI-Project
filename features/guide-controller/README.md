# Guide Controller

## Goal

Translate a validated `GuideAction` into physical guidance on the webpage.

The guide controller decides **how** guidance is shown.

## Current Implementation

The extension implementation lives in `apps/extension/guide/guide-controller.ts`. It resolves live registry targets, scrolls with reduced-motion support, remeasures after layout changes, keeps the focus mask aligned with the live target, waits for transition-aligned companion movement to settle before speech, drives injected overlay/companion/speech adapters, preserves pending context for explanations, and exposes cancellation without any automatic click capability.

Run the focused tests from `apps/extension/` with:

```sh
npx vitest run guide/guide-controller.test.ts
```

## Responsibilities

For a `guide` action:

1. resolve `targetId` through the registry
2. verify target is live
3. scroll into view if required
4. wait for scroll/layout to settle
5. measure `getBoundingClientRect()`
6. activate focus mask
7. highlight target
8. move companion beside target
9. wait for movement to settle, unless reduced motion is preferred
10. play spoken instruction
11. enter waiting state
12. listen for the expected user action

## Pseudocode

```ts
async function runGuide(action: GuideAction) {
  const target = registry.get(action.targetId);

  if (!target || !target.element.isConnected) {
    return recoverFromMissingTarget();
  }

  await ensureInView(target.element);

  const rect = target.element.getBoundingClientRect();

  companion.setTarget(rect);
  overlay.highlight(rect);

  await speech.say(action.spokenInstruction);

  session.setPendingAction({
    targetId: action.targetId,
    type: action.expectedUserAction,
  });

  companion.setState("waiting");
}
```

## Scroll Policy

Scrolling is a safe navigation action and may be automated.

Prefer:

```ts
element.scrollIntoView({
  behavior: "smooth",
  block: "center",
});
```

Respect reduced-motion preferences.

## Never Auto-Click Consequential Actions

The controller must not expose generic arbitrary-click capability to the LLM.

The MVP should never automatically:

- submit
- confirm
- consent
- transfer
- change personal data
- perform financial actions

## Overlay Interaction

The dimming layer must not block website clicks.

Use pointer-event rules so only extension controls intercept input.

## Layout Changes

Re-measure target position:

- after scroll
- after resize
- after major DOM mutation
- while actively guiding if layout shifts

Do not assume the original rect remains valid.

## Cancellation

A new user voice request should be able to cancel:

- current speech
- current animation
- pending guidance

Then reasoning runs on fresh context.

## Definition of Done

The controller can guide to any live registry element without knowing website-specific selectors or DOM structure.
