import type { CompanionState, SessionStateStore } from '../session/session-state';
import type { ElementRegistry, RegistryEntry } from '../registry/element-registry';
import type { GuideAction } from '../reasoning/reasoning';
import { evaluateGuideActionSafety } from '../safety/safety';

export type Viewport = {
  width: number;
  height: number;
};

export type GuideOverlay = {
  activateFocusMask(): void;
  highlight(rect: DOMRect): void;
  clear(): void;
};

export type GuideCompanion = {
  setTarget(rect: DOMRect): void;
  setState(state: CompanionState): void;
};

export type GuideSpeech = {
  say(text: string, language: string): Promise<void>;
  cancel(): void;
};

export type GuideControllerOptions = {
  document?: Document;
  registry: ElementRegistry;
  session: SessionStateStore;
  overlay: GuideOverlay;
  companion: GuideCompanion;
  speech: GuideSpeech;
  viewport?: () => Viewport;
  prefersReducedMotion?: () => boolean;
  waitForLayout?: () => Promise<void>;
  onMissingTarget?: (targetId: string) => void;
};

export type GuideResult =
  | { status: 'guided'; targetId: string }
  | { status: 'completed'; action: GuideAction['action'] }
  | { status: 'stale-target'; targetId: string }
  | { status: 'blocked'; reason: string }
  | { status: 'cancelled' }
  | { status: 'error'; error: Error };

export type GuideController = {
  run(action: GuideAction): Promise<GuideResult>;
  cancel(): void;
};

type PreparedTarget =
  | { status: 'ready'; entry: RegistryEntry; rect: DOMRect }
  | { status: 'stale-target' }
  | { status: 'cancelled' };

function asError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value));
}

function isInViewport(rect: DOMRect, viewport: Viewport): boolean {
  return (
    rect.bottom > 0 &&
    rect.right > 0 &&
    rect.top < viewport.height &&
    rect.left < viewport.width
  );
}

function defaultViewport(documentNode: Document): Viewport {
  const windowNode = documentNode.defaultView;
  return {
    width: windowNode?.innerWidth ?? documentNode.documentElement.clientWidth,
    height:
      windowNode?.innerHeight ?? documentNode.documentElement.clientHeight,
  };
}

function defaultPrefersReducedMotion(documentNode: Document): boolean {
  return Boolean(
    documentNode.defaultView?.matchMedia?.(
      '(prefers-reduced-motion: reduce)',
    ).matches,
  );
}

