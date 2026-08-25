# Interaction Observer

## Goal

Detect when the user performs the action the companion is waiting for.

The assistant guides; the user acts.

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

The extension reliably knows when the user completed the expected action without taking that action on their behalf.
