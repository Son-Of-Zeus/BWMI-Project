import type { GuideCompanion, GuideOverlay } from '../guide/guide-controller';
import type { CompanionState } from '../session/session-state';
import type { LatencyMetric } from '../runtime/latency';

export type CompanionUiSnapshot = {
  state: CompanionState;
  latencyNotice: boolean;
  latencyMetrics: readonly LatencyMetric[];
  targetRect: DOMRect | null;
  focusMaskActive: boolean;
  highlightRect: DOMRect | null;
};

export type CompanionViewport = {
  width: number;
  height: number;
};

export type CompanionDimensions = {
  width: number;
  height: number;
  edgePadding: number;
  targetGap: number;
};

export type CompanionDockDimensions = {
  panelWidth: number;
  panelRight: number;
  panelBottom: number;
  pointerGap: number;
};

export type CompanionPosition = {
  left: number;
  top: number;
};

export type CompanionUiStore = GuideOverlay &
  GuideCompanion & {
    getSnapshot(): CompanionUiSnapshot;
    subscribe(listener: () => void): () => void;
    setListeningHandler(handler?: () => void): void;
    setResetHandler(handler?: () => void): void;
    setLatencyNotice(active: boolean): void;
    clearLatencyMetrics(): void;
    recordLatency(metric: LatencyMetric): void;
    toggleListening(): void;
    resetDemo(): void;
    destroy(): void;
  };

export const DEFAULT_COMPANION_DIMENSIONS: CompanionDimensions = {
  width: 44,
  height: 44,
  edgePadding: 14,
  targetGap: 12,
};

export const DEFAULT_COMPANION_DOCK_DIMENSIONS: CompanionDockDimensions = {
  panelWidth: 204,
  panelRight: 24,
  panelBottom: 24,
  pointerGap: 8,
};

