# Error Recovery

## Goal

Let users recover from transient extension or service failures without
repeating a voice request unnecessarily.

## Current Extension Implementation

`apps/extension/flow/flow-controller.ts` stores a transient retry transcript
only when transcription succeeded but reasoning or guidance failed. The
runtime routes an explicit microphone press from the error state to
`flow.retry()`, which retries the current page against that transcript. If
voice capture or transcription failed before a transcript existed, retry
starts a fresh microphone request instead.

Run the focused tests from `apps/extension/` with:

```sh
npm test -- --run flow/flow-controller.test.ts runtime/extension-runtime.test.ts
```

## Safety Boundary

- retry always requires the user to press the microphone control
- retry never clicks, submits, or changes a website control
- every retry rebuilds the current semantic page request and revalidates targets
- raw provider errors are not spoken as a transcript or sent to the website
- reset and cancellation invalidate late results from the failed request

## Definition of Done

A recoverable service failure can be retried from the error state, while a
microphone failure asks for fresh input and no stale request can resume on its
own.
