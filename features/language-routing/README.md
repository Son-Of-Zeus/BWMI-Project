# Same-Language Reasoning Routing

## Goal

Keep guidance in the user's detected practical language style when speech
recognition provides a language or locale.

## Current Extension Implementation

`apps/extension/flow/flow-controller.ts` passes the transcript language to
`buildReasonRequest`. The reasoning boundary exposes it as the optional
`userLanguage` field, trims and bounds the value, and omits it when unavailable.
The model still chooses the output `GuideAction.language`; this hint does not
override response validation or speech safety rules.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run reasoning/reasoning.test.ts flow/flow-controller.test.ts
```

## Safety Boundary

- language hints contain only a bounded locale/style string
- missing language metadata does not invent a default
- transcript text and semantic values remain subject to existing redaction
- the extension never sends provider credentials to the reasoning service

## Definition of Done

A detected `hi-IN`, `en-IN`, or other provider language hint reaches reasoning
when present, while requests without language metadata keep the prior shape.
