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
  createSpeechApiClient,
  createVoiceController,
  type AudioPlayback,
  type AudioRecorder,
  type SpeechToText,
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
  waitForPageSettled?: () => Promise<void>;
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

export function createExtensionRuntime(
  options: ExtensionRuntimeOptions,
): ExtensionRuntime {
  const documentNode = options.document ?? document;
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
    speechToText: options.speechToText ?? speechClient,
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
  });
  const reasoner =
    options.reasoner ??
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
  });

  let unsubscribeVoice: (() => void) | undefined;
  let unsubscribeFlow: (() => void) | undefined;

  const handleListening = () => {
    if (voice.getState() === 'listening') {
      voice.stopListening();
      return;
    }
    void flow.requestVoice();
  };
  const handleReset = () => {
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
        options.companion.setState(toCompanionState(state));
      });
      unsubscribeFlow = flow.subscribe((snapshot) => {
        const companionState = toCompanionPhase(snapshot.phase);
        if (companionState) {
          options.companion.setState(companionState);
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
      flow.stop();
      options.companion.setListeningHandler(undefined);
      options.companion.setResetHandler(undefined);
      unsubscribeVoice?.();
      unsubscribeFlow?.();
      unsubscribeVoice = undefined;
      unsubscribeFlow = undefined;
    },

    reset() {
      flow.reset();
    },
  };
}
