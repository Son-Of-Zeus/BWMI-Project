# PF Flow Controller

## Goal

Connect the extension boundaries into the user-driven loop:

```text
voice → rescan → reason → guide → user action → rescan
```

The controller coordinates the journey without executing website actions.

## Current Extension Implementation

`apps/extension/flow/flow-controller.ts` starts and stops the semantic scanner
and interaction observer, reconciles the live registry, builds sanitized
reasoning requests, runs validated guide actions, schedules the next reasoning
pass after a matched user action or navigation, and resets the active demo
context on request. A new voice request cancels stale work while preserving
pending context for an explanation.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run flow/flow-controller.test.ts
```

## User Control

The flow can scroll, highlight, speak, and observe. It never clicks, submits,
confirms, consents, enters OTPs, or changes personal data. Consequential guide
actions remain pending until the interaction observer records the user's own
action.

## Recovery

- stale asynchronous reasoning results are ignored
- page changes trigger a fresh semantic snapshot
- explanation requests preserve the existing pending workflow target
- demo reset cancels active work, clears session context, and rescans the current page
- teardown stops observers and cancels speech/guidance

## Definition of Done

An extension voice request can produce a validated guide action, observe the
user's matching action, and reason again against the updated page without
modifying the website's code or state on the user's behalf.
