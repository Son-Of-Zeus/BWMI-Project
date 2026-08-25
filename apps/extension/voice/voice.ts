import type { CompanionState, SessionStateStore } from '../session/session-state';

export type VoiceState =
  | 'idle'
  | 'listening'
  | 'transcribing'
  | 'thinking'
  | 'guiding'
  | 'speaking'
  | 'waiting'
  | 'success'
  | 'error';

export type SpeechToTextResult = {
  transcript: string;
  language?: string;
};

export interface SpeechToText {
  transcribe(audio: Blob): Promise<SpeechToTextResult>;
}

export interface TextToSpeech {
  synthesize(input: {
    text: string;
    language?: string;
  }): Promise<ArrayBuffer>;
}

export type AudioRecorder = {
  record(): Promise<Blob>;
  stop?(): void;
  cancel(): void;
};

export type AudioPlayback = {
  play(audio: ArrayBuffer): Promise<void>;
  cancel(): void;
};

export const DEFAULT_DEVELOPMENT_TRANSCRIPTS: readonly SpeechToTextResult[] = [
  {
    transcript: 'Mujhe PF ka paisa nikalna hai.',
    language: 'hi-IN',
  },
  {
    transcript: 'Ye UAN kya hota hai?',
    language: 'hi-IN',
  },
  {
    transcript: 'Ab kya karna hai?',
    language: 'hi-IN',
  },
];

export type VoiceResult =
  | {
      status: 'transcript';
      transcript: string;
      language?: string;
    }
  | { status: 'cancelled' }
  | { status: 'error'; error: Error };

export type VoiceControllerOptions = {
  recorder: AudioRecorder;
  speechToText: SpeechToText;
  textToSpeech?: TextToSpeech;
  playback?: AudioPlayback;
  session?: SessionStateStore;
  onTranscript?: (result: SpeechToTextResult) => void;
  onError?: (error: Error) => void;
};

export type VoiceController = {
  getState(): VoiceState;
  subscribe(listener: (state: VoiceState) => void): () => void;
  listen(): Promise<VoiceResult>;
  stopListening(): void;
  say(text: string, language?: string): Promise<void>;
  setState(state: VoiceState): void;
  cancel(): void;
};

export type SpeechApiClientOptions = {
  baseUrl?: string;
  transcribePath?: string;
  synthesizePath?: string;
  fetcher?: typeof fetch;
};

export type BrowserMicrophoneRecorderOptions = {
  getUserMedia?: (
    constraints: MediaStreamConstraints,
  ) => Promise<MediaStream>;
  createMediaRecorder?: (stream: MediaStream) => MediaRecorder;
  mimeType?: string;
  maxDurationMs?: number;
};

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function optionalLanguage(language: unknown): string | undefined {
  if (typeof language !== 'string') {
    return undefined;
  }

  const normalized = normalizeText(language);
  return normalized || undefined;
}

function toCompanionState(state: VoiceState): CompanionState {
  return state === 'transcribing' ? 'thinking' : state;
}

function abortError(): Error {
  if (typeof DOMException !== 'undefined') {
    return new DOMException('Voice operation cancelled.', 'AbortError');
  }
  return new Error('Voice operation cancelled.');
}

function safeCancel(cancel?: () => void): void {
  try {
    cancel?.();
  } catch {
    // Cancellation must not mask the operation that caused it.
  }
}

