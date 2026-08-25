import type { CompanionState } from '../session/session-state';
import {
  createSemanticScanner,
  type SemanticScanner,
} from '../dom/semantic';
import {
  createElementRegistry,
  type ElementRegistry,
} from '../registry/element-registry';
import {
  createInteractionObserver,
  type InteractionObserver,
} from '../interaction/interaction-observer';
import {
  createReasoningClient,
  type Reasoner,
  type ReasoningPage,
} from '../reasoning/reasoning';
import {
  createSessionState,
  type SessionStateStore,
} from '../session/session-state';
import {
  createGuideController,
  type GuideController,
  type Viewport,
} from '../guide/guide-controller';
import {
  createBrowserAudioPlayback,
  createBrowserMicrophoneRecorder,
  createDevelopmentSpeechToText,
  createSpeechApiClient,
  createVoiceController,
  type AudioPlayback,
  type AudioRecorder,
  type SpeechToText,
  type SpeechToTextResult,
  type TextToSpeech,
  type VoiceController,
  type VoiceState,
} from '../voice/voice';
import {
  createFlowController,
  type FlowController,
  type FlowPhase,
} from '../flow/flow-controller';
import type { CompanionUiStore } from '../companion/companion-ui';

export type ExtensionRuntimeOptions = {
  document?: Document;
  companion: CompanionUiStore;
  reasoningEndpoint?: string;
  speechBaseUrl?: string;
  fetcher?: typeof fetch;
  reasoner?: Reasoner;
  recorder?: AudioRecorder;
  speechToText?: SpeechToText;
  textToSpeech?: TextToSpeech;
  playback?: AudioPlayback;
  viewport?: () => Viewport;
  prefersReducedMotion?: () => boolean;
  waitForLayout?: () => Promise<void>;
  waitForMovement?: () => Promise<void>;
  waitForPageSettled?: () => Promise<void>;
  loadingLatencyNoticeMs?: number;
  development?: ExtensionDevelopmentOptions;
  debug?: ExtensionDebugOptions;
};

export const DEFAULT_LOADING_LATENCY_NOTICE_MS = 1200;

export type ExtensionDevelopmentOptions = {
  enabled: boolean;
  transcripts?: readonly SpeechToTextResult[];
  reasoner?: Reasoner;
};

export type ExtensionDebugRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
  width: number;
  height: number;
};

export type ExtensionDebugEvent =
  | { type: 'semantic-snapshot'; page: ReasoningPage }
  | { type: 'target-box'; targetId: string; rect: ExtensionDebugRect };

export type ExtensionDebugOptions = {
  enabled: boolean;
  logSnapshots?: boolean;
  debugTargetBoxes?: boolean;
  logger?: (event: ExtensionDebugEvent) => void;
};

export type ExtensionRuntime = {
  session: SessionStateStore;
  registry: ElementRegistry;
  scanner: SemanticScanner;
  interactions: InteractionObserver;
  voice: VoiceController;
  guide: GuideController;
  flow: FlowController;
  start(): void;
  stop(): void;
  reset(): void;
};

function toCompanionState(state: VoiceState): CompanionState {
  return state === 'transcribing' ? 'thinking' : state;
}

function toCompanionPhase(phase: FlowPhase): CompanionState | undefined {
  return phase === 'stopped' ? undefined : phase;
}

function isLatencyState(state: CompanionState): boolean {
  return state === 'thinking' || state === 'speaking';
}

function cloneReasoningPage(page: ReasoningPage): ReasoningPage {
  return {
    page: { ...page.page },
    elements: page.elements.map((element) => ({ ...element })),
  };
}

function toDebugRect(rect: DOMRect): ExtensionDebugRect {
  return {
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    left: rect.left,
    width: rect.width,
    height: rect.height,
  };
}

function defaultDebugLogger(event: ExtensionDebugEvent): void {
  console.debug('[Voice Companion]', event);
}

