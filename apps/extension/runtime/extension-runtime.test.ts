import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createCompanionUiStore } from '../companion/companion-ui';
import type { GuideAction, Reasoner } from '../reasoning/reasoning';
import type {
  AudioPlayback,
  AudioRecorder,
  SpeechToText,
  TextToSpeech,
} from '../voice/voice';
import { createExtensionRuntime } from './extension-runtime';

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

function createHarness(loadingLatencyNoticeMs?: number) {
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
  const runtime = createExtensionRuntime({
    document,
    companion,
    reasoner,
    recorder,
    speechToText,
    textToSpeech,
    playback,
    viewport: () => ({ width: 800, height: 600 }),
    waitForLayout: async () => undefined,
    waitForMovement: async () => undefined,
    waitForPageSettled: async () => undefined,
    loadingLatencyNoticeMs,
  });

  return { button, companion, recorder, speechToText, textToSpeech, playback, reasoner, runtime, host };
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
