# Voice-Native Public-Service Companion — MVP Architecture

## Purpose

This repository defines the MVP architecture for a Chrome extension that helps users navigate confusing public-service websites through voice and spatial guidance.

The product is not a chatbot. There is no chat sidebar, message history, or text-first interaction.

The interaction loop is:

**Voice → semantic page snapshot → reasoning → target selection → visual guidance → spoken instruction → user action**

The extension must guide the user without taking control of consequential actions.

## Project Status

The mock portal is complete and should be treated as a read-only integration target. Ongoing development is limited to the Chrome extension and its supporting feature modules; do not add portal functionality or extension-specific hooks to the site.

---

## MVP Thesis

The MVP should prove three things together:

1. A Chrome extension can independently understand a normal webpage without site-specific instrumentation.
2. An LLM can choose the correct semantic UI target from a compact page representation.
3. A visual companion can guide the user to that target in a calm, understandable way while leaving the final action to the user.

The mock EPFO-style website is a test environment only. It must behave like an ordinary external website and must not contain assistant-specific IDs, `GuideTarget` wrappers, or extension hooks.

---

## Repository Shape

```text
project/
├── README.md
│
├── apps/
│   ├── mock-portal/
│   │   └── README.md
│   └── extension/
│       └── README.md
│
├── backend/
│   └── README.md
│
└── features/
    ├── dom-semantic-layer/
    │   └── README.md
    ├── element-registry/
    │   └── README.md
    ├── reasoning/
    │   └── README.md
    ├── guide-controller/
    │   └── README.md
    ├── companion-ui/
    │   └── README.md
    ├── interaction-observer/
    │   └── README.md
    ├── session-state/
    │   └── README.md
    ├── voice/
    │   └── README.md
    ├── safety/
    │   └── README.md
    ├── flow-controller/
    │   └── README.md
    ├── extension-runtime/
    │   └── README.md
    └── accessibility/
        └── README.md
```

---

## System Architecture

```text
                         USER
                          │
                     clicks mic
                          │
                          ▼
                 ┌─────────────────┐
                 │ Voice Controller│
                 │ Sarvam / mock   │
                 └────────┬────────┘
                          │ transcript
                          ▼
               ┌─────────────────────┐
               │   Session Manager   │
               │ goal + recent state │
               └──────────┬──────────┘
                          │
                          │
      webpage DOM         │
          │               │
          ▼               │
┌───────────────────┐     │
│ DOM Semantic Layer│     │
└─────────┬─────────┘     │
          │               │
          ▼               │
┌───────────────────┐     │
│ Element Registry  │─────┘
└─────────┬─────────┘
          │ compact semantic snapshot
          ▼
┌─────────────────────────┐
│      Reasoning API      │
│  structured LLM output  │
└────────────┬────────────┘
             │ GuideAction
             ▼
┌─────────────────────────┐
│     Response Validator  │
└────────────┬────────────┘
             │ validated action
             ▼
┌─────────────────────────┐
│     Guide Controller    │
└───────┬─────────┬───────┘
        │         │
        │         ├── Companion movement
        │         ├── Spotlight/highlight
        │         ├── Scroll
        │         └── Speech playback
        │
        ▼
 waits for user action
        │
        ▼
┌─────────────────────────┐
│  Interaction Observer   │
└────────────┬────────────┘
             │
             ▼
     rescan → reason → guide
```

---

## Key Architectural Boundaries

### 1. Website and extension must be independent

The mock portal must not know the extension exists.

Bad:

```tsx
<GuideTarget id="online-services">
  <button>Online Services</button>
</GuideTarget>
```

Good:

```tsx
<button>Online Services</button>
```

The extension discovers the button itself.

### 2. The LLM never receives raw page HTML

The extension reduces the page to a compact semantic snapshot.

Example:

```json
{
  "page": {
    "title": "Member Dashboard",
    "section": "Member Services"
  },
  "elements": [
    {
      "id": "el_17",
      "role": "button",
      "label": "Online Services",
      "visible": true,
      "disabled": false
    },
    {
      "id": "el_18",
      "role": "link",
      "label": "View Passbook",
      "visible": true,
      "disabled": false
    }
  ]
}
```

The raw `HTMLElement` references remain inside the browser.

### 3. The LLM decides what, not how

The model may return:

```json
{
  "action": "guide",
  "targetId": "el_17",
  "spokenInstruction": "Online Services par click kariye.",
  "expectedUserAction": "click",
  "language": "hi-IN"
}
```

The model does not:

- run JavaScript
- generate selectors
- click elements
- manipulate the DOM
- control animation
- submit forms

### 4. Frontend policy is authoritative

The extension validates every model response.

If `targetId` does not exist in the current registry, the action is rejected.

Consequential actions are never executed automatically.

### 5. Semantic IDs are temporary

IDs such as `el_17` are generated by the extension and only identify an element in the current browser context.

The reasoning layer must not rely on fixed IDs or site-specific selectors.

---

## Core Contracts

### Semantic Element

```ts
export type SemanticElement = {
  id: string;
  role:
    | "button"
    | "link"
    | "textbox"
    | "checkbox"
    | "radio"
    | "combobox"
    | "menuitem"
    | "tab"
    | "interactive";
  label: string;
  section?: string;
  visible: boolean;
  inViewport: boolean;
  disabled: boolean;
};
```

