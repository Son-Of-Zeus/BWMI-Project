import { act } from 'react';
import ReactDOM from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';
import Companion, {
  COMPANION_STATUS_ID,
  getCompanionButtonLabel,
} from './Companion';
import { createCompanionUiStore } from './companion-ui';

describe('Companion accessibility', () => {
  it('uses action labels that describe stop, retry, follow-up, and start states', () => {
    expect(getCompanionButtonLabel('idle')).toBe('Start voice guidance');
    expect(getCompanionButtonLabel('listening')).toBe('Stop listening');
    expect(getCompanionButtonLabel('thinking')).toBe('Stop current guidance');
    expect(getCompanionButtonLabel('speaking')).toBe('Stop current guidance');
    expect(getCompanionButtonLabel('error')).toBe('Try voice guidance again');
    expect(getCompanionButtonLabel('waiting')).toBe('Ask a follow-up question');
    expect(getCompanionButtonLabel('success')).toBe(
      'Start a new voice guidance request',
    );
  });

  it('exposes the current state through region, busy, description, and live-status semantics', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const store = createCompanionUiStore(host);
    const reactMount = document.createElement('div');
    host.append(reactMount);
    const root = ReactDOM.createRoot(reactMount);

    await act(async () => {
      root.render(<Companion store={store} />);
    });

    const surface = host.querySelector('[role="region"]') as HTMLElement;
    const button = host.querySelector('button') as HTMLButtonElement;
    const status = host.querySelector(`#${COMPANION_STATUS_ID}`) as HTMLElement;
    expect(surface.getAttribute('aria-label')).toBe('Voice companion');
    expect(surface.getAttribute('aria-busy')).toBe('false');
    expect(button.getAttribute('aria-describedby')).toBe(COMPANION_STATUS_ID);
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');

    await act(async () => {
      store.setState('thinking');
    });
    expect(surface.getAttribute('aria-busy')).toBe('true');
    expect(button.getAttribute('aria-label')).toBe('Stop current guidance');
    expect(status.textContent).toContain('Thinking…');

    await act(async () => {
      store.setLatencyNotice(true);
    });
    expect(surface.getAttribute('data-companion-latency')).toBe('slow');
    expect(status.textContent).toContain('Still working…');

    await act(async () => {
      store.setState('error');
    });
    expect(surface.getAttribute('aria-busy')).toBe('false');
    expect(surface.getAttribute('data-companion-latency')).toBe('normal');
    expect(button.getAttribute('aria-label')).toBe('Try voice guidance again');
    expect(status.getAttribute('aria-live')).toBe('assertive');
    expect(status.textContent).toContain('Try again');

    root.unmount();
    store.destroy();
  });

  it('renders an accessible demo-reset control and delegates the action', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const store = createCompanionUiStore(host);
    const resetHandler = vi.fn();
    store.setResetHandler(resetHandler);
    const reactMount = document.createElement('div');
    host.append(reactMount);
    const root = ReactDOM.createRoot(reactMount);

    await act(async () => {
      root.render(<Companion store={store} />);
    });

    const resetButton = host.querySelector(
      'button[aria-label="Reset demo"]',
    ) as HTMLButtonElement;
    expect(resetButton.getAttribute('title')).toBe('Reset demo');

    await act(async () => {
      resetButton.click();
    });

    expect(resetHandler).toHaveBeenCalledTimes(1);
    root.unmount();
    store.destroy();
  });

  it('shows a compact expandable latency breakdown inside the companion', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const store = createCompanionUiStore(host);
    store.recordLatency({ stage: 'speech-to-text', durationMs: 800 });
    store.recordLatency({ stage: 'reasoning', durationMs: 1_200 });
    const reactMount = document.createElement('div');
    host.append(reactMount);
    const root = ReactDOM.createRoot(reactMount);

    await act(async () => {
      root.render(<Companion store={store} />);
    });

    const details = host.querySelector('.companion-latency') as HTMLDetailsElement;
    expect(details.querySelector('summary')?.textContent).toContain('2.0s measured');
    expect(details.textContent).toContain('Speech recognition');
    expect(details.textContent).toContain('Reasoning');

    root.unmount();
    store.destroy();
  });
});
