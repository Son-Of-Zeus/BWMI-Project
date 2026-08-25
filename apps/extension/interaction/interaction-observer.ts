import type { RegistryEntry, ElementRegistry } from '../registry/element-registry';
import {
  readSafeControlState,
  type ValidationState,
} from '../dom/semantic';
import type {
  ExpectedUserAction,
  RecentActionType,
  SessionStateStore,
} from '../session/session-state';

export type InteractionEventBase = {
  targetId: string;
  label: string;
  matchedPending: boolean;
  timestamp: number;
};

export type ClickInteractionEvent = InteractionEventBase & {
  type: 'click';
  action: 'click';
};

export type InputInteractionEvent = InteractionEventBase & {
  type: 'input-complete';
  action: 'input';
  hasValue: boolean;
  validationState: ValidationState;
};

export type SelectInteractionEvent = InteractionEventBase & {
  type: 'select';
  action: 'select';
  hasValue: boolean;
  validationState: ValidationState;
};

export type NavigationReason =
  | 'push-state'
  | 'replace-state'
  | 'popstate'
  | 'hashchange';

export type NavigationEvent = {
  type: 'navigation';
  url: string;
  previousUrl: string;
  reason: NavigationReason;
  timestamp: number;
};

export type InteractionEvent =
  | ClickInteractionEvent
  | InputInteractionEvent
  | SelectInteractionEvent
  | NavigationEvent;

export type InteractionObserverOptions = {
  document?: Document;
  registry: ElementRegistry;
  session: SessionStateStore;
  onEvent?: (event: InteractionEvent) => void;
  now?: () => number;
};

export type InteractionObserver = {
  start(): void;
  stop(): void;
  subscribe(listener: (event: InteractionEvent) => void): () => void;
};

type ObservedAction = Exclude<RecentActionType, 'explanation'>;

function isElementNode(node: EventTarget | null): node is HTMLElement {
  return Boolean(
    node &&
      typeof node === 'object' &&
      'nodeType' in node &&
      (node as Node).nodeType === Node.ELEMENT_NODE,
  );
}

function isInputLike(element: HTMLElement): boolean {
  const tagName = element.tagName.toLowerCase();
  return (
    tagName === 'input' ||
    tagName === 'textarea' ||
    tagName === 'select' ||
    element.getAttribute('contenteditable') === 'true'
  );
}

function isSelectLike(element: HTMLElement): boolean {
  return element.tagName.toLowerCase() === 'select';
}

export function findRegisteredEntry(
  event: Event,
  registry: ElementRegistry,
): RegistryEntry | undefined {
  const entriesByElement = new Map(
    registry.list().map((entry) => [entry.element, entry]),
  );
  const path = event.composedPath();

  for (const node of path) {
    if (!isElementNode(node)) {
      continue;
    }

    const entry = entriesByElement.get(node);
    if (entry?.element.isConnected) {
      return entry;
    }
  }

  let current = isElementNode(event.target) ? event.target : null;
  while (current) {
    const entry = entriesByElement.get(current);
    if (entry?.element.isConnected) {
      return entry;
    }
    current = current.parentElement;
  }

  return undefined;
}

function getCurrentUrl(documentNode: Document): string {
  return documentNode.defaultView?.location.href ?? documentNode.location.href;
}

function actionMatchesPending(
  targetId: string,
  action: ObservedAction,
  expectedUserAction: ExpectedUserAction | undefined,
): boolean {
  return Boolean(
    expectedUserAction &&
      expectedUserAction === action &&
      targetId,
  );
}

