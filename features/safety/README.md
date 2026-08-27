# Safety and User-Control Boundaries

## Principle

The assistant guides the user. It does not take control of consequential actions.

## Current Extension Implementation

The policy lives in `apps/extension/safety/safety.ts`. It redacts common
personal values before reasoning requests leave the extension, classifies
consequential labels, requires explicit user action for guided targets, and
blocks disabled targets. Reasoning applies the policy to backend responses,
and the guide controller applies it again before speaking or creating pending
workflow state.
For consequential guide targets it also requires a bounded spoken consequence
explanation before the guide can be offered.

Run the focused policy tests from `apps/extension/` with:

```sh
npm test -- --run safety/safety.test.ts
```

## User Must Act Manually

The extension must not automatically:

- submit forms
- accept terms
- provide consent
- initiate financial actions
- confirm applications
- change personal information
- change bank details
- approve identity verification
- enter OTPs
- solve CAPTCHAs

The assistant may point to these controls and explain the consequence.

## Safe Navigation

The extension may automate low-risk navigation aids such as:

- scrolling a target into view
- moving its own companion
- focusing visual attention

Whether to programmatically expand non-consequential menus can be evaluated later. For MVP, prefer the user clicking menus themselves.

## Data Minimization

Do not send raw sensitive form values to the LLM by default.

Examples to keep local:

- Aadhaar
- UAN
- phone number
- bank account
- IFSC
- address
- OTP
- password

Expose only the minimum semantic state:

```json
{
  "label": "UAN",
  "hasValue": true,
  "validationState": "valid"
}
```

## Model Response Validation

Reject responses when:

- action type is unknown
- target does not exist
- target is stale
- required fields are missing
- intent readiness reports missing or ambiguous conversational information for a guide action
- model tries to provide executable code
- model requests autonomous consequential action

## Consequence Explanation

Before a consequential action, the model response must include a short
consequence explanation. The guide speaks it before the manual-action
instruction.

The generic intent-readiness assessment is checked first. A `guide` action is
not accepted while conversational `missingInformation` is non-empty; the model
must return a focused `clarify` question instead. Empty website fields are
handled as manual page-entry actions and do not trigger clarification.
Requirement names are bounded metadata and must never contain submitted values.

Example:

> Isse aapki claim request submit ho jayegi. Details sahi hain to Submit Claim par khud click kariye.

## Definition of Done

No LLM output can cause a consequential website action without an explicit user interaction.
