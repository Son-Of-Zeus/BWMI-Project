# Reasoning Layer

## Goal

Use an LLM to decide the user's intent, the most relevant semantic UI target, and the next short spoken instruction.

The LLM decides **what** should happen.

It does not manipulate the browser.

## Current Implementation

The extension implementation lives in `apps/extension/reasoning/reasoning.ts`. It builds a minimal provider-neutral request, carries an optional detected speech-language hint and bounded intent-readiness memory, strips timestamps and DOM references, posts to the configured reasoning endpoint, and validates strict `GuideAction` responses against the current semantic target IDs before returning them. The flow coalesces repeated continuation triggers while a page transition or reasoning request is already in flight, and suppresses an identical completed request for a short debounce window.

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
    workflow?: IntentReadiness;
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

Use strict structured output. The Groq `openai/gpt-oss-120b` adapter requires
all response fields in its provider schema; fields that do not apply are
represented as `null`, then normalized back to this provider-neutral contract.
Every model response also contains a generic readiness assessment. A response
with missing or ambiguous information is converted to `clarify` before it can
reach the guide controller. The live safety gate still requires a non-empty
consequence for consequential targets.

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
      targetId?: string;
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

```ts
type IntentReadiness = {
  intent?: string;
  requiredInformation: string[];
  knownInformation: string[];
  missingInformation: string[];
  readiness: "ready" | "needs_clarification" | "not_applicable";
  clarifyingQuestion?: string;
};
```

Every `GuideAction` may carry `workflow?: IntentReadiness` as bounded planning
metadata for the next voice turn.

An `explain` action may omit `targetId` when answering a general page or task
question. If it supplies a target, that target must still be present in the
live registry and the guide controller will focus it before speaking.

`requiredInformation`, `knownInformation`, and `missingInformation` contain
requirement names only, never submitted values. `hasValue`, browser validity,
prefilled values, and default selections do not prove that the user supplied or
confirmed information. A `guide` response is valid only when readiness is
`ready`; a `clarify` response must carry a focused question and the missing
requirements. The extension retains this bounded assessment between voice
turns so a multi-turn clarification does not forget earlier answers.

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
  "language": "hi-IN",
  "workflow": {
    "intent": "the user's task",
    "requiredInformation": ["task choice"],
    "knownInformation": [],
    "missingInformation": ["task choice"],
    "readiness": "needs_clarification",
    "clarifyingQuestion": "Aap claim withdraw karna chahte hain ya claim status dekhna?"
  }
}
```

Do not guess dangerous or consequential actions.

## Definition of Done

Given a realistic Hinglish utterance and semantic snapshot, the real model chooses the intended UI element and returns a schema-valid short instruction.
