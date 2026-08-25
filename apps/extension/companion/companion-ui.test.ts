import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  COMPANION_STATE_LABELS,
  createCompanionUiStore,
  getCompanionPosition,
} from './companion-ui';

function rect(top: number, bottom: number, left = 100, right = 300): DOMRect {
  return {
    top,
    bottom,
    left,
    right,
    width: right - left,
    height: bottom - top,
    x: left,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

describe('companion UI', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('positions beside the target and flips left when right-side space is unavailable', () => {
    expect(
      getCompanionPosition(rect(100, 160, 100, 300), {
        width: 1200,
        height: 800,
      }),
    ).toEqual({ left: 316, top: 98 });

    expect(
      getCompanionPosition(rect(100, 160, 1080, 1180), {
        width: 1200,
        height: 800,
      }),
    ).toEqual({ left: 1000, top: 98 });
  });

  it('clamps the companion inside the viewport edges', () => {
    expect(
      getCompanionPosition(rect(-100, -40, -80, -20), {
        width: 320,
        height: 240,
      }),
    ).toEqual({ left: 16, top: 16 });
  });

  it('publishes state and target changes through the external store', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const store = createCompanionUiStore(host);
    const listener = vi.fn();
    store.subscribe(listener);

    store.setState('guiding');
    store.setTarget(rect(20, 80));

    expect(store.getSnapshot()).toMatchObject({
      state: 'guiding',
      targetRect: { top: 20, bottom: 80 },
    });
    expect(listener).toHaveBeenCalledTimes(2);
    expect(COMPANION_STATE_LABELS.guiding).toBe('Look here');
  });

  it('creates pointer-transparent focus and highlight layers without changing page styles', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const store = createCompanionUiStore(host);
    const target = rect(40, 120, 50, 250);

    store.activateFocusMask();
    store.highlight(target);

    const focusMask = host.querySelector('[data-companion-layer="focus-mask"]') as HTMLElement;
    const highlight = host.querySelector('[data-companion-layer="highlight"]') as HTMLElement;
    expect(focusMask.hidden).toBe(false);
    expect(highlight.hidden).toBe(false);
    expect(focusMask.className).toContain('companion-focus-mask');
    expect(highlight.style.left).toBe('50px');
    expect(highlight.style.top).toBe('40px');
    expect(highlight.style.pointerEvents).toBe('');
    expect(store.getSnapshot().focusMaskActive).toBe(true);
  });

  it('clears presentation layers and removes them on destroy', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const store = createCompanionUiStore(host);
    store.activateFocusMask();
    store.highlight(rect(20, 80));

    store.clear();
    expect(store.getSnapshot()).toMatchObject({
      focusMaskActive: false,
      highlightRect: null,
      targetRect: null,
    });
    expect((host.querySelector('[data-companion-layer="focus-mask"]') as HTMLElement).hidden).toBe(true);

    store.destroy();
    expect(host.querySelector('[data-companion-layer]')).toBeNull();
  });

  it('toggles listening without introducing a chat transcript or message feed', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const store = createCompanionUiStore(host);

    store.toggleListening();
    expect(store.getSnapshot().state).toBe('listening');
    store.toggleListening();
    expect(store.getSnapshot().state).toBe('idle');
    expect(host.querySelector('[role="log"]')).toBeNull();
    expect(host.querySelector('aside')).toBeNull();
  });

  it('delegates microphone clicks to the runtime when a listening handler is attached', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const store = createCompanionUiStore(host);
    const handler = vi.fn();
    store.setListeningHandler(handler);

    store.toggleListening();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot().state).toBe('idle');
  });
});
