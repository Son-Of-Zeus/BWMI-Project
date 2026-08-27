import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SemanticPageSnapshot, SemanticScanner } from '../dom/semantic';
import type { GuideController, GuideResult } from '../guide/guide-controller';
import type {
  InteractionEvent,
  InteractionObserver,
} from '../interaction/interaction-observer';
import type {
  GuideAction,
  ReasonRequest,
  Reasoner,
} from '../reasoning/reasoning';
import { createElementRegistry } from '../registry/element-registry';
import { createSessionState } from '../session/session-state';
import {
  createFlowController,
  type FlowController,
} from './flow-controller';
import type {
  SpeechToTextResult,
  VoiceController,
  VoiceResult,
} from '../voice/voice';

const initialTranscript: SpeechToTextResult = {
  transcript: 'Mujhe PF ka paisa nikalna hai.',
  language: 'hi-IN',
};

function createScanner() {
  let listener: ((snapshot: SemanticPageSnapshot) => void) | undefined;
  const semanticSnapshot: SemanticPageSnapshot = {
    page: { title: 'Member Dashboard', section: 'Member Services' },
    elements: [],
  };
  const scanner: SemanticScanner = {
    scan: vi.fn(() => semanticSnapshot),
    start: vi.fn(),
    stop: vi.fn(),
    subscribe(callback) {
      listener = callback;
      return () => {
        listener = undefined;
      };
    },
  };

  return {
    scanner,
    emit() {
      listener?.(semanticSnapshot);
    },
  };
}

function createInteractions() {
  let listener: ((event: InteractionEvent) => void) | undefined;
  const interactions: InteractionObserver = {
    start: vi.fn(),
    stop: vi.fn(),
    subscribe(callback) {
      listener = callback;
      return () => {
        listener = undefined;
      };
    },
  };

  return {
    interactions,
    emit(event: InteractionEvent) {
      listener?.(event);
    },
  };
}

function createVoice(result: VoiceResult = { status: 'transcript', ...initialTranscript }) {
  const voice: VoiceController = {
    getState: vi.fn(() => 'idle' as const),
    subscribe: vi.fn(() => () => undefined),
    listen: vi.fn(async () => result),
    stopListening: vi.fn(),
    say: vi.fn(async () => undefined),
    setState: vi.fn(),
    cancel: vi.fn(),
  };
  return voice;
}

function createGuide(
  session: ReturnType<typeof createSessionState>,
): GuideController {
  return {
    run: vi.fn(async (action: GuideAction): Promise<GuideResult> => {
      if (action.action === 'guide') {
        session.setPendingAction({
          targetId: action.targetId,
          expectedUserAction: action.expectedUserAction,
        });
        return { status: 'guided', targetId: action.targetId };
      }
      return { status: 'completed', action: action.action };
    }),
    cancel: vi.fn(),
  };
}

function createHarness(
  actions: GuideAction[],
  buttonLabel = 'Online Services',
) {
  const button = document.createElement('button');
  button.textContent = buttonLabel;
  document.body.append(button);

  const scannerHarness = createScanner();
  const interactionHarness = createInteractions();
  const registry = createElementRegistry();
  const session = createSessionState();
  const voice = createVoice();
  const guide = createGuide(session);
  const reasoner: Reasoner = {
    reason: vi.fn(async (_request: ReasonRequest) => {
      const action = actions.shift();
      if (!action) {
        throw new Error('No test action remaining.');
      }
      return action;
    }),
  };
  const flow = createFlowController({
    document,
    scanner: scannerHarness.scanner,
    registry,
    session,
    interactions: interactionHarness.interactions,
    reasoner,
    guide,
    voice,
    waitForPageSettled: async () => undefined,
  });

  return {
    button,
    scanner: scannerHarness,
    interactions: interactionHarness,
    registry,
    session,
    voice,
    guide,
    reasoner,
    flow,
  };
}

const guideAction: GuideAction = {
  action: 'guide',
  targetId: 'el_1',
  spokenInstruction: 'Online Services par click kariye.',
  expectedUserAction: 'click',
  language: 'hi-IN',
};

