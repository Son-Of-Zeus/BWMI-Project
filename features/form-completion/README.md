# User-Confirmed Form Completion

## Goal

Keep text-input guidance pending until the user explicitly confirms that they
are finished. Select changes may still advance when their semantic state is
usable.

## Current Extension Implementation

`apps/extension/interaction/interaction-observer.ts` reads safe
`hasValue` and `validationState` metadata for model context, but never treats
those fields as proof that a text input is complete. Text input is settled
through a cancellable debounce and `change` events flush a status event; the
pending workflow remains until the user says a phrase such as “I’m done”. Raw
values are never included in events or reasoning requests.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run interaction/interaction-observer.test.ts
```

## Safety Boundary

- values remain in the page and are never serialized
- text-input validation cannot advance the pending workflow
- the observer never edits, validates, or submits the control
- the user remains responsible for correcting and completing the field

## Definition of Done

The extension preserves text-input workflow state until explicit voice
confirmation, while retaining safe semantic metadata and data minimization.