function defaultWaitForLayout(documentNode: Document): Promise<void> {
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

function needsScroll(rect: DOMRect, viewport: Viewport): boolean {
  return !isInViewport(rect, viewport);
}

export function createGuideController(
  options: GuideControllerOptions,
): GuideController {
  const documentNode = options.document ?? document;
  const windowNode = documentNode.defaultView;
  const getViewport = options.viewport ?? (() => defaultViewport(documentNode));
  const prefersReducedMotion =
    options.prefersReducedMotion ?? (() => defaultPrefersReducedMotion(documentNode));
  const waitForLayout =
    options.waitForLayout ?? (() => defaultWaitForLayout(documentNode));

  let generation = 0;
  let activeCleanup: (() => void) | undefined;

  const setCompanionState = (state: CompanionState) => {
    options.companion.setState(state);
    options.session.setCompanionState(state);
  };

  const clearTracking = () => {
    activeCleanup?.();
    activeCleanup = undefined;
  };

  const cancelInternal = (preservePendingAction: boolean) => {
    generation += 1;
    clearTracking();
    options.speech.cancel();
    options.overlay.clear();
    if (!preservePendingAction) {
      options.session.clearPendingAction();
    }
    setCompanionState('idle');
  };

  const isCurrent = (runGeneration: number) => generation === runGeneration;

  const staleTarget = (targetId: string): GuideResult => {
    clearTracking();
    options.overlay.clear();
    options.session.clearPendingAction();
    setCompanionState('error');
    options.onMissingTarget?.(targetId);
    return { status: 'stale-target', targetId };
  };

  const startLayoutTracking = (
    entry: RegistryEntry,
    runGeneration: number,
  ): (() => void) => {
    const refresh = () => {
      if (!isCurrent(runGeneration)) {
        return;
      }
      if (!entry.element.isConnected) {
        cancelInternal(false);
        return;
      }

      const rect = entry.element.getBoundingClientRect();
      options.overlay.highlight(rect);
      options.companion.setTarget(rect);
    };

    const handleResize = () => refresh();
    windowNode?.addEventListener('resize', handleResize);

    const observer =
      typeof MutationObserver === 'undefined'
        ? undefined
        : new MutationObserver(refresh);
    observer?.observe(documentNode, {
      subtree: true,
      childList: true,
      attributes: true,
    });

    return () => {
      windowNode?.removeEventListener('resize', handleResize);
      observer?.disconnect();
    };
  };

  const prepareTarget = async (
    targetId: string,
    runGeneration: number,
    present: boolean,
  ): Promise<PreparedTarget> => {
    let entry = options.registry.getLive(targetId);
    if (!entry) {
      return { status: 'stale-target' };
    }

    if (needsScroll(entry.element.getBoundingClientRect(), getViewport())) {
      entry.element.scrollIntoView?.({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center',
        inline: 'nearest',
      });
      await waitForLayout();
      if (!isCurrent(runGeneration)) {
        return { status: 'cancelled' };
      }

      entry = options.registry.getLive(targetId);
      if (!entry) {
        return { status: 'stale-target' };
      }
    }

    if (!isCurrent(runGeneration)) {
      return { status: 'cancelled' };
    }

    const rect = entry.element.getBoundingClientRect();
    if (present) {
      options.overlay.activateFocusMask();
      options.overlay.highlight(rect);
      options.companion.setTarget(rect);
      setCompanionState('guiding');
      activeCleanup = startLayoutTracking(entry, runGeneration);
    }

    return { status: 'ready', entry, rect };
  };

  const finishExplanation = () => {
    clearTracking();
    options.overlay.clear();
    const nextState = options.session.getState().pendingAction
      ? 'waiting'
      : 'idle';
    setCompanionState(nextState);
  };

  const finishError = (error: unknown): GuideResult => {
    clearTracking();
    options.overlay.clear();
    setCompanionState('error');
    return { status: 'error', error: asError(error) };
  };

  const finishBlocked = (reason: string): GuideResult => {
    clearTracking();
    options.overlay.clear();
    setCompanionState('error');
    return { status: 'blocked', reason };
  };

  const runSpeech = async (
    text: string,
    language: string,
    runGeneration: number,
  ): Promise<GuideResult | undefined> => {
    setCompanionState('speaking');
    try {
      await options.speech.say(text, language);
    } catch (error) {
      if (!isCurrent(runGeneration)) {
        return { status: 'cancelled' };
      }
      return finishError(error);
    }

    return isCurrent(runGeneration) ? undefined : { status: 'cancelled' };
  };

  return {
    async run(action) {
      cancelInternal(action.action === 'explain');
      const runGeneration = generation;

      if (action.action === 'guide') {
        const liveTarget = options.registry.getLive(action.targetId);
        if (liveTarget) {
          const safety = evaluateGuideActionSafety(action, [liveTarget]);
          if (!safety.allowed) {
            return finishBlocked(safety.reason);
          }
        }
      }

      if (action.action === 'wait') {
        setCompanionState('waiting');
        return { status: 'completed', action: action.action };
      }

      if (action.action === 'clarify' || action.action === 'success') {
        const speechResult = await runSpeech(
          action.spokenInstruction,
          action.language,
          runGeneration,
        );
        if (speechResult) {
          return speechResult;
        }
        setCompanionState(action.action === 'success' ? 'success' : 'idle');
        return { status: 'completed', action: action.action };
      }

      const prepared = await prepareTarget(
        action.targetId,
        runGeneration,
        action.action !== 'scroll',
      );
      if (prepared.status === 'cancelled') {
        return { status: 'cancelled' };
      }
      if (prepared.status === 'stale-target') {
        return staleTarget(action.targetId);
      }

      if (action.action === 'scroll') {
        return { status: 'completed', action: action.action };
      }

      const speechResult = await runSpeech(
        action.spokenInstruction,
        action.language,
        runGeneration,
      );
      if (speechResult) {
        return speechResult;
      }

      if (action.action === 'explain') {
        finishExplanation();
        return { status: 'completed', action: action.action };
      }

      options.session.setPendingAction({
        targetId: prepared.entry.id,
        expectedUserAction: action.expectedUserAction,
      });
      setCompanionState('waiting');
      return { status: 'guided', targetId: prepared.entry.id };
    },

    cancel() {
      cancelInternal(false);
    },
  };
}
