# Voice Layer

## Goal

Make voice the primary interaction.

Initial target languages:

- Hindi
- Hinglish / code-mixed Hindi-English
- English

Architecture should allow later extension to Tamil and other Indian languages.

## MVP Interfaces

```ts
interface SpeechToText {
  transcribe(audio: Blob): Promise<{
    transcript: string;
    language?: string;
  }>;
}

interface TextToSpeech {
  synthesize(input: {
    text: string;
    language?: string;
  }): Promise<ArrayBuffer>;
}
```

The rest of the extension should depend on these interfaces rather than Sarvam-specific response types.

## Provider

Sarvam AI is the intended provider for:

- STT
- TTS
- Indian-language handling

Provider secrets remain on the backend.

## Development Mode

Before real voice integration, clicking the microphone may emit predetermined transcripts.

Example sequence:

```text
Mujhe PF ka paisa nikalna hai.
Ye UAN kya hota hai?
Ab kya karna hai?
```

This mode exists only to build and test the interaction loop.

## Interaction States

```text
idle
 ↓
listening
 ↓
transcribing
 ↓
thinking
 ↓
guiding/speaking
```

## Same-Language Response

Pass detected language/style to reasoning when available.

The assistant should prefer matching practical language style rather than formal translation.

## Audio UX

- microphone control should be obvious
- listening state should be visibly distinct
- speech can be cancelled by a new microphone request
- do not play overlapping instructions
- keep spoken instructions brief

## Permissions

Chrome microphone permission behavior must be tested early because it can affect demo reliability.

## Definition of Done

A user can press the microphone, speak a Hinglish request, receive a transcript through Sarvam, and hear the final guide instruction spoken naturally.