describe('PF flow controller', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('starts the scanner and observer, builds a safe page request, and guides the selected target', async () => {
    const harness = createHarness([guideAction]);
    harness.flow.start();

    const result = await harness.flow.requestVoice();

    expect(harness.scanner.scanner.start).toHaveBeenCalledTimes(1);
    expect(harness.interactions.interactions.start).toHaveBeenCalledTimes(1);
    expect(harness.reasoner.reason).toHaveBeenCalledWith(
      expect.objectContaining({
        userUtterance: initialTranscript.transcript,
        userLanguage: initialTranscript.language,
        page: expect.objectContaining({
          title: 'Member Dashboard',
          elements: [expect.objectContaining({ id: 'el_1', label: 'Online Services' })],
        }),
      }),
    );
    expect(result).toMatchObject({
      status: 'completed',
      action: guideAction,
      guide: { status: 'guided', targetId: 'el_1' },
    });
    expect(harness.flow.getSnapshot()).toMatchObject({
      phase: 'waiting',
      lastTranscript: initialTranscript,
      lastAction: guideAction,
    });
    expect(harness.session.getState()).toMatchObject({
      goal: initialTranscript.transcript,
      pendingAction: { targetId: 'el_1', expectedUserAction: 'click' },
      companionState: 'waiting',
    });
  });

  it('persists generic readiness metadata so later voice turns retain the clarification plan', async () => {
    const workflow = {
      intent: 'complete a request',
      requiredInformation: ['request details'],
      knownInformation: [],
      missingInformation: ['request details'],
      readiness: 'needs_clarification' as const,
      clarifyingQuestion: 'What details should I use for this request?',
    };
    const clarifyAction: GuideAction = {
      action: 'clarify',
      spokenInstruction: workflow.clarifyingQuestion,
      language: 'en-IN',
      workflow,
    };
    const harness = createHarness([clarifyAction]);
    harness.flow.start();

    await expect(harness.flow.requestVoice()).resolves.toMatchObject({
      status: 'completed',
      action: clarifyAction,
      guide: { status: 'completed', action: 'clarify' },
    });
    expect(harness.session.getState().workflow).toEqual(workflow);
    expect(harness.session.getState().pendingAction).toBeUndefined();
  });

  it('waits for an explicit input completion phrase instead of advancing on validation', async () => {
    const inputAction: GuideAction = {
      ...guideAction,
      expectedUserAction: 'input',
    };
    const successAction: GuideAction = {
      action: 'success',
      spokenInstruction: 'Aapka request complete ho gaya.',
      language: 'en-IN',
    };
    const harness = createHarness([inputAction, successAction]);
    harness.flow.start();
    await harness.flow.requestVoice();

    harness.interactions.emit({
      type: 'input-complete',
      action: 'input',
      targetId: 'el_1',
      label: 'UAN',
      matchedPending: false,
      hasValue: true,
      validationState: 'valid',
      timestamp: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(harness.reasoner.reason).toHaveBeenCalledTimes(1);
    expect(harness.session.getState().pendingAction).toEqual({
      targetId: 'el_1',
      expectedUserAction: 'input',
    });

    harness.voice.listen = vi.fn(async () => ({
      status: 'transcript' as const,
      transcript: "I'm done",
      language: 'en-IN',
    }));
    await expect(harness.flow.requestVoice()).resolves.toMatchObject({
      status: 'completed',
      action: successAction,
    });
    expect(harness.reasoner.reason).toHaveBeenCalledTimes(2);
    expect(harness.flow.getSnapshot().phase).toBe('success');
  });

  it('retries post-transcription failures without asking for another recording', async () => {
    const harness = createHarness([]);
    const failingReasoner = vi.fn(async () => {
      throw new Error('Reasoning service unavailable.');
    });
    harness.reasoner.reason = failingReasoner;
    harness.flow.start();

    const failed = await harness.flow.requestVoice();

    expect(failed).toMatchObject({ status: 'error' });
    expect(harness.voice.listen).toHaveBeenCalledTimes(1);
    expect(harness.flow.getSnapshot().retryTranscript).toEqual(initialTranscript);

    const retryReasoner = vi.fn(async () => ({ action: 'wait' as const }));
    harness.reasoner.reason = retryReasoner;
    const retried = await harness.flow.retry();

    expect(retried).toMatchObject({
      status: 'completed',
      action: { action: 'wait' },
    });
    expect(harness.voice.listen).toHaveBeenCalledTimes(1);
    expect(failingReasoner).toHaveBeenCalledTimes(1);
    expect(retryReasoner).toHaveBeenCalledTimes(1);
    expect(harness.flow.getSnapshot()).toMatchObject({
      phase: 'waiting',
      retryTranscript: undefined,
    });
  });

  it('falls back to fresh voice capture when the original request has no transcript', async () => {
    const harness = createHarness([{ action: 'wait' }]);
    let listenCalls = 0;
    harness.voice.listen = vi.fn(async () => {
      listenCalls += 1;
      if (listenCalls === 1) {
        return {
          status: 'error' as const,
          error: new Error('Microphone unavailable.'),
        };
      }
      return { status: 'transcript' as const, ...initialTranscript };
    });
    harness.flow.start();

    await expect(harness.flow.requestVoice()).resolves.toMatchObject({
      status: 'error',
    });
    const recovered = await harness.flow.retry();

    expect(recovered).toMatchObject({
      status: 'completed',
      action: { action: 'wait' },
    });
    expect(listenCalls).toBe(2);
  });

  it('reasons again after the expected user action and keeps the loop on the new page', async () => {
    const successAction: GuideAction = {
      action: 'success',
      spokenInstruction: 'Aapka request complete ho gaya.',
      language: 'hi-IN',
    };
    const harness = createHarness([guideAction, successAction]);
    harness.flow.start();
    await harness.flow.requestVoice();

    const claimButton = document.createElement('button');
    claimButton.textContent = 'Claim Status';
    document.body.append(claimButton);
    harness.scanner.emit();

    harness.interactions.emit({
      type: 'click',
      action: 'click',
      targetId: 'el_1',
      label: 'Online Services',
      matchedPending: true,
      timestamp: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(harness.reasoner.reason).toHaveBeenCalledTimes(2);
    expect(harness.reasoner.reason).toHaveBeenLastCalledWith(
      expect.objectContaining({
        page: expect.objectContaining({
          elements: expect.arrayContaining([
            expect.objectContaining({ label: 'Claim Status' }),
          ]),
        }),
      }),
    );
    expect(harness.guide.run).toHaveBeenCalledTimes(2);
    expect(harness.flow.getSnapshot()).toMatchObject({
      phase: 'success',
      lastAction: successAction,
    });

    harness.interactions.emit({
      type: 'navigation',
      url: 'http://localhost:5173/claims/success',
      previousUrl: 'http://localhost:5173/claims/review',
      reason: 'push-state',
      timestamp: 2,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(harness.reasoner.reason).toHaveBeenCalledTimes(2);
    expect(harness.flow.getSnapshot().phase).toBe('success');
  });

  it('enters success after a matched final-submit click without re-reasoning', async () => {
    const submitAction: GuideAction = {
      ...guideAction,
      spokenInstruction: 'Submit Request par click kariye.',
      consequence: 'Isse aapki request submit ho jayegi.',
    };
    const harness = createHarness([submitAction], 'Submit Request');
    harness.flow.start();
    await harness.flow.requestVoice();

    harness.interactions.emit({
      type: 'click',
      action: 'click',
      targetId: 'el_1',
      label: 'Submit Request',
      matchedPending: true,
      timestamp: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(harness.reasoner.reason).toHaveBeenCalledTimes(1);
    expect(harness.flow.getSnapshot()).toMatchObject({
      phase: 'success',
      lastAction: submitAction,
    });
    expect(harness.session.getState().companionState).toBe('success');

    harness.interactions.emit({
      type: 'navigation',
      url: 'http://localhost:5173/withdrawal',
      previousUrl: 'http://localhost:5173/withdrawal',
      reason: 'url-poll',
      timestamp: 2,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(harness.reasoner.reason).toHaveBeenCalledTimes(1);
    expect(harness.flow.getSnapshot().phase).toBe('success');
  });

  it('coalesces repeated continuation events while reasoning is in flight', async () => {
    const nextAction: GuideAction = { action: 'wait' };
    const harness = createHarness([guideAction, nextAction]);
    harness.flow.start();
    await harness.flow.requestVoice();

    let releaseReasoning!: (action: GuideAction) => void;
    const pendingReasoning = new Promise<GuideAction>((resolve) => {
      releaseReasoning = resolve;
    });
    harness.reasoner.reason = vi.fn(() => pendingReasoning);

    harness.interactions.emit({
      type: 'navigation',
      url: 'http://localhost:5173/claims/review',
      previousUrl: 'http://localhost:5173/dashboard',
      reason: 'push-state',
      timestamp: 1,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    harness.interactions.emit({
      type: 'navigation',
      url: 'http://localhost:5173/claims/review',
      previousUrl: 'http://localhost:5173/dashboard',
      reason: 'url-poll',
      timestamp: 2,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(harness.reasoner.reason).toHaveBeenCalledTimes(1);
    releaseReasoning(nextAction);
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(harness.reasoner.reason).toHaveBeenCalledTimes(1);
    expect(harness.guide.run).toHaveBeenCalledTimes(2);
  });

  it('keeps guidance active after an unmatched page interaction', async () => {
    const harness = createHarness([guideAction]);
    harness.flow.start();
    await harness.flow.requestVoice();
    const cancelCallCount = vi.mocked(harness.guide.cancel).mock.calls.length;

    const unexpectedButton = document.createElement('button');
    unexpectedButton.textContent = 'Claim Status';
    document.body.append(unexpectedButton);
    harness.scanner.emit();

    harness.interactions.emit({
      type: 'click',
      action: 'click',
      targetId: 'el_2',
      label: 'Claim Status',
      matchedPending: false,
      timestamp: 2,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(harness.reasoner.reason).toHaveBeenCalledTimes(1);
    expect(harness.guide.cancel).toHaveBeenCalledTimes(cancelCallCount);
    expect(harness.session.getState()).toMatchObject({
      pendingAction: { targetId: 'el_1', expectedUserAction: 'click' },
    });
    expect(harness.flow.getSnapshot().phase).toBe('waiting');
  });

  it('does not cancel an input guide while the user clicks or types in the field', async () => {
    const inputAction: GuideAction = {
      ...guideAction,
      expectedUserAction: 'input',
    };
    const harness = createHarness([inputAction]);
    harness.flow.start();
    await harness.flow.requestVoice();
    const cancelCallCount = vi.mocked(harness.guide.cancel).mock.calls.length;

    harness.interactions.emit({
      type: 'click',
      action: 'click',
      targetId: 'el_1',
      label: 'UAN',
      matchedPending: false,
      timestamp: 1,
    });
    harness.interactions.emit({
      type: 'input-complete',
      action: 'input',
      targetId: 'el_1',
      label: 'UAN',
      matchedPending: false,
      hasValue: true,
      validationState: 'valid',
      timestamp: 2,
    });
    await new Promise((resolve) => setTimeout(resolve, 5));

    expect(harness.guide.cancel).toHaveBeenCalledTimes(cancelCallCount);
    expect(harness.reasoner.reason).toHaveBeenCalledTimes(1);
    expect(harness.session.getState().pendingAction).toEqual({
      targetId: 'el_1',
      expectedUserAction: 'input',
    });
    expect(harness.flow.getSnapshot().phase).toBe('waiting');
  });

  it('preserves pending workflow context for a voice explanation interruption', async () => {
    const explainAction: GuideAction = {
      action: 'explain',
      targetId: 'el_1',
      spokenInstruction: 'Online Services ek menu hai.',
      language: 'hi-IN',
    };
    const harness = createHarness([guideAction, explainAction]);
    harness.flow.start();
    await harness.flow.requestVoice();
    (harness.voice.listen as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      status: 'transcript',
      transcript: 'Ye Online Services kya hai?',
      language: 'hi-IN',
    });

    const result = await harness.flow.requestVoice();

    expect(result).toMatchObject({
      status: 'completed',
      action: explainAction,
    });
    expect(harness.guide.cancel).toHaveBeenLastCalledWith({
      preservePendingAction: true,
    });
    expect(harness.session.getState()).toMatchObject({
      pendingAction: { targetId: 'el_1', expectedUserAction: 'click' },
      companionState: 'waiting',
    });
    expect(harness.flow.getSnapshot().phase).toBe('waiting');
  });

  it('cancels an in-flight voice request before it can reason or guide', async () => {
    let resolveVoice!: (result: VoiceResult) => void;
    const harness = createHarness([guideAction]);
    harness.voice.listen = vi.fn(
      () =>
        new Promise<VoiceResult>((resolve) => {
          resolveVoice = resolve;
        }),
    );
    harness.flow.start();

    const pending = harness.flow.requestVoice();
    harness.flow.cancel();
    resolveVoice({ status: 'transcript', ...initialTranscript });

    await expect(pending).resolves.toEqual({ status: 'cancelled' });
    expect(harness.reasoner.reason).not.toHaveBeenCalled();
    expect(harness.guide.run).not.toHaveBeenCalled();
    expect(harness.voice.cancel).toHaveBeenCalled();
    expect(harness.flow.getSnapshot().phase).toBe('idle');
  });

  it('resets the workflow, cancels active services, and rescans the current page', async () => {
    const harness = createHarness([guideAction]);
    harness.flow.start();
    await harness.flow.requestVoice();
    harness.session.recordAction({ type: 'click', label: 'Online Services' });

    harness.flow.reset();

    expect(harness.guide.cancel).toHaveBeenCalled();
    expect(harness.voice.cancel).toHaveBeenCalled();
    expect(harness.session.getState()).toEqual({
      recentActions: [],
      companionState: 'idle',
    });
    expect(harness.flow.getSnapshot().phase).toBe('idle');
    expect(harness.flow.getSnapshot().page).not.toBeNull();
    expect(harness.flow.getSnapshot().lastTranscript).toBeUndefined();
    expect(harness.flow.getSnapshot().lastAction).toBeUndefined();
    expect(harness.flow.getSnapshot().error).toBeUndefined();
    expect(harness.reasoner.reason).toHaveBeenCalledTimes(1);
  });

  it('ignores a late voice result after demo reset', async () => {
    let resolveVoice!: (result: VoiceResult) => void;
    const harness = createHarness([guideAction]);
    harness.voice.listen = vi.fn(
      () =>
        new Promise<VoiceResult>((resolve) => {
          resolveVoice = resolve;
        }),
    );
    harness.flow.start();

    const pending = harness.flow.requestVoice();
    harness.flow.reset();
    resolveVoice({ status: 'transcript', ...initialTranscript });

    await expect(pending).resolves.toEqual({ status: 'cancelled' });
    expect(harness.reasoner.reason).not.toHaveBeenCalled();
    expect(harness.flow.getSnapshot().phase).toBe('idle');
  });

  it('stops all observers and cancels active work on teardown', () => {
    const harness = createHarness([]);
    harness.flow.start();
    harness.flow.stop();

    expect(harness.scanner.scanner.stop).toHaveBeenCalledTimes(1);
    expect(harness.interactions.interactions.stop).toHaveBeenCalledTimes(1);
    expect(harness.guide.cancel).toHaveBeenCalled();
    expect(harness.voice.cancel).toHaveBeenCalled();
    expect(harness.flow.getSnapshot().phase).toBe('stopped');
  });
});
