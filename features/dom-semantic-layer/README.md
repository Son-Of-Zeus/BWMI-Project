# DOM Semantic Layer

## Goal

Reduce a complex webpage into a small, useful representation of the elements a user can interact with.

This happens locally in the browser before reasoning.

## Current Implementation

The extension implementation lives in `apps/extension/dom/semantic.ts`. It discovers common interactive controls, infers roles and bounded accessible labels, adds page/section context, separates `visible` from `inViewport`, and excludes hidden candidates. `createSemanticSnapshot()` returns model-safe data without `HTMLElement` references or input values. `createSemanticScanner()` adds a debounced `MutationObserver` for dynamic pages.

Run the focused tests from `apps/extension/` with:

```sh
npm test
```

## Pipeline

```text
DOM
 ↓
candidate scan
 ↓
visibility/relevance filter
 ↓
role inference
 ↓
accessible-name / label inference
 ↓
local context inference
 ↓
registry entries
 ↓
safe semantic snapshot
```

## Candidate Selector

Start conservatively:

```ts
const candidateSelector = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  "[role]",
  "[tabindex]",
  "[contenteditable='true']",
  "[onclick]",
].join(",");
```

Avoid scanning every `<div>` in v1.

## Visibility

Track two separate properties:

```ts
visible: boolean;
inViewport: boolean;
```

An element below the fold can be visible even when not currently in the viewport.

## Role Inference Priority

1. explicit ARIA role
2. native HTML semantics
3. input type
4. limited interaction heuristics such as `onclick`
5. fallback to `interactive`

## Label Inference Priority

1. `aria-label`
2. `aria-labelledby`
3. associated `<label>`
4. own visible text
5. `title`
6. `placeholder`
7. tightly constrained nearby text
8. `name` only as a last resort

Never blindly serialize large text blocks.

## Nearby Context

For poor markup, inspect a small local neighborhood:

- associated parent
- immediate previous sibling
- closest form row
- nearest relevant heading

Keep this heuristic bounded.

## Page Context

Extract:

- visible `h1` if meaningful
- document title
- nearest section heading where useful

## Sensitive Data Rule

Do not include input values by default.

Bad:

```json
{
  "label": "Aadhaar",
  "value": "123456789012"
}
```

Good:

```json
{
  "label": "Aadhaar",
  "hasValue": true,
  "validationState": "valid"
}
```

Passwords and OTP values must never be serialized.

## Dynamic Pages

Use `MutationObserver`.

Do not rescan synchronously on every mutation.

Debounce updates, then reconcile the registry.

## Output

Example:

```json
{
  "page": {
    "title": "Member Dashboard"
  },
  "elements": [
    {
      "id": "el_17",
      "role": "button",
      "label": "Online Services",
      "visible": true,
      "inViewport": true,
      "disabled": false
    }
  ]
}
```

## Failure Cases

Expect weaker performance on:

- image-only controls
- canvas UIs
- closed Shadow DOM
- cross-origin iframes
- inaccessible custom widgets
- CAPTCHA controls

Do not solve these in the first implementation.

## Definition of Done

On each screen of the mock portal, the console/debug view shows a compact semantic snapshot that includes all controls needed for the PF journey and excludes most irrelevant DOM.