export function createInteractionObserver(
  options: InteractionObserverOptions,
): InteractionObserver {
  const documentNode = options.document ?? document;
  const windowNode = documentNode.defaultView;
  const listeners = new Set<(event: InteractionEvent) => void>();
  const now = options.now ?? Date.now;
  let started = false;
  let currentUrl = getCurrentUrl(documentNode);
  let historyNode: History | undefined;
  let originalPushState: History['pushState'] | undefined;
  let originalReplaceState: History['replaceState'] | undefined;

  const emit = (event: InteractionEvent) => {
    options.onEvent?.(event);
    listeners.forEach((listener) => listener(event));
  };

  const recordTargetedAction = (
    event: Event,
    action: ObservedAction,
  ) => {
    const entry = findRegisteredEntry(event, options.registry);
    if (!entry) {
      return;
    }

    const pendingAction = options.session.getState().pendingAction;
    const matchedPending = actionMatchesPending(
      entry.id,
      action,
      pendingAction?.expectedUserAction,
    ) && pendingAction?.targetId === entry.id;

    if (matchedPending) {
      options.session.clearPendingAction();
    }
    options.session.recordAction({ type: action, label: entry.label });

    const timestamp = now();
    if (action === 'click') {
      emit({
        type: 'click',
        action,
        targetId: entry.id,
        label: entry.label,
        matchedPending,
        timestamp,
      });
      return;
    }

    const controlState = readSafeControlState(entry.element);
    const sharedEvent = {
      targetId: entry.id,
      label: entry.label,
      matchedPending,
      hasValue: controlState.hasValue ?? false,
      validationState: controlState.validationState ?? 'unknown',
      timestamp,
    };

    if (action === 'select') {
      emit({ type: 'select', action: 'select', ...sharedEvent });
    } else {
      emit({ type: 'input-complete', action: 'input', ...sharedEvent });
    }
  };

  const handleClick = (event: MouseEvent) => {
    recordTargetedAction(event, 'click');
  };

  const handleInput = (event: Event) => {
    const entry = findRegisteredEntry(event, options.registry);
    if (!entry || !isInputLike(entry.element) || isSelectLike(entry.element)) {
      return;
    }
    recordTargetedAction(event, 'input');
  };

  const handleChange = (event: Event) => {
    const entry = findRegisteredEntry(event, options.registry);
    if (!entry || !isInputLike(entry.element)) {
      return;
    }
    recordTargetedAction(event, isSelectLike(entry.element) ? 'select' : 'input');
  };

  const emitNavigation = (reason: NavigationReason) => {
    const nextUrl = getCurrentUrl(documentNode);
    if (nextUrl === currentUrl) {
      return;
    }

    const previousUrl = currentUrl;
    currentUrl = nextUrl;
    options.session.clearPendingAction();
    emit({
      type: 'navigation',
      url: nextUrl,
      previousUrl,
      reason,
      timestamp: now(),
    });
  };

  const handlePopState = () => emitNavigation('popstate');
  const handleHashChange = () => emitNavigation('hashchange');

  return {
    start() {
      if (started) {
        return;
      }

      started = true;
      currentUrl = getCurrentUrl(documentNode);
      documentNode.addEventListener('click', handleClick, true);
      documentNode.addEventListener('input', handleInput, true);
      documentNode.addEventListener('change', handleChange, true);
      windowNode?.addEventListener('popstate', handlePopState);
      windowNode?.addEventListener('hashchange', handleHashChange);

      historyNode = windowNode?.history;
      if (!historyNode) {
        return;
      }

      originalPushState = historyNode.pushState;
      originalReplaceState = historyNode.replaceState;
      historyNode.pushState = function (
        this: History,
        ...args: Parameters<History['pushState']>
      ) {
        const result = originalPushState?.apply(this, args);
        emitNavigation('push-state');
        return result;
      };
      historyNode.replaceState = function (
        this: History,
        ...args: Parameters<History['replaceState']>
      ) {
        const result = originalReplaceState?.apply(this, args);
        emitNavigation('replace-state');
        return result;
      };
    },

    stop() {
      if (!started) {
        return;
      }

      started = false;
      documentNode.removeEventListener('click', handleClick, true);
      documentNode.removeEventListener('input', handleInput, true);
      documentNode.removeEventListener('change', handleChange, true);
      windowNode?.removeEventListener('popstate', handlePopState);
      windowNode?.removeEventListener('hashchange', handleHashChange);

      if (historyNode) {
        if (originalPushState) {
          historyNode.pushState = originalPushState;
        }
        if (originalReplaceState) {
          historyNode.replaceState = originalReplaceState;
        }
      }
      historyNode = undefined;
      originalPushState = undefined;
      originalReplaceState = undefined;
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
