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
  type ReasonRequest,
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
import {
  latencyDurationMs,
  type LatencyMetric,
  type LatencyStage,
} from '../runtime/latency';

const REASONING_DEDUPE_WINDOW_MS = 2_000;
const FINAL_SUBMISSION_LABEL_PATTERN = /\b(?:submit|finali[sz]e|send|file)\b/i;

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
  onLatency?: (metric: LatencyMetric) => void;
  now?: () => number;
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

export function isInputCompletionUtterance(value: string): boolean {
  const normalized = value.replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
  if (!normalized) {
    return false;
  }

  if (
    /\b(?:not|never|don't|do not)\b.{0,16}\b(?:done|finished|complete|ready)\b/i.test(
      normalized,
    )
  ) {
    return false;
  }

  return (
    /\b(?:i[' ]?m|i am|we[' ]?re|we are)?\s*(?:done|finished|complete|completed|ready)\b/i.test(
      normalized,
    ) ||
    /\b(?:i[' ]?ve|i have)\s+(?:filled|entered|typed|provided)\b/i.test(
      normalized,
    ) ||
    /\b(?:bhar|fill|enter|type)(?:\s+kar)?\s+(?:diya|di|kar diya|ho gaya)\b/i.test(
      normalized,
    )
  );
}

function isInputQuestionUtterance(value: string): boolean {
  return (
    /\?/.test(value) ||
    /\b(?:what|why|how|can|could|please explain|kya|kyun|kaise|kaun)\b/i.test(
      value,
    )
  );
}

function isMatchedFinalSubmitClick(event: InteractionEvent): boolean {
  return (
    event.type === 'click' &&
    event.matchedPending &&
    FINAL_SUBMISSION_LABEL_PATTERN.test(event.label)
  );
}

function defaultWaitForPageSettled(documentNode: Document): Promise<void> {
  const windowNode = documentNode.defaultView;
  return new Promise((resolve) => {
    if (windowNode?.requestAnimationFrame) {
      windowNode.requestAnimationFrame(() => {
        windowNode.requestAnimationFrame(() => resolve());
      });
      return;
    }

    setTimeout(resolve, 0);
  });
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
    options.waitForPageSettled ?? (() => defaultWaitForPageSettled(documentNode));
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
  let continuationInFlight = false;
  let continuationRequested = false;
  let pageRevision = 0;
  let pageFingerprint: string | undefined;
  let inFlightReasoning:
    | { key: string; promise: Promise<GuideAction> }
    | undefined;
  let lastReasoning:
    | { key: string; result: FlowResult; expiresAt: number }
    | undefined;
  const now = options.now ?? (() => performance.now());

  const measure = async <Result>(
    stage: LatencyStage,
    operation: () => Promise<Result>,
  ): Promise<Result> => {
    const startedAt = now();
    try {
      return await operation();
    } finally {
      options.onLatency?.({
        stage,
        durationMs: latencyDurationMs(startedAt, now()),
      });
    }
  };

  const measureSync = <Result>(
    stage: LatencyStage,
    operation: () => Result,
  ): Result => {
    const startedAt = now();
    try {
      return operation();
    } finally {
      options.onLatency?.({
        stage,
        durationMs: latencyDurationMs(startedAt, now()),
      });
    }
  };

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
    const page = measureSync('semantic-scan', () => {
      const semanticSnapshot = options.scanner.scan();
      options.registry.reconcile(discoverSemanticElements(documentNode));
      return pageFromSnapshot(semanticSnapshot, options.registry);
    });
    const nextPageFingerprint = JSON.stringify(page);
    if (nextPageFingerprint !== pageFingerprint) {
      pageRevision += 1;
      pageFingerprint = nextPageFingerprint;
    }
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
    continuationRequested = false;
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

  const waitForInputCompletion = (
    transcript: SpeechToTextResult,
  ): FlowResult => {
    const action: GuideAction = { action: 'wait' };
    setPhase('waiting');
    return {
      status: 'completed',
      transcript,
      action,
      guide: { status: 'completed', action: 'wait' },
    };
  };

  const reasoningKeyFor = (
    request: ReasonRequest,
    recentActionTimestamps: number[],
  ): string =>
    JSON.stringify({
      pageRevision,
      request,
      recentActionTimestamps,
    });

  const reasonOnce = (
    request: ReasonRequest,
    key: string,
  ): Promise<GuideAction> => {
    if (inFlightReasoning?.key === key) {
      return inFlightReasoning.promise;
    }

    const promise = options.reasoner.reason(request);
    inFlightReasoning = { key, promise };
    promise.then(
      () => {
        if (inFlightReasoning?.promise === promise) {
          inFlightReasoning = undefined;
        }
      },
      () => {
        if (inFlightReasoning?.promise === promise) {
          inFlightReasoning = undefined;
        }
      },
    );
    return promise;
  };

  const reasonAndGuide = async (
    transcript: SpeechToTextResult,
    runGeneration: number,
  ): Promise<FlowResult> => {
    if (!isCurrent(runGeneration)) {
      return { status: 'cancelled' };
    }

    const pendingAction = options.session.getState().pendingAction;
    if (
      pendingAction?.expectedUserAction === 'input' &&
      !isInputCompletionUtterance(transcript.transcript) &&
      !isInputQuestionUtterance(transcript.transcript)
    ) {
      return waitForInputCompletion(transcript);
    }

    setPhase('thinking');
    try {
      const page = refresh();
      const session = options.session.getState();
      const request = buildReasonRequest({
        userUtterance: transcript.transcript,
        language: transcript.language,
        session,
        page,
      });
      const reasoningKey = reasoningKeyFor(
        request,
        session.recentActions.map((action) => action.timestamp),
      );
      if (
        lastReasoning?.key === reasoningKey &&
        lastReasoning.expiresAt > now()
      ) {
        return lastReasoning.result;
      }
      const action = await measure('reasoning', () =>
        reasonOnce(request, reasoningKey),
      );
      if (!isCurrent(runGeneration)) {
        return { status: 'cancelled' };
      }

      if (action.workflow) {
        options.session.setWorkflow(action.workflow);
      }
      publish({ ...snapshot, lastAction: action });
      if (action.action === 'guide') {
        setPhase('guiding');
      }
      const guideResult = await options.guide.run(action);
      if (!isCurrent(runGeneration)) {
        return { status: 'cancelled' };
      }

      const flowResult = guideResultToFlowResult(
        transcript,
        action,
        guideResult,
      );
      if (flowResult.status === 'completed') {
        lastReasoning = {
          key: reasoningKey,
          result: flowResult,
          expiresAt: now() + REASONING_DEDUPE_WINDOW_MS,
        };
      }
      return flowResult;
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

    if (continuationInFlight) {
      continuationRequested = true;
      return;
    }

    continuationRequested = false;
    continuationInFlight = true;
    const runGeneration = beginRun();
    try {
      await measure('page-settle', waitForPageSettled);
      if (!isCurrent(runGeneration) || !snapshot.lastTranscript) {
        return;
      }

      await reasonAndGuide(snapshot.lastTranscript, runGeneration);
    } finally {
      continuationInFlight = false;
      if (
        continuationRequested &&
        started &&
        snapshot.phase !== 'success' &&
        snapshot.lastTranscript
      ) {
        clearContinuation();
        continuationTimer = setTimeout(() => {
          continuationTimer = undefined;
          void continueAfterPageChange();
        }, 0);
      }
    }
  };

  const scheduleContinuation = () => {
    if (!started || snapshot.phase === 'success' || !snapshot.lastTranscript) {
      return;
    }
    continuationRequested = true;
    clearContinuation();
    continuationTimer = setTimeout(() => {
      continuationTimer = undefined;
      void continueAfterPageChange();
    }, 0);
  };

  const handleInteraction = (event: InteractionEvent) => {
    if (snapshot.phase === 'success') {
      return;
    }

    if (event.type === 'navigation') {
      options.guide.cancel();
      scheduleContinuation();
      return;
    }

    if (
      event.type === 'input-complete' &&
      options.session.getState().pendingAction?.expectedUserAction === 'input'
    ) {
      return;
    }

    if (event.matchedPending) {
      options.guide.cancel();
      if (isMatchedFinalSubmitClick(event)) {
        setPhase('success');
        return;
      }
      scheduleContinuation();
      return;
    }

    // Unmatched page activity is not a stop signal. In particular, clicking
    // and typing in a guided input must leave the highlight and pending step
    // intact until the user explicitly returns to the companion control.
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
