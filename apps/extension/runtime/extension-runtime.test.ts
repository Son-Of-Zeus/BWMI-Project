import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCompanionUiStore } from '../companion/companion-ui';
import type { GuideAction, Reasoner } from '../reasoning/reasoning';
import type {
  AudioPlayback,
  AudioRecorder,
  SpeechToText,
  TextToSpeech,
} from '../voice/voice';
import {
  createExtensionRuntime,
  type ExtensionDebugEvent,
  type ExtensionDebugOptions,
  type ExtensionDevelopmentOptions,
} from './extension-runtime';

function targetRect(): DOMRect {
  return {
    top: 100,
    bottom: 140,
    left: 100,
    right: 300,
    width: 200,
    height: 40,
    x: 100,
    y: 100,
    toJSON: () => ({}),
  } as DOMRect;
}

function createHarness(
  loadingLatencyNoticeMs?: number,
  debug?: ExtensionDebugOptions,
  development?: ExtensionDevelopmentOptions,
  useBackendClient = false,
) {
  const button = document.createElement('button');
  button.textContent = 'Online Services';
  vi.spyOn(button, 'getBoundingClientRect').mockReturnValue(targetRect());
  Object.defineProperty(button, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
  document.body.append(button);

  const host = document.createElement('div');
  document.body.append(host);
  const companion = createCompanionUiStore(host);
  const recorder: AudioRecorder = {
    record: vi.fn(async () => new Blob(['audio'], { type: 'audio/webm' })),
    stop: vi.fn(),
    cancel: vi.fn(),
  };
  const speechToText: SpeechToText = {
    transcribe: vi.fn(async () => ({
      transcript: 'Mujhe PF ka paisa nikalna hai.',
      language: 'hi-IN',
    })),
  };
  const textToSpeech: TextToSpeech = {
    synthesize: vi.fn(async () => new Uint8Array([1, 2]).buffer),
  };
  const playback: AudioPlayback = {
    play: vi.fn(async () => undefined),
    cancel: vi.fn(),
  };
  const reasoner: Reasoner = {
    reason: vi.fn(async (request) => {
      expect(request.page.elements).toEqual([
        expect.objectContaining({
          id: 'el_1',
          label: 'Online Services',
        }),
      ]);
      return {
        action: 'guide' as const,
        targetId: 'el_1',
        spokenInstruction: 'Online Services par click kariye.',
        expectedUserAction: 'click' as const,
        language: 'hi-IN',
      };
    }),
  };
  const backendFetcher = useBackendClient
    ? vi.fn(async () =>
        ({
          ok: true,
          status: 200,
          json: async () => ({
            action: 'guide',
            targetId: 'el_1',
            spokenInstruction: 'Online Services par click kariye.',
            expectedUserAction: 'click',
            language: 'hi-IN',
          }),
        }) as Response,
      )
    : undefined;
  const latencyLogger = vi.fn();
  const runtime = createExtensionRuntime({
    document,
    companion,
    reasoner: development || useBackendClient ? undefined : reasoner,
    recorder,
    speechToText: development ? undefined : speechToText,
    textToSpeech,
    playback,
    viewport: () => ({ width: 800, height: 600 }),
    waitForLayout: async () => undefined,
    waitForMovement: async () => undefined,
    waitForPageSettled: async () => undefined,
    loadingLatencyNoticeMs,
    debug,
    development,
    fetcher: backendFetcher,
    latency: { logger: latencyLogger },
  });

  return {
    button,
    companion,
    recorder,
    speechToText,
    textToSpeech,
    playback,
    reasoner,
    backendFetcher,
    latencyLogger,
    runtime,
    host,
  };
}

describe('extension runtime', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('wires the companion microphone to the full extension-owned flow', async () => {
    const harness = createHarness();
    harness.runtime.start();

    harness.companion.toggleListening();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(harness.recorder.record).toHaveBeenCalledTimes(1);
    expect(harness.speechToText.transcribe).toHaveBeenCalledTimes(1);
    expect(harness.reasoner.reason).toHaveBeenCalledTimes(1);
    expect(harness.textToSpeech.synthesize).toHaveBeenCalledWith({
      text: 'Online Services par click kariye.',
      language: 'hi-IN',
    });
    expect(harness.companion.getSnapshot()).toMatchObject({
      state: 'waiting',
      highlightRect: expect.objectContaining({ top: 100, bottom: 140 }),
    });
    expect(harness.runtime.session.getState()).toMatchObject({
      pendingAction: { targetId: 'el_1', expectedUserAction: 'click' },
      companionState: 'waiting',
    });
    expect(harness.companion.getSnapshot().latencyMetrics.map(
      (metric) => metric.stage,
    )).toEqual(expect.arrayContaining([
      'recording',
      'speech-to-text',
      'semantic-scan',
      'reasoning',
      'movement',
      'text-to-speech',
      'playback',
    ]));
    expect(harness.latencyLogger).toHaveBeenCalled();
  });

  it('defaults reasoning requests to the local Gemini-backed backend', async () => {
    const harness = createHarness(undefined, undefined, undefined, true);
    harness.runtime.start();

    harness.companion.toggleListening();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(harness.backendFetcher).toHaveBeenCalledWith(
      'http://127.0.0.1:8787/reason',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(harness.companion.getSnapshot().state).toBe('waiting');

    harness.runtime.stop();
    harness.companion.destroy();
  });

  it('uses the microphone control to retry a failed request without recording again', async () => {
    const harness = createHarness();
    let reasonCalls = 0;
    harness.reasoner.reason = vi.fn(async () => {
      reasonCalls += 1;
      if (reasonCalls === 1) {
        throw new Error('Reasoning service unavailable.');
      }
      return { action: 'wait' as const };
    });
    harness.runtime.start();

    harness.companion.toggleListening();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(harness.companion.getSnapshot().state).toBe('error');
    expect(harness.recorder.record).toHaveBeenCalledTimes(1);

    harness.companion.toggleListening();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(reasonCalls).toBe(2);
    expect(harness.recorder.record).toHaveBeenCalledTimes(1);
    expect(harness.companion.getSnapshot().state).toBe('waiting');

    harness.runtime.stop();
    harness.companion.destroy();
  });

  it('uses a second companion press to explicitly stop active reasoning', async () => {
    const harness = createHarness();
    let resolveReason!: (action: GuideAction) => void;
    harness.reasoner.reason = vi.fn(
      () => new Promise<GuideAction>((resolve) => {
        resolveReason = resolve;
      }),
    );
    harness.runtime.start();

    harness.companion.toggleListening();
    await vi.waitFor(() => {
      expect(harness.companion.getSnapshot().state).toBe('thinking');
    });
    harness.companion.toggleListening();

    expect(harness.runtime.flow.getSnapshot().phase).toBe('idle');
    expect(harness.companion.getSnapshot().state).toBe('idle');

    resolveReason({ action: 'wait' });
    await new Promise((resolve) => setTimeout(resolve, 5));
    expect(harness.runtime.flow.getSnapshot().phase).toBe('idle');

    harness.runtime.stop();
    harness.companion.destroy();
  });

  it('emits opt-in safe semantic and target diagnostics without DOM references', async () => {
    const events: ExtensionDebugEvent[] = [];
    const harness = createHarness(undefined, {
      enabled: true,
      logger: (event) => events.push(event),
    });
    harness.runtime.start();

    harness.companion.toggleListening();
    await new Promise((resolve) => setTimeout(resolve, 10));

    const snapshotEvent = events.find(
      (event) => event.type === 'semantic-snapshot',
    );
    const targetEvent = events.find((event) => event.type === 'target-box');
    expect(snapshotEvent).toMatchObject({
      type: 'semantic-snapshot',
      page: {
        elements: [expect.objectContaining({ id: 'el_1' })],
      },
    });
    expect(targetEvent).toMatchObject({
      type: 'target-box',
      targetId: 'el_1',
      rect: { top: 100, bottom: 140, left: 100, right: 300 },
    });
    expect(targetEvent).not.toHaveProperty('element');
    expect(snapshotEvent).not.toHaveProperty('page.elements[0].element');

    harness.runtime.stop();
    harness.companion.destroy();
  });

  it('enables mocked transcript and reasoner adapters only in development mode', async () => {
    const developmentReasoner: Reasoner = {
      reason: vi.fn(async () => ({ action: 'wait' as const })),
    };
    const harness = createHarness(undefined, undefined, {
      enabled: true,
      transcripts: [
        { transcript: 'Development request', language: 'en-IN' },
      ],
      reasoner: developmentReasoner,
    });
    harness.runtime.start();

    harness.companion.toggleListening();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(harness.speechToText.transcribe).not.toHaveBeenCalled();
    expect(developmentReasoner.reason).toHaveBeenCalledTimes(1);
    expect(harness.runtime.session.getState().goal).toBe('Development request');
    expect(harness.companion.getSnapshot().state).toBe('waiting');

    harness.runtime.stop();
    harness.companion.destroy();
  });

  it('resets extension state through the companion demo control', async () => {
    const harness = createHarness();
    harness.runtime.start();

    harness.companion.toggleListening();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(harness.companion.getSnapshot().state).toBe('waiting');

    harness.companion.resetDemo();

    expect(harness.runtime.session.getState()).toEqual({
      recentActions: [],
      companionState: 'idle',
    });
    expect(harness.runtime.flow.getSnapshot().phase).toBe('idle');
    expect(harness.runtime.flow.getSnapshot().lastTranscript).toBeUndefined();
    expect(harness.runtime.flow.getSnapshot().lastAction).toBeUndefined();
    expect(harness.companion.getSnapshot()).toMatchObject({
      state: 'idle',
      targetRect: null,
      focusMaskActive: false,
      highlightRect: null,
    });

    harness.runtime.stop();
    harness.companion.destroy();
  });

  it('announces slow reasoning and clears the notice when work completes', async () => {
    const harness = createHarness(1);
    let resolveReason!: (action: GuideAction) => void;
    harness.reasoner.reason = vi.fn(
      () =>
        new Promise<GuideAction>((resolve) => {
          resolveReason = resolve;
        }),
    );
    harness.runtime.start();

    harness.companion.toggleListening();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(harness.companion.getSnapshot()).toMatchObject({
      state: 'thinking',
      latencyNotice: true,
    });

    resolveReason({ action: 'wait' });
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(harness.companion.getSnapshot()).toMatchObject({
      state: 'waiting',
      latencyNotice: false,
    });

    harness.runtime.stop();
    harness.companion.destroy();
  });

  it('announces slow speech synthesis and clears the notice after playback', async () => {
    const harness = createHarness(1);
    let resolveSynthesis!: (audio: ArrayBuffer) => void;
    harness.textToSpeech.synthesize = vi.fn(
      () =>
        new Promise<ArrayBuffer>((resolve) => {
          resolveSynthesis = resolve;
        }),
    );
    harness.runtime.start();

    harness.companion.toggleListening();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(harness.companion.getSnapshot()).toMatchObject({
      state: 'speaking',
      latencyNotice: true,
    });

    resolveSynthesis(new Uint8Array([1, 2]).buffer);
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(harness.companion.getSnapshot()).toMatchObject({
      state: 'waiting',
      latencyNotice: false,
    });

    harness.runtime.stop();
    harness.companion.destroy();
  });

  it('stops scanners, observers, and microphone wiring during teardown', () => {
    const harness = createHarness();
    harness.runtime.start();
    harness.runtime.stop();

    expect(harness.runtime.scanner).toBeDefined();
    expect(harness.runtime.interactions).toBeDefined();
    expect(harness.runtime.flow.getSnapshot().phase).toBe('stopped');

    harness.companion.toggleListening();
    expect(harness.recorder.record).not.toHaveBeenCalled();
    expect(harness.companion.getSnapshot().state).toBe('listening');

    harness.runtime.stop();
    harness.companion.destroy();
  });

  it('supports a restart with fresh runtime subscriptions', async () => {
    const harness = createHarness();
    harness.runtime.start();
    harness.runtime.stop();
    harness.runtime.start();

    harness.companion.toggleListening();
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(harness.recorder.record).toHaveBeenCalledTimes(1);
    expect(harness.reasoner.reason).toHaveBeenCalledTimes(1);

    harness.runtime.stop();
    harness.companion.destroy();
  });
});