export function createExtensionRuntime(
  options: ExtensionRuntimeOptions,
): ExtensionRuntime {
  const documentNode = options.document ?? document;
  const development = options.development?.enabled
    ? options.development
    : undefined;
  const debug = options.debug?.enabled ? options.debug : undefined;
  const debugLogger = debug?.logger ?? defaultDebugLogger;
  const logSnapshots = debug?.logSnapshots !== false;
  const debugTargetBoxes = debug?.debugTargetBoxes !== false;
  const emitDebugSnapshot = (page: ReasoningPage) => {
    if (debug && logSnapshots) {
      debugLogger({
        type: 'semantic-snapshot',
        page: cloneReasoningPage(page),
      });
    }
  };
  const emitDebugTargetBox = (targetId: string, rect: DOMRect) => {
    if (debug && debugTargetBoxes) {
      debugLogger({
        type: 'target-box',
        targetId,
        rect: toDebugRect(rect),
      });
    }
  };
  const session = createSessionState();
  const registry = createElementRegistry();
  const scanner = createSemanticScanner({ root: documentNode });
  const interactions = createInteractionObserver({
    document: documentNode,
    registry,
    session,
  });
  const speechClient = createSpeechApiClient({
    baseUrl: options.speechBaseUrl,
    fetcher: options.fetcher,
  });
  const voice = createVoiceController({
    recorder: options.recorder ?? createBrowserMicrophoneRecorder(),
    speechToText:
      options.speechToText ??
      (development
        ? createDevelopmentSpeechToText(development.transcripts)
        : speechClient),
    textToSpeech: options.textToSpeech ?? speechClient,
    playback: options.playback ?? createBrowserAudioPlayback(),
    session,
  });
  const guide = createGuideController({
    document: documentNode,
    registry,
    session,
    overlay: options.companion,
    companion: options.companion,
    speech: voice,
    viewport: options.viewport,
    prefersReducedMotion: options.prefersReducedMotion,
    waitForLayout: options.waitForLayout,
    waitForMovement: options.waitForMovement,
    onTargetRect: emitDebugTargetBox,
  });
  const reasoner =
    options.reasoner ??
    development?.reasoner ??
    createReasoningClient({
      endpoint: options.reasoningEndpoint ?? '/reason',
      fetcher: options.fetcher,
    });
  const flow = createFlowController({
    document: documentNode,
    scanner,
    registry,
    session,
    interactions,
    reasoner,
    guide,
    voice,
    waitForPageSettled: options.waitForPageSettled,
    onPageSnapshot: emitDebugSnapshot,
  });
  const loadingLatencyNoticeMs = Math.max(
    0,
    options.loadingLatencyNoticeMs ?? DEFAULT_LOADING_LATENCY_NOTICE_MS,
  );

  let unsubscribeVoice: (() => void) | undefined;
  let unsubscribeFlow: (() => void) | undefined;
  let latencyTimer: ReturnType<typeof setTimeout> | undefined;
  let latencyState: CompanionState | undefined;

  const clearLatencyNotice = () => {
    if (latencyTimer !== undefined) {
      clearTimeout(latencyTimer);
      latencyTimer = undefined;
    }
    latencyState = undefined;
    options.companion.setLatencyNotice(false);
  };

  const publishCompanionState = (state: CompanionState) => {
    options.companion.setState(state);
    if (!isLatencyState(state)) {
      clearLatencyNotice();
      return;
    }

    if (latencyState === state) {
      return;
    }

    if (latencyTimer !== undefined) {
      clearTimeout(latencyTimer);
    }
    latencyState = state;
    options.companion.setLatencyNotice(false);
    latencyTimer = setTimeout(() => {
      latencyTimer = undefined;
      if (latencyState === state) {
        options.companion.setLatencyNotice(true);
      }
    }, loadingLatencyNoticeMs);
  };

  const handleListening = () => {
    if (voice.getState() === 'listening') {
      voice.stopListening();
      return;
    }
    if (flow.getSnapshot().phase === 'error') {
      void flow.retry();
      return;
    }
    void flow.requestVoice();
  };
  const handleReset = () => {
    clearLatencyNotice();
    flow.reset();
  };
  options.companion.setListeningHandler(handleListening);
  options.companion.setResetHandler(handleReset);

  let started = false;
  return {
    session,
    registry,
    scanner,
    interactions,
    voice,
    guide,
    flow,

    start() {
      if (started) {
        return;
      }
      started = true;
      unsubscribeVoice = voice.subscribe((state) => {
        publishCompanionState(toCompanionState(state));
      });
      unsubscribeFlow = flow.subscribe((snapshot) => {
        const companionState = toCompanionPhase(snapshot.phase);
        if (companionState) {
          publishCompanionState(companionState);
        }
      });
      options.companion.setListeningHandler(handleListening);
      options.companion.setResetHandler(handleReset);
      flow.start();
    },

    stop() {
      if (!started) {
        return;
      }
      started = false;
      clearLatencyNotice();
      flow.stop();
      options.companion.setListeningHandler(undefined);
      options.companion.setResetHandler(undefined);
      unsubscribeVoice?.();
      unsubscribeFlow?.();
      unsubscribeVoice = undefined;
      unsubscribeFlow = undefined;
    },

    reset() {
      clearLatencyNotice();
      flow.reset();
    },
  };
}
