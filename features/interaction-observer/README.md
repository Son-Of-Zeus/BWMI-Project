# Interaction Observer

## Goal

Detect when the user performs the action the companion is waiting for.

The assistant guides; the user acts.

## Current Implementation

The extension implementation lives in `apps/extension/interaction/interaction-observer.ts`. It resolves nested event targets through the element registry, matches click and select actions against pending session state, records only semantic action metadata, reports high-level input status without values, observes SPA history/navigation, and never prevents the website's own events. Text input remains pending until the user explicitly says they are done. The flow controller consumes unmatched semantic actions to recover against the current page without discarding the active goal.

Run the focused tests from `apps/extension/` with:

```sh
npx vitest run interaction/interaction-observer.test.ts
```

## Click Observation

Listen at the document level in capture phase:

```ts
document.addEventListener("click", handleClick, true);
```

Given the event target:

1. walk upward through ancestors
2. determine whether the target/ancestor exists in the current registry
3. emit a semantic user-action event

Example:

```ts
{
  type: "click",
  targetId: "el_17",
  label: "Online Services"
}
```

## Form Input

For expected text entry, listen for:

- `input`
- `change`
- focus/blur where useful

Do not send raw values to the reasoning model by default.

Emit high-level status instead:

```ts
{
  type: "input-complete",
  targetId: "el_31",
  hasValue: true,
  validationState: "valid"
}
```

Select actions may be matched after a non-empty, non-invalid change. Text-input
events are coalesced before an `input-complete` status event is emitted, while a
`change` event flushes that status immediately. The status event never clears a
pending text-input action; the user must say a completion phrase such as
“I’m done” before the flow reasons again. Values never leave the page.

## Matching Pending Actions

If session state expects:

```ts
{
  targetId: "el_17",
  type: "click"
}
```

and the observer sees that click:

1. clear pending action
2. record semantic action in session history
3. allow website's own action normally
4. wait for DOM/navigation change
5. rescan
6. reason again

## Unexpected Actions

If the user clicks something else:

- do not block them
- clear stale highlighting if appropriate
- rescan after the page settles
- let reasoning recover from the new page state

The extension should be resilient, not brittle.

## Navigation

Observe:

- URL changes
- SPA history changes
- full-page reloads through content-script restart
- meaningful DOM changes

## Definition of Done

The extension observes input safely, waits for explicit user confirmation, and
reasons again only after the user completes the expected action without taking
that action on their behalf.
