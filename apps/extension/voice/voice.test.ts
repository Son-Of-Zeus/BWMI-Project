import { describe, expect, it, vi } from 'vitest';
import {
  createBrowserMicrophoneRecorder,
  createDevelopmentSpeechToText,
  createSpeechApiClient,
  createVoiceController,
  type AudioPlayback,
  type AudioRecorder,
  type SpeechToText,
  type SpeechToTextResult,
  type TextToSpeech,
} from './voice';
import { createSessionState } from '../session/session-state';

function createRecorder(audio = new Blob(['audio'], { type: 'audio/webm' })) {
  const recorder: AudioRecorder = {
    record: vi.fn(async () => audio),
    stop: vi.fn(),
    cancel: vi.fn(),
  };
  return recorder;
}

function createSpeechToText(
  result: SpeechToTextResult = {
    transcript: 'Mujhe PF mein help chahiye.',
    language: 'hi-IN',
  },
) {
  const speechToText: SpeechToText = {
    transcribe: vi.fn(async () => result),
  };
  return speechToText;
}

function createSpeechOutput() {
  const playback: AudioPlayback = {
    play: vi.fn(async () => undefined),
    cancel: vi.fn(),
  };
  const textToSpeech: TextToSpeech = {
    synthesize: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
  };
  return { playback, textToSpeech };
}

function createResponse(options: {
  status?: number;
  json?: unknown;
  audio?: ArrayBuffer;
} = {}): Response {
  const status = options.status ?? 200;
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => options.json,
    arrayBuffer: async () => options.audio ?? new ArrayBuffer(0),
  } as Response;
}

describe('voice controller', () => {
  it('records, transcribes, preserves language, and maps transcribing to thinking for the companion', async () => {
    const recorder = createRecorder();
    const speechToText = createSpeechToText();
    const session = createSessionState();
    const transcript = vi.fn();
    const states: string[] = [];
    const controller = createVoiceController({
      recorder,
      speechToText,
      session,
      onTranscript: transcript,
    });
    controller.subscribe((state) => states.push(state));

    const result = await controller.listen();

    expect(result).toEqual({
      status: 'transcript',
      transcript: 'Mujhe PF mein help chahiye.',
      language: 'hi-IN',
    });
    expect(states).toEqual(['listening', 'transcribing', 'thinking']);
    expect(session.getState().companionState).toBe('thinking');
    expect(transcript).toHaveBeenCalledWith({
      transcript: 'Mujhe PF mein help chahiye.',
      language: 'hi-IN',
    });
    expect(speechToText.transcribe).toHaveBeenCalledWith(
      expect.any(Blob),
    );
  });

  it('cancels an in-flight recording without sending audio to speech recognition', async () => {
    let resolveRecording!: (audio: Blob) => void;
    const recorder = createRecorder();
    recorder.record = vi.fn(
      () =>
        new Promise<Blob>((resolve) => {
          resolveRecording = resolve;
        }),
    );
    const speechToText = createSpeechToText();
    const controller = createVoiceController({ recorder, speechToText });

    const pending = controller.listen();
    controller.cancel();
    resolveRecording(new Blob(['private audio'], { type: 'audio/webm' }));

    await expect(pending).resolves.toEqual({ status: 'cancelled' });
    expect(recorder.cancel).toHaveBeenCalledTimes(1);
    expect(speechToText.transcribe).not.toHaveBeenCalled();
    expect(controller.getState()).toBe('idle');
  });

  it('stops listening through the recorder and rejects empty transcripts safely', async () => {
    const recorder = createRecorder();
    const speechToText = createSpeechToText({ transcript: '   ' });
    const controller = createVoiceController({ recorder, speechToText });

    const pending = controller.listen();
    controller.stopListening();
    const result = await pending;

    expect(recorder.stop).toHaveBeenCalledTimes(1);
    expect(result).toMatchObject({ status: 'error' });
    expect(controller.getState()).toBe('error');
  });

  it('cancels current playback before a new mic request and never overlaps speech', async () => {
    const recorder = createRecorder();
    const speechToText = createSpeechToText({
      transcript: 'Ab kya karna hai?',
      language: 'hi-IN',
    });
    const output = createSpeechOutput();
    let resolveFirstSpeech!: (audio: ArrayBuffer) => void;
    output.textToSpeech.synthesize = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<ArrayBuffer>((resolve) => {
            resolveFirstSpeech = resolve;
          }),
      )
      .mockResolvedValue(new Uint8Array([4, 5]).buffer);
    const controller = createVoiceController({
      recorder,
      speechToText,
      textToSpeech: output.textToSpeech,
      playback: output.playback,
    });

    const firstSpeech = controller.say('Pehli instruction', 'hi-IN');
    const transcript = controller.listen();
    resolveFirstSpeech(new Uint8Array([9]).buffer);

    await expect(firstSpeech).resolves.toBeUndefined();
    await expect(transcript).resolves.toMatchObject({
      status: 'transcript',
      language: 'hi-IN',
    });
    expect(output.playback.cancel).toHaveBeenCalled();
    expect(output.playback.play).not.toHaveBeenCalled();
  });

  it('synthesizes normalized, same-language instructions and returns to idle', async () => {
    const output = createSpeechOutput();
    const controller = createVoiceController({
      recorder: createRecorder(),
      speechToText: createSpeechToText(),
      textToSpeech: output.textToSpeech,
      playback: output.playback,
    });

    await controller.say('  Online   Services par click kariye.  ', 'hi-IN');

    expect(output.textToSpeech.synthesize).toHaveBeenCalledWith({
      text: 'Online Services par click kariye.',
      language: 'hi-IN',
    });
    expect(output.playback.play).toHaveBeenCalledWith(expect.any(ArrayBuffer));
    expect(controller.getState()).toBe('idle');
  });
});

