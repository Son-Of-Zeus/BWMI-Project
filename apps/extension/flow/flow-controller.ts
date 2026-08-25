import {
  discoverSemanticElements,
  type SemanticPageSnapshot,
  type SemanticScanner,
} from '../dom/semantic';
import type { GuideController, GuideResult } from '../guide/guide-controller';
import type {
  InteractionEvent,
  InteractionObserver,
} from '../interaction/interaction-observer';
import {
  buildReasonRequest,
  type GuideAction,
  type Reasoner,
  type ReasoningPage,
} from '../reasoning/reasoning';
import type { ElementRegistry } from '../registry/element-registry';
import type { SessionStateStore } from '../session/session-state';
import type {
  SpeechToTextResult,
  VoiceController,
  VoiceResult,
} from '../voice/voice';

export type FlowPhase =
  | 'stopped'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'guiding'
  | 'waiting'
  | 'success'
  | 'error';

export type FlowSnapshot = {
  phase: FlowPhase;
  page: ReasoningPage | null;
  lastTranscript?: SpeechToTextResult;
  retryTranscript?: SpeechToTextResult;
  lastAction?: GuideAction;
  error?: Error;
};

export type FlowResult =
  | {
      status: 'completed';
      transcript: SpeechToTextResult;
      action: GuideAction;
      guide: GuideResult;
    }
  | { status: 'cancelled' }
  | { status: 'error'; error: Error };

export type FlowControllerOptions = {
  document?: Document;
  scanner: SemanticScanner;
  registry: ElementRegistry;
  session: SessionStateStore;
  interactions: InteractionObserver;
  reasoner: Reasoner;
  guide: GuideController;
  voice: VoiceController;
  waitForPageSettled?: () => Promise<void>;
  onPageSnapshot?: (page: ReasoningPage) => void;
  onError?: (error: Error) => void;
};

