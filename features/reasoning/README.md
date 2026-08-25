# Reasoning Layer

## Goal

Use an LLM to decide the user's intent, the most relevant semantic UI target, and the next short spoken instruction.

The LLM decides **what** should happen.

It does not manipulate the browser.

## Current Implementation

The extension implementation lives in `apps/extension/reasoning/reasoning.ts`. It builds a minimal provider-neutral request, carries an optional detected speech-language hint, strips timestamps and DOM references, posts to the configured reasoning endpoint, and validates strict `GuideAction` responses against the current semantic target IDs before returning them.

Run the focused tests from `apps/extension/` with:

```sh
npx vitest run reasoning/reasoning.test.ts
```

## Input

A reasoning request should contain only the minimum context required:

```ts
type ReasonRequest = {
  userUtterance: string;
  userLanguage?: string;
  session: {
    goal?: string;
    recentActions: Array<{
      type: string;
      label?: string;
    }>;
    pendingAction?: {
      type: string;
      targetLabel?: string;
    };
  };
  page: {
    title?: string;
    section?: string;
    elements: SemanticElement[];
  };
};
```

Do not send:

- raw HTML
- CSS
- full DOM trees
- API keys
- password values
- OTP values
- sensitive form values unless absolutely necessary

## Output

Use strict structured output.

```ts
type GuideAction =
  | {
      action: "guide";
      targetId: string;
      spokenInstruction: string;
      consequence?: string;
      expectedUserAction: "click" | "input" | "select";
      language: string;
    }
  | {
      action: "explain";
      targetId: string;
      spokenInstruction: string;
      language: string;
    }
  | {
      action: "scroll";
      targetId: string;
    }
  | {
      action: "wait";
    }
  | {
      action: "clarify";
      spokenInstruction: string;
      language: string;
    }
  | {
      action: "success";
      spokenInstruction: string;
      language: string;
    };
```

## Instruction Style

Prefer:

> Online Services par click kariye.

Avoid:

> To continue with your PF withdrawal process, navigate to the Online Services menu...

Default to one sentence.

Use a second short sentence only when explanation is necessary. For a
consequential target, provide a short `consequence` sentence explaining what
the user's manual action will do.

## Same-Language Behavior

The flow passes the detected speech language as `userLanguage` when available.
The model should reply in the same practical language style as the user:

- Hindi → natural Hindi
- Hinglish → natural Hinglish
- English → English

Avoid excessively formal translated Hindi.

## Target Selection Rule

The model may only return a `targetId` present in the supplied element list.

The client validates this again.

## Development Adapter

A mock reasoner is allowed only for:

- UI development
- deterministic animation testing
- offline debugging
- avoiding model cost during repeated frontend work

The final MVP demo should use the real reasoning endpoint.

## Recovery

If no target is sufficiently clear:

```json
{
  "action": "clarify",
  "spokenInstruction": "Aap claim withdraw karna chahte hain ya claim status dekhna?",
  "language": "hi-IN"
}
```

Do not guess dangerous or consequential actions.

## Definition of Done

Given a realistic Hinglish utterance and semantic snapshot, the real model chooses the intended UI element and returns a schema-valid short instruction.