describe('speech adapters', () => {
  it('requests microphone permission through MediaRecorder and releases the stream after stopping', async () => {
    const track = { stop: vi.fn() } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [track],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn(async () => stream);
    let fakeState: 'inactive' | 'recording' = 'inactive';
    let fakeRecorder!: MediaRecorder;
    fakeRecorder = {
      get state() {
        return fakeState;
      },
      mimeType: 'audio/webm',
      ondataavailable: null,
      onerror: null,
      onstop: null,
      start: vi.fn(() => {
        fakeState = 'recording';
      }),
      stop: vi.fn(() => {
        fakeState = 'inactive';
        fakeRecorder.ondataavailable?.({
          data: new Blob(['recorded audio'], { type: 'audio/webm' }),
        } as BlobEvent);
        fakeRecorder.onstop?.(new Event('stop'));
      }),
    } as unknown as MediaRecorder;
    const recorder = createBrowserMicrophoneRecorder({
      getUserMedia,
      createMediaRecorder: () => fakeRecorder,
    });

    const pending = recorder.record();
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    recorder.stop?.();
    const audio = await pending;

    expect(getUserMedia).toHaveBeenCalledWith({ audio: true });
    expect(fakeRecorder.start).toHaveBeenCalledTimes(1);
    expect(audio.type).toBe('audio/webm');
    expect(audio.size).toBeGreaterThan(0);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it('uses backend endpoints without exposing provider credentials', async () => {
    const audio = new Blob(['voice bytes'], { type: 'audio/webm' });
    const synthesized = new Uint8Array([7, 8]).buffer;
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(
        createResponse({
          json: { transcript: 'UAN kya hota hai?', language: 'hi-IN' },
        }),
      )
      .mockResolvedValueOnce(createResponse({ audio: synthesized }));
    const client = createSpeechApiClient({
      baseUrl: 'https://voice.example.test',
      fetcher,
    });

    await expect(client.transcribe(audio)).resolves.toEqual({
      transcript: 'UAN kya hota hai?',
      language: 'hi-IN',
    });
    await expect(
      client.synthesize({ text: 'UAN samjhiye.', language: 'hi-IN' }),
    ).resolves.toBe(synthesized);

    const transcribeCall = fetcher.mock.calls[0] as [RequestInfo, RequestInit];
    const synthesizeCall = fetcher.mock.calls[1] as [RequestInfo, RequestInit];
    expect(transcribeCall[0]).toBe('https://voice.example.test/speech/transcribe');
    expect(transcribeCall[1]).toMatchObject({
      method: 'POST',
      body: audio,
      headers: { 'content-type': 'audio/webm' },
    });
    expect(synthesizeCall[0]).toBe('https://voice.example.test/speech/synthesize');
    expect(synthesizeCall[1]).toMatchObject({
      method: 'POST',
      headers: { 'content-type': 'application/json' },
    });
    expect(JSON.parse(String(synthesizeCall[1].body))).toEqual({
      text: 'UAN samjhiye.',
      language: 'hi-IN',
    });
    expect(JSON.stringify(fetcher.mock.calls)).not.toContain('apiKey');
  });

  it('rejects malformed speech responses and serves the development transcript sequence', async () => {
    const fetcher = vi.fn().mockResolvedValue(
      createResponse({ json: { text: 'wrong field' } }),
    );
    const client = createSpeechApiClient({ fetcher });

    await expect(
      client.transcribe(new Blob(['audio'], { type: 'audio/webm' })),
    ).rejects.toThrow('response is invalid');

    const development = createDevelopmentSpeechToText([
      { transcript: 'Pehla sawaal', language: 'hi-IN' },
      { transcript: 'Second question', language: 'en-IN' },
    ]);
    await expect(development.transcribe(new Blob())).resolves.toEqual({
      transcript: 'Pehla sawaal',
      language: 'hi-IN',
    });
    await expect(development.transcribe(new Blob())).resolves.toEqual({
      transcript: 'Second question',
      language: 'en-IN',
    });
    await expect(development.transcribe(new Blob())).resolves.toEqual({
      transcript: 'Second question',
      language: 'en-IN',
    });
  });
});
