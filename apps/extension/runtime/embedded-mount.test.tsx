import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  EMBEDDED_COMPANION_HOST_STYLE,
  mountEmbeddedCompanion,
  normalizeEmbeddedBackendUrl,
} from './embedded-mount';

describe('embedded companion mount', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('normalizes the public backend base URL without changing its path', () => {
    expect(normalizeEmbeddedBackendUrl(' https://api.example.com/api/// ')).toBe(
      'https://api.example.com/api',
    );
    expect(normalizeEmbeddedBackendUrl('')).toBe('http://127.0.0.1:8787');
    expect(normalizeEmbeddedBackendUrl(undefined, 'https://fallback.example')).toBe(
      'https://fallback.example',
    );
  });

  it('mounts an isolated companion while scanning only the live page DOM', async () => {
    const pageButton = document.createElement('button');
    pageButton.textContent = 'Continue on portal';
    document.body.append(pageButton);

    let mounted!: ReturnType<typeof mountEmbeddedCompanion>;
    await act(async () => {
      mounted = mountEmbeddedCompanion({
        document,
        backendUrl: 'https://api.example.com/api',
        styleText: '.embedded-test-style { color: red; }',
      });
    });

    expect(mounted.host.style.cssText).toContain(
      EMBEDDED_COMPANION_HOST_STYLE.split(';')[0],
    );
    expect(mounted.host.style.pointerEvents).toBe('none');
    expect(mounted.shadowRoot.querySelector('style')?.textContent).toContain(
      '.embedded-test-style',
    );
    expect(mounted.shadowRoot.querySelector('[role="region"]')).not.toBeNull();

    const page = mounted.runtime.flow.getSnapshot().page;
    expect(page?.elements).toEqual([
      expect.objectContaining({ label: 'Continue on portal' }),
    ]);
    expect(page?.elements.some((element) => /voice companion/i.test(element.label))).toBe(
      false,
    );

    const host = mounted.host;
    mounted.destroy();
    mounted.destroy();

    expect(document.body.contains(host)).toBe(false);
    expect(mounted.store.getSnapshot().targetRect).toBeNull();
  });
});