### Internal Registry Entry

```ts
export type RegistryEntry = SemanticElement & {
  element: HTMLElement;
};
```

`HTMLElement` never leaves the extension.

### Guide Action

```ts
export type GuideAction =
  | {
      action: "guide";
      targetId: string;
      spokenInstruction: string;
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

Keep this schema small during the hackathon.

---

## MVP PF Withdrawal Demo

### Starting state

The user opens the mock EPFO-style portal.

The extension:

1. injects its Shadow DOM UI,
2. scans the page,
3. builds the semantic registry,
4. enters `idle`.

### User request

User presses the microphone and says:

> Mujhe PF ka paisa nikalna hai.

The transcript and semantic snapshot are sent to the reasoning API.

The LLM selects the visible `Online Services` element.

The extension:

1. validates the target,
2. scrolls if required,
3. dims unrelated content,
4. highlights the target,
5. moves the companion beside it,
6. speaks one short instruction,
7. waits for the user to click.

### Continuation

After the click:

1. the interaction observer records the user action,
2. the page changes,
3. the DOM semantic layer rescans,
4. session state is updated,
5. reasoning runs again,
6. the next target is selected.

### Explanation interruption

If the user asks:

> Ye UAN kya hota hai?

The reasoning engine returns an `explain` action targeting the UAN field.

The current journey does not advance.

After the explanation, the user remains on the same step.

### Submission

Before final submission, the assistant explains the consequence.

The extension may highlight `Submit Claim`, but the user must click it manually.

---

## Companion States

```text
idle
listening
thinking
guiding
speaking
waiting
success
error
```

These states describe the assistant UI, not the user's journey.

Do not mix companion animation state with workflow/session state.

---

## Proposed Stack

### Mock portal

- Next.js
- TypeScript
- Tailwind CSS

### Chrome extension

- Manifest V3
- React
- TypeScript
- WXT as the proposed extension build layer
- Framer Motion for companion animation
- Shadow DOM for UI isolation

### Backend

- Minimal server-side API
- LLM API with structured output
- Sarvam AI for STT/TTS
- no database required for the first demo

---

## Build Order

### Milestone 1 — Extension mechanics

- extension installs and injects on the mock portal
- Shadow DOM companion appears
- DOM scanner discovers interactive elements
- semantic snapshot is visible in dev tools
- registry maps semantic IDs to real DOM elements
- guide controller can point to a selected semantic element

### Milestone 2 — Real reasoning

- `/reason` endpoint
- structured LLM response
- response validation
- LLM selects targets from semantic snapshot

### Milestone 3 — Full PF flow

- multi-step withdrawal flow
- user click detection
- dynamic DOM rescanning
- explanation interruption
- final submission boundary
- success state

### Milestone 4 — Voice

- Sarvam STT
- language detection / low-friction handling
- Sarvam TTS
- same-language response
- audio interruption handling

### Milestone 5 — Demo polish

- movement timing
- readable focus mask
- error recovery
- loading latency treatment
- accessibility
- demo-reset control

---

## Non-Goals for MVP

Do not build:

- universal support for arbitrary government websites
- autonomous clicking
- form autofill agents
- CAPTCHA solving
- persistent user accounts
- database-backed journey history
- generic browser automation
- vector databases
- agent frameworks
- visual webpage understanding unless DOM extraction proves insufficient

---

## Definition of Done

The MVP is successful when:

1. the mock portal contains no extension-specific instrumentation,
2. the Chrome extension independently scans it,
3. a Hinglish request is converted to text,
4. the real LLM selects a semantic target,
5. the companion visibly moves to and highlights the correct UI element,
6. spoken guidance tells the user what to do,
7. the user performs the action,
8. the extension observes the action and continues,
9. the full mocked PF journey works end-to-end,
10. final submission remains explicitly user-controlled.

---

## Assumptions

1. Desktop Chrome is the only required browser for the hackathon.
2. The mock portal is a visual clone of a live government website.
3. The mock portal is deployed as a normal public website and contains no assistant-specific metadata or hooks.
4. The MVP is a Chrome extension from day one; a non-extension demo is not considered sufficient.
5. Manifest V3 is the extension target.
6. WXT is the proposed extension build framework; it can be replaced without changing the core architecture.
7. React and TypeScript are used inside the extension.
8. The extension may request host access for the mock portal during development/demo.
9. Initial semantic extraction is DOM/accessibility based, not vision based.
10. The extension scans common interactive elements and applies limited nearby-context heuristics for poor markup.
11. The first demo does not promise robust support for arbitrary legacy government websites.
12. A real LLM is used for target selection in the final MVP demo.
13. A mock reasoner may exist only as a development/test adapter.
14. Sarvam AI is the intended STT/TTS provider.
15. Voice APIs and model APIs are called through a backend so secrets are never shipped inside the extension.
16. The assistant never auto-confirms, submits, consents, changes personal data, or performs financial actions.
17. Scrolling may be automated.
18. Sensitive form values are not sent to the reasoning model by default.
19. No database is required for the first hackathon demo.
20. The first supported journey is PF withdrawal guidance, including one terminology explanation such as UAN.