export const COMPANION_STATE_LABELS: Record<CompanionState, string> = {
  idle: 'Voice guidance',
  listening: 'Listening…',
  thinking: 'Thinking…',
  guiding: 'Look here',
  speaking: 'Speaking…',
  waiting: 'Your turn',
  success: 'Done',
  error: 'Try again',
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

export function getCompanionPosition(
  rect: DOMRect,
  viewport: CompanionViewport,
  dimensions: CompanionDimensions = DEFAULT_COMPANION_DIMENSIONS,
): CompanionPosition {
  const rightLimit = viewport.width - dimensions.width - dimensions.edgePadding;
  const preferredRight = rect.right + dimensions.targetGap;
  const preferredLeft = rect.left - dimensions.width - dimensions.targetGap;
  const left =
    preferredRight >= dimensions.edgePadding && preferredRight <= rightLimit
      ? preferredRight
      : clamp(
          preferredLeft,
          dimensions.edgePadding,
          rightLimit,
        );
  const top = clamp(
    rect.top + rect.height / 2 - dimensions.height / 2,
    dimensions.edgePadding,
    viewport.height - dimensions.height - dimensions.edgePadding,
  );

  return {
    left: Math.round(left),
    top: Math.round(top),
  };
}

export function getDockedCompanionPosition(
  viewport: CompanionViewport,
  dimensions: CompanionDimensions = DEFAULT_COMPANION_DIMENSIONS,
  dock: CompanionDockDimensions = DEFAULT_COMPANION_DOCK_DIMENSIONS,
): CompanionPosition {
  return {
    left: Math.round(
      clamp(
        viewport.width -
          dock.panelRight -
          dock.panelWidth -
          dock.pointerGap -
          dimensions.width,
        dimensions.edgePadding,
        viewport.width - dimensions.width - dimensions.edgePadding,
      ),
    ),
    top: Math.round(
      clamp(
        viewport.height -
          dock.panelBottom -
          dimensions.height,
        dimensions.edgePadding,
        viewport.height - dimensions.height - dimensions.edgePadding,
      ),
    ),
  };
}

function setRectStyles(node: HTMLElement, rect: DOMRect): void {
  node.style.left = `${Math.round(rect.left)}px`;
  node.style.top = `${Math.round(rect.top)}px`;
  node.style.width = `${Math.max(0, Math.round(rect.width))}px`;
  node.style.height = `${Math.max(0, Math.round(rect.height))}px`;
}

export function createCompanionUiStore(host: HTMLElement): CompanionUiStore {
  const documentNode = host.ownerDocument;
  const focusMask = documentNode.createElement('div');
  focusMask.className = 'companion-focus-mask';
  focusMask.dataset.companionLayer = 'focus-mask';
  focusMask.setAttribute('aria-hidden', 'true');

  const highlight = documentNode.createElement('div');
  highlight.className = 'companion-highlight';
  highlight.dataset.companionLayer = 'highlight';
  highlight.setAttribute('aria-hidden', 'true');

  host.append(focusMask, highlight);

  let snapshot: CompanionUiSnapshot = {
    state: 'idle',
    latencyNotice: false,
    latencyMetrics: [],
    targetRect: null,
    focusMaskActive: false,
    highlightRect: null,
  };
  const listeners = new Set<() => void>();
  let listeningHandler: (() => void) | undefined;
  let resetHandler: (() => void) | undefined;

  const publish = (nextSnapshot: CompanionUiSnapshot) => {
    snapshot = nextSnapshot;
    listeners.forEach((listener) => listener());
  };

  const setState = (state: CompanionState) => {
    const latencyNotice =
      state === snapshot.state ? snapshot.latencyNotice : false;
    if (
      state === snapshot.state &&
      latencyNotice === snapshot.latencyNotice
    ) {
      return;
    }
    publish({ ...snapshot, state, latencyNotice });
  };

  const store: CompanionUiStore = {
    getSnapshot() {
      return snapshot;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setState,

    setListeningHandler(handler) {
      listeningHandler = handler;
    },

    setResetHandler(handler) {
      resetHandler = handler;
    },

    setLatencyNotice(active) {
      if (active === snapshot.latencyNotice) {
        return;
      }
      publish({ ...snapshot, latencyNotice: active });
    },

    clearLatencyMetrics() {
      if (snapshot.latencyMetrics.length === 0) {
        return;
      }
      publish({ ...snapshot, latencyMetrics: [] });
    },

    recordLatency(metric) {
      publish({
        ...snapshot,
        latencyMetrics: [...snapshot.latencyMetrics.slice(-11), metric],
      });
    },

    toggleListening() {
      if (listeningHandler) {
        listeningHandler();
        return;
      }
      setState(snapshot.state === 'listening' ? 'idle' : 'listening');
    },

    resetDemo() {
      if (resetHandler) {
        resetHandler();
        return;
      }

      store.clear();
      store.setLatencyNotice(false);
      store.clearLatencyMetrics();
      setState('idle');
    },

    setTarget(rect) {
      publish({ ...snapshot, targetRect: rect });
    },

    activateFocusMask(rect) {
      if (rect) {
        setRectStyles(focusMask, rect);
      }
      focusMask.hidden = false;
      publish({ ...snapshot, focusMaskActive: true });
    },

    highlight(rect) {
      setRectStyles(highlight, rect);
      highlight.hidden = false;
      publish({
        ...snapshot,
        targetRect: rect,
        highlightRect: rect,
      });
    },

    clear() {
      focusMask.hidden = true;
      highlight.hidden = true;
      publish({
        ...snapshot,
        targetRect: null,
        focusMaskActive: false,
        highlightRect: null,
      });
    },

    destroy() {
      listeningHandler = undefined;
      resetHandler = undefined;
      focusMask.remove();
      highlight.remove();
      listeners.clear();
    },
  };

  focusMask.hidden = true;
  highlight.hidden = true;
  return store;
}
