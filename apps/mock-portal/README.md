# Mock EPFO-Style Portal

## Goal

Build a clean fictional modernization of an EPFO-style public-service portal that behaves like a normal external website.

The portal exists to test whether the Chrome extension can understand and guide a page it does not control.

## Status

The mock portal is complete. Treat this app as a read-only test fixture while developing the extension; do not add new portal behavior, extension hooks, or assistant-specific metadata.

## Critical Rule

The portal must contain **zero assistant-specific instrumentation**.

Do not add:

- `data-guide-id`
- `GuideTarget`
- semantic IDs for the extension
- extension callbacks
- hidden metadata describing the correct journey
- direct imports from the extension package

Use normal accessible web markup only.

## Recommended Pages

```text
/
  dashboard

/claims
  claim service selection

/claims/withdraw
  verification + UAN/member details

/claims/review
  review summary

/claims/success
  submitted status
```

Client-side navigation is acceptable if it creates realistic DOM changes.

## Minimum Journey

### Dashboard

Include:

- Online Services
- View Passbook
- Manage Profile
- Claim Status
- a few irrelevant but realistic cards/links

### Online Services

Include choices such as:

- Claim Form 31, 19 & 10C
- Transfer Request
- Claim Status
- KYC / profile-related options

### Verification

Include:

- UAN field
- member name
- masked phone number
- verification control

### Review

Show mock claim details and a clearly consequential:

- Submit Claim

### Success

Show:

- request submitted
- mock claim/reference number
- status link

## Accessibility Requirements

Prefer proper markup because real browsers expose useful semantics through it.

Examples:

```tsx
<label htmlFor="uan">Universal Account Number (UAN)</label>
<input id="uan" name="uan" />
```

```tsx
<button type="button">Online Services</button>
```

Do not deliberately make the whole portal inaccessible. We can add one or two imperfect markup cases later to test extraction resilience.

## Visual Direction

- desktop-first
- clean and trustworthy
- modern Indian public-service aesthetic
- strong hierarchy
- readable typography
- generous hit areas
- high contrast
- avoid visual imitation of a live government service

## Mock Data

Use fabricated values only.

Never use real Aadhaar, UAN, bank, or personal data.

## Validation

Keep validation deterministic and local.

Example:

```ts
const isValidMockUan = value === "100200300400";
```

The exact demo value should be clearly fake.

## Definition of Done

The portal can be used without the extension and behaves like a coherent normal website.

The extension can then be installed and must discover the UI independently.
