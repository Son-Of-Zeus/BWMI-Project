import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createInteractionObserver } from './interaction-observer';
import { createElementRegistry } from '../registry/element-registry';
import { createSessionState } from '../session/session-state';
import type { DiscoveredElement } from '../dom/semantic';

function discovered(
  element: HTMLElement,
  label: string,
  overrides: Partial<DiscoveredElement> = {},
): DiscoveredElement {
  return {
    role: element.tagName.toLowerCase() === 'select' ? 'combobox' : 'button',
    label,
    visible: true,
    inViewport: true,
    disabled: false,
    element,
    ...overrides,
  };
}

describe('interaction observer', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    window.history.replaceState({}, '', '/');
  });

  it('resolves nested click targets, matches pending actions, and does not block page handlers', () => {
    const button = document.createElement('button');
    const icon = document.createElement('span');
    icon.textContent = 'Open';
    button.append(icon);
    document.body.append(button);

    const registry = createElementRegistry();
    registry.reconcile([discovered(button, 'Online Services')]);
    const session = createSessionState();
    session.setPendingAction({
      targetId: 'el_1',
      expectedUserAction: 'click',
    });

    const pageHandler = vi.fn();
    document.addEventListener('click', pageHandler);
    const events: unknown[] = [];
    const observer = createInteractionObserver({
      registry,
      session,
      onEvent: (event) => events.push(event),
      now: () => 10,
    });
    observer.start();

    const click = new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
    });
    icon.dispatchEvent(click);

    expect(pageHandler).toHaveBeenCalledTimes(1);
    expect(click.defaultPrevented).toBe(false);
    expect(events).toEqual([
      {
        type: 'click',
        action: 'click',
        targetId: 'el_1',
        label: 'Online Services',
        matchedPending: true,
        timestamp: 10,
      },
    ]);
    expect(session.getState()).toMatchObject({
      pendingAction: undefined,
      recentActions: [{ type: 'click', label: 'Online Services' }],
    });

    observer.stop();
    document.removeEventListener('click', pageHandler);
  });

  it('emits unexpected registered clicks without blocking or clearing pending guidance', () => {
    const expected = document.createElement('button');
    const unexpected = document.createElement('button');
    document.body.append(expected, unexpected);

    const registry = createElementRegistry();
    registry.reconcile([
      discovered(expected, 'Expected'),
      discovered(unexpected, 'Unexpected'),
    ]);
    const session = createSessionState();
    session.setPendingAction({
      targetId: 'el_1',
      expectedUserAction: 'click',
    });
    const events: unknown[] = [];
    const observer = createInteractionObserver({
      registry,
      session,
      onEvent: (event) => events.push(event),
      now: () => 20,
    });
    observer.start();

    unexpected.click();

    expect(events).toEqual([
      expect.objectContaining({
        type: 'click',
        targetId: 'el_2',
        matchedPending: false,
      }),
    ]);
    expect(session.getState()).toMatchObject({
      pendingAction: {
        targetId: 'el_1',
        expectedUserAction: 'click',
      },
      recentActions: [{ type: 'click', label: 'Unexpected' }],
    });
    observer.stop();
  });

  it('reports input status without exposing the input value', () => {
    const input = document.createElement('input');
    input.type = 'password';
    input.value = 'secret-value';
    document.body.append(input);

    const registry = createElementRegistry();
    registry.reconcile([
      discovered(input, 'Password', { role: 'textbox', hasValue: false }),
    ]);
    const session = createSessionState({ now: () => 30 });
    session.setPendingAction({
      targetId: 'el_1',
      expectedUserAction: 'input',
    });
    const events: unknown[] = [];
    const observer = createInteractionObserver({
      registry,
      session,
      onEvent: (event) => events.push(event),
      now: () => 30,
    });
    observer.start();

    input.dispatchEvent(new Event('input', { bubbles: true }));

    const event = events[0] as Record<string, unknown>;
    expect(event).toMatchObject({
      type: 'input-complete',
      action: 'input',
      targetId: 'el_1',
      label: 'Password',
      matchedPending: true,
      hasValue: true,
      validationState: 'valid',
      timestamp: 30,
    });
    expect(JSON.stringify(event)).not.toContain('secret-value');
    expect(session.getState().recentActions).toEqual([
      { type: 'input', label: 'Password', timestamp: 30 },
    ]);
    observer.stop();
  });

  it('reports select changes using the select action type', () => {
    const select = document.createElement('select');
    select.innerHTML = '<option value="withdrawal">Withdrawal</option>';
    select.selectedIndex = 0;
    document.body.append(select);

    const registry = createElementRegistry();
    registry.reconcile([discovered(select, 'Claim type')]);
    const session = createSessionState();
    session.setPendingAction({
      targetId: 'el_1',
      expectedUserAction: 'select',
    });
    const events: unknown[] = [];
    const observer = createInteractionObserver({
      registry,
      session,
      onEvent: (event) => events.push(event),
      now: () => 40,
    });
    observer.start();

    select.dispatchEvent(new Event('change', { bubbles: true }));

    expect(events).toEqual([
      {
        type: 'select',
        action: 'select',
        targetId: 'el_1',
        label: 'Claim type',
        matchedPending: true,
        hasValue: true,
        validationState: 'valid',
        timestamp: 40,
      },
    ]);
    observer.stop();
  });

  it('observes SPA navigation, clears stale pending targets, and restores history on stop', () => {
    const button = document.createElement('button');
    document.body.append(button);
    const registry = createElementRegistry();
    registry.reconcile([discovered(button, 'Target')]);
    const session = createSessionState();
    session.setPendingAction({
      targetId: 'el_1',
      expectedUserAction: 'click',
    });
    const events: unknown[] = [];
    const observer = createInteractionObserver({
      registry,
      session,
      onEvent: (event) => events.push(event),
      now: () => 50,
    });
    observer.start();

    window.history.pushState({}, '', '/claims');

    expect(events).toEqual([
      {
        type: 'navigation',
        url: expect.stringContaining('/claims'),
        previousUrl: expect.stringContaining('/'),
        reason: 'push-state',
        timestamp: 50,
      },
    ]);
    expect(session.getState().pendingAction).toBeUndefined();

    observer.stop();
    window.history.pushState({}, '', '/after-stop');
    expect(events).toHaveLength(1);
  });
});
