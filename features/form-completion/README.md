# Validation-Aware Form Completion

## Goal

Advance input and select guidance only after the user has supplied a usable,
non-invalid value.

## Current Extension Implementation

`apps/extension/interaction/interaction-observer.ts` reads the control's safe
`hasValue` and `validationState` metadata before matching a pending `input` or
`select` action. Text input is settled through a cancellable debounce and
`change` events flush it immediately. Empty or invalid controls emit semantic
status but keep the pending workflow; a value with no invalid marker allows
the user action to match. Raw values are never included in events or reasoning
requests.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run interaction/interaction-observer.test.ts
```

## Safety Boundary

- values remain in the page and are never serialized
- invalid controls cannot advance the pending workflow
- the observer never edits, validates, or submits the control
- the user remains responsible for correcting and completing the field

## Definition of Done

The extension waits for a non-empty, non-invalid input/select state before
continuing, while preserving the active workflow and data-minimization rules.