export type FlowController = {
  getSnapshot(): FlowSnapshot;
  subscribe(listener: (snapshot: FlowSnapshot) => void): () => void;
  start(): void;
  stop(): void;
  reset(): void;
  refresh(): ReasoningPage;
  requestVoice(): Promise<FlowResult>;
  retry(): Promise<FlowResult>;
  cancel(): void;
};

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function defaultWaitForPageSettled(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

function pageFromSnapshot(
  snapshot: SemanticPageSnapshot,
  registry: ElementRegistry,
): ReasoningPage {
  return {
    page: snapshot.page,
    elements: registry.snapshot(),
  };
}

function flowPhaseForGuideResult(
  result: GuideResult,
  hasPendingAction: boolean,
): FlowPhase {
  if (result.status === 'guided') {
    return 'waiting';
  }
  if (result.status === 'completed') {
    if (result.action === 'success') {
      return 'success';
    }
    if (result.action === 'wait') {
      return 'waiting';
    }
    if (result.action === 'explain' && hasPendingAction) {
      return 'waiting';
    }
  }
  return 'idle';
}

export function createFlowController(
  options: FlowControllerOptions,
): FlowController {
  const documentNode = options.document ?? document;
  const waitForPageSettled =
    options.waitForPageSettled ?? defaultWaitForPageSettled;
  const listeners = new Set<(snapshot: FlowSnapshot) => void>();
  let snapshot: FlowSnapshot = {
    phase: 'stopped',
    page: null,
  };
  let started = false;
  let generation = 0;
  let pageSubscription: (() => void) | undefined;
  let interactionSubscription: (() => void) | undefined;
  let continuationTimer: ReturnType<typeof setTimeout> | undefined;

  const publish = (nextSnapshot: FlowSnapshot) => {
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener(snapshot));
  };

  const setPhase = (phase: FlowPhase, error?: Error) => {
    options.session.setCompanionState(phase === 'stopped' ? 'idle' : phase);
    publish({
      ...snapshot,
      phase,
      ...(error ? { error } : { error: undefined }),
    });
  };

  const refresh = (): ReasoningPage => {
    const semanticSnapshot = options.scanner.scan();
    options.registry.reconcile(discoverSemanticElements(documentNode));
    const page = pageFromSnapshot(semanticSnapshot, options.registry);
    options.onPageSnapshot?.(page);
    publish({ ...snapshot, page });
    return page;
  };

  const clearContinuation = () => {
    if (continuationTimer) {
      clearTimeout(continuationTimer);
      continuationTimer = undefined;
    }
  };

  const beginRun = (): number => {
    generation += 1;
    clearContinuation();
    return generation;
  };

  const isCurrent = (runGeneration: number) =>
    started && generation === runGeneration;

  const fail = (
    error: unknown,
    retryTranscript?: SpeechToTextResult,
  ): FlowResult => {
    const normalized = asError(error);
    options.voice.setState('error');
    setPhase('error', normalized);
    publish({ ...snapshot, retryTranscript });
    options.onError?.(normalized);
    return { status: 'error', error: normalized };
  };

  const guideResultToFlowResult = (
    transcript: SpeechToTextResult,
    action: GuideAction,
    guideResult: GuideResult,
  ): FlowResult => {
    if (guideResult.status === 'cancelled') {
      return { status: 'cancelled' };
    }
    if (guideResult.status === 'error') {
      return fail(guideResult.error, transcript);
    }
    if (guideResult.status === 'blocked') {
      return fail(new Error(guideResult.reason), transcript);
    }
    if (guideResult.status === 'stale-target') {
      return fail(
        new Error(`Target ${guideResult.targetId} is no longer live.`),
        transcript,
      );
    }

    setPhase(
      flowPhaseForGuideResult(
        guideResult,
        Boolean(options.session.getState().pendingAction),
      ),
    );
    return {
      status: 'completed',
      transcript,
      action,
      guide: guideResult,
    };
  };

  const reasonAndGuide = async (
    transcript: SpeechToTextResult,
    runGeneration: number,
  ): Promise<FlowResult> => {
    if (!isCurrent(runGeneration)) {
      return { status: 'cancelled' };
    }

    setPhase('thinking');
    try {
      const page = refresh();
      const action = await options.reasoner.reason(
        buildReasonRequest({
          userUtterance: transcript.transcript,
          language: transcript.language,
          session: options.session.getState(),
          page,
        }),
      );
      if (!isCurrent(runGeneration)) {
        return { status: 'cancelled' };
      }

      publish({ ...snapshot, lastAction: action });
      if (action.action === 'guide') {
        setPhase('guiding');
      }
      const guideResult = await options.guide.run(action);
      if (!isCurrent(runGeneration)) {
        return { status: 'cancelled' };
      }

      return guideResultToFlowResult(transcript, action, guideResult);
    } catch (error) {
      if (!isCurrent(runGeneration)) {
        return { status: 'cancelled' };
      }
      return fail(error, transcript);
    }
  };

  const continueAfterPageChange = async () => {
    if (!snapshot.lastTranscript) {
      return;
    }

    const runGeneration = beginRun();
    await waitForPageSettled();
    if (!isCurrent(runGeneration) || !snapshot.lastTranscript) {
      return;
    }

    await reasonAndGuide(snapshot.lastTranscript, runGeneration);
  };

  const scheduleContinuation = () => {
    if (!started || !snapshot.lastTranscript) {
      return;
    }
    clearContinuation();
    continuationTimer = setTimeout(() => {
      continuationTimer = undefined;
      void continueAfterPageChange();
    }, 0);
  };

  const handleInteraction = (event: InteractionEvent) => {
    if (event.type === 'navigation') {
      options.guide.cancel();
      scheduleContinuation();
      return;
    }

    if (event.matchedPending) {
      options.guide.cancel();
      scheduleContinuation();
      return;
    }

    if (options.session.getState().pendingAction) {
      options.guide.cancel({ preservePendingAction: true });
      scheduleContinuation();
    }
  };

  const clearRetryTranscript = () => {
    if (!snapshot.retryTranscript) {
      return;
    }
    publish({ ...snapshot, retryTranscript: undefined });
  };

  const cancel = () => {
    beginRun();
    options.guide.cancel();
    options.voice.cancel();
    clearRetryTranscript();
    setPhase(started ? 'idle' : 'stopped');
  };

  const reset = () => {
    beginRun();
    options.guide.cancel();
    options.voice.cancel();
    options.session.reset();
    options.registry.clear();

    if (!started) {
      publish({ phase: 'stopped', page: null });
      return;
    }

    publish({ phase: 'idle', page: null });
    refresh();
    setPhase('idle');
  };

  const requestVoice = async (): Promise<FlowResult> => {
    if (!started) {
      return fail(new Error('Flow controller is not started.'));
    }

    clearRetryTranscript();
    const runGeneration = beginRun();
    const preservePendingAction = Boolean(
      options.session.getState().pendingAction,
    );
    options.guide.cancel({ preservePendingAction });
    setPhase('listening');

    let voiceResult: VoiceResult;
    try {
      voiceResult = await options.voice.listen();
    } catch (error) {
      if (!isCurrent(runGeneration)) {
        return { status: 'cancelled' };
      }
      return fail(error);
    }

    if (!isCurrent(runGeneration)) {
      return { status: 'cancelled' };
    }
    if (voiceResult.status === 'cancelled') {
      setPhase('idle');
      return { status: 'cancelled' };
    }
    if (voiceResult.status === 'error') {
      return fail(voiceResult.error);
    }

    const transcript: SpeechToTextResult = {
      transcript: voiceResult.transcript,
      ...(voiceResult.language ? { language: voiceResult.language } : {}),
    };
    publish({ ...snapshot, lastTranscript: transcript });
    if (!options.session.getState().goal) {
      options.session.setGoal(transcript.transcript);
    }
    return reasonAndGuide(transcript, runGeneration);
  };

  const retry = async (): Promise<FlowResult> => {
    if (!started || !snapshot.retryTranscript) {
      return requestVoice();
    }

    const transcript = snapshot.retryTranscript;
    clearRetryTranscript();
    const runGeneration = beginRun();
    const preservePendingAction = Boolean(
      options.session.getState().pendingAction,
    );
    options.guide.cancel({ preservePendingAction });
    setPhase('thinking');
    return reasonAndGuide(transcript, runGeneration);
  };

  return {
    getSnapshot() {
      return {
        ...snapshot,
        page: snapshot.page
          ? {
              page: { ...snapshot.page.page },
              elements: snapshot.page.elements.map((element) => ({ ...element })),
            }
          : null,
      };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    start() {
      if (started) {
        return;
      }

      started = true;
      pageSubscription = options.scanner.subscribe(() => {
        refresh();
      });
      interactionSubscription = options.interactions.subscribe(handleInteraction);
      refresh();
      options.scanner.start();
      options.interactions.start();
      setPhase('idle');
    },

    stop() {
      if (!started) {
        return;
      }

      started = false;
      generation += 1;
      clearContinuation();
      pageSubscription?.();
      interactionSubscription?.();
      pageSubscription = undefined;
      interactionSubscription = undefined;
      options.scanner.stop();
      options.interactions.stop();
      options.guide.cancel();
      options.voice.cancel();
      setPhase('stopped');
    },

    reset,

    refresh,

    requestVoice,

    retry,

    cancel,
  };
}
