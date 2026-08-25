# Consequence-Aware Guidance

## Goal

Explain the effect of a consequential user action before asking the user to
perform it manually.

## Current Extension Implementation

`apps/extension/reasoning/reasoning.ts` accepts an optional bounded
`consequence` sentence on guide actions and requires it when the live target is
classified as submission, consent, identity, financial, personal-data, or
credential related. `apps/extension/guide/guide-controller.ts` applies the same
check against the live registry and speaks the consequence before the normal
manual-action instruction.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run safety/safety.test.ts reasoning/reasoning.test.ts guide/guide-controller.test.ts
```

## Safety Boundary

- consequential controls remain pending until the user acts
- missing explanations are blocked before speech or pending-action creation
- the extension never clicks, submits, consents, or changes data
- consequence text is validated for length and executable content

## Definition of Done

Every consequential guide action explains its effect in the detected language
style before leaving the final click, input, or select to the user.
