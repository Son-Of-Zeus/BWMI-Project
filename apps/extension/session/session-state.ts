export const DEFAULT_RECENT_ACTION_LIMIT = 8;

export type RecentActionType =
  | 'click'
  | 'input'
  | 'select'
  | 'explanation';

export type ExpectedUserAction = 'click' | 'input' | 'select';

export type CompanionState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'guiding'
  | 'speaking'
  | 'waiting'
  | 'success'
  | 'error';

export type RecentAction = {
  type: RecentActionType;
  label?: string;
  timestamp: number;
};

export type PendingAction = {
  targetId: string;
  expectedUserAction: ExpectedUserAction;
};

export type SessionState = {
  goal?: string;
  recentActions: RecentAction[];
  pendingAction?: PendingAction;
  companionState: CompanionState;
};

export type RecordActionInput = {
  type: RecentActionType;
  label?: string;
  timestamp?: number;
};

export type SessionStateOptions = {
  recentActionLimit?: number;
  now?: () => number;
};

export interface SessionStateStore {
  getState(): SessionState;
  subscribe(listener: (state: SessionState) => void): () => void;
  setGoal(goal?: string): void;
  recordAction(action: RecordActionInput): void;
  setPendingAction(pendingAction?: PendingAction): void;
  clearPendingAction(): void;
  setCompanionState(companionState: CompanionState): void;
  reset(): void;
}

function normalizeText(value: string | undefined): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();
  return normalized || undefined;
}

function cloneState(state: SessionState): SessionState {
  return {
    goal: state.goal,
    recentActions: state.recentActions.map((action) => ({ ...action })),
    pendingAction: state.pendingAction ? { ...state.pendingAction } : undefined,
    companionState: state.companionState,
  };
}

function createInitialState(): SessionState {
  return {
    recentActions: [],
    companionState: 'idle',
  };
}

export function createSessionState(
  options: SessionStateOptions = {},
): SessionStateStore {
  const recentActionLimit = Math.max(
    1,
    Math.floor(options.recentActionLimit ?? DEFAULT_RECENT_ACTION_LIMIT),
  );
  const now = options.now ?? Date.now;
  const listeners = new Set<(state: SessionState) => void>();
  let state = createInitialState();

  const publish = (nextState: SessionState) => {
    state = nextState;
    const snapshot = cloneState(state);
    listeners.forEach((listener) => listener(snapshot));
  };

  return {
    getState() {
      return cloneState(state);
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    setGoal(goal) {
      const normalizedGoal = normalizeText(goal);
      if (normalizedGoal === state.goal) {
        return;
      }

      publish({ ...state, goal: normalizedGoal });
    },

    recordAction(action) {
      const label = normalizeText(action.label);
      const timestamp = action.timestamp ?? now();
      const nextAction: RecentAction = {
        type: action.type,
        timestamp,
        ...(label ? { label } : {}),
      };

      publish({
        ...state,
        recentActions: [...state.recentActions, nextAction].slice(
          -recentActionLimit,
        ),
      });
    },

    setPendingAction(pendingAction) {
      if (
        pendingAction &&
        pendingAction.targetId === state.pendingAction?.targetId &&
        pendingAction.expectedUserAction ===
          state.pendingAction.expectedUserAction
      ) {
        return;
      }

      publish({
        ...state,
        pendingAction: pendingAction
          ? { ...pendingAction }
          : undefined,
      });
    },

    clearPendingAction() {
      if (!state.pendingAction) {
        return;
      }

      publish({ ...state, pendingAction: undefined });
    },

    setCompanionState(companionState) {
      if (companionState === state.companionState) {
        return;
      }

      publish({ ...state, companionState });
    },

    reset() {
      publish(createInitialState());
    },
  };
}
