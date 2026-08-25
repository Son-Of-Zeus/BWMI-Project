# Session State

## Goal

Maintain enough short-lived context for reasoning across multiple user actions without hard-coding a fixed DOM journey.

## Current Implementation

The extension implementation lives in `apps/extension/session/session-state.ts`. It keeps a normalized goal, a bounded recent semantic-action window, a pending user action, and companion state in memory. State snapshots are cloned before being returned or published, and explanation actions do not overwrite the workflow goal or pending action.

Run the focused tests from `apps/extension/` with:

```sh
npx vitest run session/session-state.test.ts
```

## State Shape

```ts
type SessionState = {
  goal?: string;

  recentActions: Array<{
    type: "click" | "input" | "select" | "explanation";
    label?: string;
    timestamp: number;
  }>;

  pendingAction?: {
    targetId: string;
    expectedUserAction: "click" | "input" | "select";
  };

  companionState:
    | "idle"
    | "listening"
    | "thinking"
    | "guiding"
    | "speaking"
    | "waiting"
    | "success"
    | "error";
};
```

## Do Not Store a Hard-Coded DOM Script

Avoid:

```text
step 1 = el_17
step 2 = el_28
step 3 = el_31
```

IDs are runtime-specific.

The LLM reasons over the current semantic snapshot.

## Goal Memory

If the user initially says:

> Mujhe PF ka paisa nikalna hai.

Store a compact goal such as:

```text
PF withdrawal
```

Subsequent reasoning can use this even when the user says only:

> Ab kya?

## Recent Actions

Keep only a small recent window.

Example:

```json
[
  {
    "type": "click",
    "label": "Online Services"
  },
  {
    "type": "click",
    "label": "Claim Form 31, 19 & 10C"
  }
]
```

Do not create a permanent chat transcript.

## Explanation Interruptions

An `explain` action should not overwrite the workflow goal or pending journey context.

After explanation, the session remains positioned on the current task.

## Persistence

For the MVP, in-memory state is enough.

Optional `chrome.storage.session` can be added if reload resilience is needed.

No backend database is required.

## Definition of Done

The assistant can continue naturally after multiple page transitions and can answer a terminology question without losing the user's original goal.
