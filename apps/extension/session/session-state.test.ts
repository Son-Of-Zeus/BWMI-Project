import { describe, expect, it, vi } from 'vitest';
import {
  createSessionState,
  type SessionState,
} from './session-state';

describe('session state', () => {
  it('starts with an idle companion and no workflow context', () => {
    const store = createSessionState();

    expect(store.getState()).toEqual({
      recentActions: [],
      companionState: 'idle',
    });
  });

  it('normalizes the goal and keeps only a bounded recent action window', () => {
    const store = createSessionState({
      recentActionLimit: 2,
      now: vi.fn(() => 1234),
    });

    store.setGoal('  PF   withdrawal  ');
    store.recordAction({ type: 'click', label: ' Online Services ' });
    store.recordAction({ type: 'input', label: ' UAN ' });
    store.recordAction({ type: 'select', label: ' Claim type ' });

    expect(store.getState()).toMatchObject({
      goal: 'PF withdrawal',
      recentActions: [
        { type: 'input', label: 'UAN', timestamp: 1234 },
        { type: 'select', label: 'Claim type', timestamp: 1234 },
      ],
    });
  });

  it('records explanation interruptions without changing workflow context', () => {
    const store = createSessionState();
    store.setGoal('PF withdrawal');
    store.setPendingAction({
      targetId: 'el_17',
      expectedUserAction: 'click',
    });

    store.recordAction({
      type: 'explanation',
      label: 'What is UAN?',
      timestamp: 10,
    });

    expect(store.getState()).toEqual({
      goal: 'PF withdrawal',
      recentActions: [
        { type: 'explanation', label: 'What is UAN?', timestamp: 10 },
      ],
      pendingAction: {
        targetId: 'el_17',
        expectedUserAction: 'click',
      },
      companionState: 'idle',
    });
  });

  it('publishes cloned snapshots and keeps state transitions explicit', () => {
    const store = createSessionState();
    const listener = vi.fn<(state: SessionState) => void>();
    const unsubscribe = store.subscribe(listener);

    store.setCompanionState('thinking');
    store.setPendingAction({ targetId: 'el_31', expectedUserAction: 'input' });

    const returnedState = store.getState();
    returnedState.recentActions.push({ type: 'click', timestamp: 99 });
    if (returnedState.pendingAction) {
      returnedState.pendingAction.targetId = 'mutated';
    }

    expect(store.getState()).toMatchObject({
      recentActions: [],
      pendingAction: { targetId: 'el_31' },
      companionState: 'thinking',
    });
    expect(listener).toHaveBeenCalledTimes(2);

    store.clearPendingAction();
    store.reset();
    expect(store.getState()).toEqual({
      recentActions: [],
      companionState: 'idle',
    });

    unsubscribe();
    store.setGoal('ignored after unsubscribe');
    expect(listener).toHaveBeenCalledTimes(4);
  });

  it('clears blank goals and pending actions without changing unrelated state', () => {
    const store = createSessionState();
    store.setGoal('A goal');
    store.recordAction({ type: 'click', timestamp: 1 });
    store.setPendingAction({ targetId: 'el_1', expectedUserAction: 'click' });

    store.setGoal('   ');
    store.clearPendingAction();

    expect(store.getState()).toEqual({
      recentActions: [{ type: 'click', timestamp: 1 }],
      companionState: 'idle',
    });
  });
});