export function createVoiceController(
  options: VoiceControllerOptions,
): VoiceController {
  const listeners = new Set<(state: VoiceState) => void>();
  let state: VoiceState = 'idle';
  let generation = 0;
  let activeGeneration: number | undefined;

  const publish = (nextState: VoiceState) => {
    if (nextState === state) {
      return;
    }

    state = nextState;
    options.session?.setCompanionState(toCompanionState(nextState));
    listeners.forEach((listener) => listener(state));
  };

  const invalidate = () => {
    generation += 1;
    if (activeGeneration !== undefined) {
      safeCancel(options.recorder.cancel);
      safeCancel(options.playback?.cancel);
    }
    activeGeneration = undefined;
  };

  const begin = (): number => {
    invalidate();
    activeGeneration = generation;
    return generation;
  };

  const finish = (runGeneration: number) => {
    if (activeGeneration === runGeneration) {
      activeGeneration = undefined;
    }
  };

  const isCurrent = (runGeneration: number) => generation === runGeneration;

  const reportError = (error: unknown): Error => {
    const normalized = asError(error);
    publish('error');
    options.onError?.(normalized);
    return normalized;
  };

  return {
    getState() {
      return state;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async listen() {
      const runGeneration = begin();
      publish('listening');

      try {
        const audio = await options.recorder.record();
        if (!isCurrent(runGeneration)) {
          return { status: 'cancelled' };
        }

        publish('transcribing');
        const result = await options.speechToText.transcribe(audio);
        if (!isCurrent(runGeneration)) {
          return { status: 'cancelled' };
        }

        const transcript = normalizeText(result.transcript);
        if (!transcript) {
          throw new Error('Speech recognition returned an empty transcript.');
        }

        const normalizedResult: SpeechToTextResult = {
          transcript,
          ...(optionalLanguage(result.language)
            ? { language: optionalLanguage(result.language) }
            : {}),
        };
        publish('thinking');
        options.onTranscript?.(normalizedResult);

        if (!isCurrent(runGeneration)) {
          return { status: 'cancelled' };
        }
        finish(runGeneration);
        return { status: 'transcript', ...normalizedResult };
      } catch (error) {
        if (!isCurrent(runGeneration)) {
          return { status: 'cancelled' };
        }

        const normalized = reportError(error);
        finish(runGeneration);
        return { status: 'error', error: normalized };
      }
    },

    stopListening() {
      if (state === 'listening') {
        safeCancel(options.recorder.stop);
      }
    },

    async say(text, language) {
      const runGeneration = begin();
      const normalizedText = normalizeText(text);
      if (!normalizedText) {
        const error = reportError(
          new Error('Cannot synthesize an empty instruction.'),
        );
        finish(runGeneration);
        throw error;
      }
      if (!options.textToSpeech || !options.playback) {
        const error = reportError(
          new Error('Text-to-speech and audio playback are not configured.'),
        );
        finish(runGeneration);
        throw error;
      }

      publish('speaking');

      try {
        const audio = await options.textToSpeech.synthesize({
          text: normalizedText,
          ...(optionalLanguage(language)
            ? { language: optionalLanguage(language) }
            : {}),
        });
        if (!isCurrent(runGeneration)) {
          return;
        }

        await options.playback.play(audio);
        if (isCurrent(runGeneration)) {
          publish('idle');
          finish(runGeneration);
        }
      } catch (error) {
        if (!isCurrent(runGeneration)) {
          return;
        }
        const normalized = reportError(error);
        finish(runGeneration);
        throw normalized;
      }
    },

    setState(nextState) {
      publish(nextState);
    },

    cancel() {
      invalidate();
      publish('idle');
    },
  };
}

function endpointFor(baseUrl: string | undefined, path: string): string {
  if (/^[a-z][a-z\d+.-]*:\/\//i.test(path) || !baseUrl) {
    return path;
  }

  return `${baseUrl.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseTranscriptResponse(value: unknown): SpeechToTextResult {
  if (!isRecord(value) || typeof value.transcript !== 'string') {
    throw new Error('Speech-to-text response is invalid.');
  }

  const language = optionalLanguage(value.language);
  return {
    transcript: value.transcript,
    ...(language ? { language } : {}),
  };
}

async function requireOk(response: Response, operation: string): Promise<void> {
  if (!response.ok) {
    throw new Error(`${operation} failed with status ${response.status}.`);
  }
}

export function createSpeechApiClient(
  options: SpeechApiClientOptions = {},
): SpeechToText & TextToSpeech {
  const fetcher = options.fetcher ?? fetch;
  const transcribeEndpoint = endpointFor(
    options.baseUrl,
    options.transcribePath ?? '/speech/transcribe',
  );
  const synthesizeEndpoint = endpointFor(
    options.baseUrl,
    options.synthesizePath ?? '/speech/synthesize',
  );

  return {
    async transcribe(audio) {
      const response = await fetcher(transcribeEndpoint, {
        method: 'POST',
        headers: {
          'content-type': audio.type || 'audio/webm',
        },
        body: audio,
      });
      await requireOk(response, 'Speech-to-text request');
      return parseTranscriptResponse(await response.json());
    },

    async synthesize(input) {
      const response = await fetcher(synthesizeEndpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          text: input.text,
          ...(optionalLanguage(input.language)
            ? { language: optionalLanguage(input.language) }
            : {}),
        }),
      });
      await requireOk(response, 'Text-to-speech request');
      return response.arrayBuffer();
    },
  };
}

export function createDevelopmentSpeechToText(
  transcripts: readonly SpeechToTextResult[] = DEFAULT_DEVELOPMENT_TRANSCRIPTS,
): SpeechToText {
  const sequence = transcripts.length ? transcripts : DEFAULT_DEVELOPMENT_TRANSCRIPTS;
  let index = 0;

  return {
    async transcribe() {
      const result = sequence[Math.min(index, sequence.length - 1)]!;
      index += 1;
      return { ...result };
    },
  };
}

function stopTracks(stream: MediaStream | undefined): void {
  stream?.getTracks().forEach((track) => track.stop());
}

type ActiveRecording = {
  cancelled: boolean;
  stopRequested: boolean;
  settled: boolean;
  chunks: BlobPart[];
  stream?: MediaStream;
  recorder?: MediaRecorder;
  timer?: ReturnType<typeof setTimeout>;
  resolve: (audio: Blob) => void;
  reject: (reason?: unknown) => void;
};

export function createBrowserMicrophoneRecorder(
  options: BrowserMicrophoneRecorderOptions = {},
): AudioRecorder {
  let active: ActiveRecording | undefined;

  const cleanup = (recording: ActiveRecording) => {
    if (recording.timer) {
      clearTimeout(recording.timer);
    }
    stopTracks(recording.stream);
    if (active === recording) {
      active = undefined;
    }
  };

  const settleError = (recording: ActiveRecording, error: unknown) => {
    if (recording.settled) {
      return;
    }
    recording.settled = true;
    cleanup(recording);
    recording.reject(error);
  };

  const settleAudio = (recording: ActiveRecording) => {
    if (recording.settled) {
      return;
    }
    recording.settled = true;
    const mimeType =
      recording.recorder?.mimeType || options.mimeType || 'audio/webm';
    cleanup(recording);
    recording.resolve(new Blob(recording.chunks, { type: mimeType }));
  };

  const stop = () => {
    const recording = active;
    if (!recording) {
      return;
    }
    recording.stopRequested = true;
    if (
      recording.recorder &&
      recording.recorder.state !== 'inactive'
    ) {
      recording.recorder.stop();
    }
  };

  const cancel = () => {
    const recording = active;
    if (!recording) {
      return;
    }
    recording.cancelled = true;
    if (
      recording.recorder &&
      recording.recorder.state !== 'inactive'
    ) {
      recording.recorder.stop();
    }
    settleError(recording, abortError());
  };

  return {
    record() {
      if (active) {
        return Promise.reject(new Error('A microphone recording is already active.'));
      }

      let recording!: ActiveRecording;
      const promise = new Promise<Blob>((resolve, reject) => {
        recording = {
          cancelled: false,
          stopRequested: false,
          settled: false,
          chunks: [],
          resolve,
          reject,
        };
        active = recording;

        const initialize = async () => {
          try {
            const getUserMedia =
              options.getUserMedia ??
              navigator.mediaDevices?.getUserMedia.bind(navigator.mediaDevices);
            if (!getUserMedia) {
              throw new Error('Microphone access is unavailable in this browser.');
            }

            recording.stream = await getUserMedia({ audio: true });
            if (recording.cancelled || recording.settled) {
              stopTracks(recording.stream);
              return;
            }

            const createMediaRecorder =
              options.createMediaRecorder ?? ((stream: MediaStream) => {
                if (typeof MediaRecorder === 'undefined') {
                  throw new Error('MediaRecorder is unavailable in this browser.');
                }
                return new MediaRecorder(
                  stream,
                  options.mimeType ? { mimeType: options.mimeType } : undefined,
                );
              });
            recording.recorder = createMediaRecorder(recording.stream);
            recording.recorder.ondataavailable = (event) => {
              if (event.data.size > 0) {
                recording.chunks.push(event.data);
              }
            };
            recording.recorder.onerror = () => {
              settleError(
                recording,
                new Error('Microphone recording failed.'),
              );
            };
            recording.recorder.onstop = () => {
              if (recording.cancelled) {
                settleError(recording, abortError());
              } else {
                settleAudio(recording);
              }
            };
            recording.recorder.start();

            if (options.maxDurationMs && options.maxDurationMs > 0) {
              recording.timer = setTimeout(stop, options.maxDurationMs);
            }
            if (recording.stopRequested) {
              stop();
            }
          } catch (error) {
            settleError(recording, error);
          }
        };

        void initialize();
      });

      return promise;
    },
    stop,
    cancel,
  };
}

export function createBrowserAudioPlayback(): AudioPlayback {
  let active:
    | {
        audio: HTMLAudioElement;
        url: string;
        settled: boolean;
        resolve: () => void;
        reject: (reason?: unknown) => void;
      }
    | undefined;

  const cleanup = (current: NonNullable<typeof active>) => {
    current.audio.onended = null;
    current.audio.onerror = null;
    current.audio.pause();
    current.audio.removeAttribute('src');
    URL.revokeObjectURL(current.url);
    if (active === current) {
      active = undefined;
    }
  };

  const cancel = () => {
    const current = active;
    if (!current || current.settled) {
      return;
    }
    current.settled = true;
    cleanup(current);
    current.resolve();
  };

  return {
    play(audioBuffer) {
      cancel();
      const url = URL.createObjectURL(
        new Blob([audioBuffer], { type: 'audio/mpeg' }),
      );
      const audio = new Audio(url);

      return new Promise<void>((resolve, reject) => {
        const current = {
          audio,
          url,
          settled: false,
          resolve,
          reject,
        };
        active = current;

        const finish = () => {
          if (current.settled) {
            return;
          }
          current.settled = true;
          cleanup(current);
          resolve();
        };
        const fail = (error: unknown) => {
          if (current.settled) {
            return;
          }
          current.settled = true;
          cleanup(current);
          reject(asError(error));
        };

        audio.onended = finish;
        audio.onerror = () => fail(new Error('Audio playback failed.'));
        void audio.play().catch(fail);
      });
    },
    cancel,
  };
}
