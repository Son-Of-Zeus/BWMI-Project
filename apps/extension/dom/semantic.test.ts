import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createSemanticScanner,
  createSemanticSnapshot,
  discoverSemanticElements,
} from './semantic';

function setRect(
  element: HTMLElement,
  rect: { top: number; left: number; right: number; bottom: number },
) {
  vi.spyOn(element, 'getBoundingClientRect').mockReturnValue({
    ...rect,
    width: rect.right - rect.left,
    height: rect.bottom - rect.top,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  });
}

describe('DOM semantic layer', () => {
  beforeEach(() => {
    document.head.innerHTML = '<title>Member Dashboard</title>';
    document.body.innerHTML = '';
  });

  it('discovers accessible controls with inferred roles and bounded context', () => {
    document.body.innerHTML = `
      <h1>Member Dashboard</h1>
      <section>
        <h2>Member Services</h2>
        <button id="online-services">Online Services</button>
        <a href="/passbook" aria-label="View Passbook">Open</a>
        <label for="uan">Universal Account Number (UAN)</label>
        <input id="uan" name="uan" value="100200300400" />
        <div role="button" aria-labelledby="profile-label">
          <span id="profile-label">Manage Profile</span>
        </div>
      </section>
    `;

    const online = document.querySelector('#online-services') as HTMLElement;
    const passbook = document.querySelector('a') as HTMLElement;
    const uan = document.querySelector('#uan') as HTMLElement;
    const profile = document.querySelector('[role="button"]') as HTMLElement;
    [online, passbook, uan, profile].forEach((element) =>
      setRect(element, { top: 20, left: 20, right: 240, bottom: 60 }),
    );

    const entries = discoverSemanticElements(document, {
      viewport: { width: 800, height: 600 },
    });

    expect(entries.map(({ role, label }) => ({ role, label }))).toEqual([
      { role: 'button', label: 'Online Services' },
      { role: 'link', label: 'View Passbook' },
      { role: 'textbox', label: 'Universal Account Number (UAN)' },
      { role: 'button', label: 'Manage Profile' },
    ]);
    expect(entries.every((entry) => entry.section === 'Member Services')).toBe(
      true,
    );
    expect(entries.find((entry) => entry.element === uan)).toMatchObject({
      hasValue: true,
      validationState: 'valid',
    });
  });

  it('excludes non-interactive landmark roles from model context', () => {
    document.body.innerHTML = `
      <div role="banner">Header</div>
      <nav role="navigation">Navigation</nav>
      <main role="main">
        <button>Online Services</button>
        <div role="status">Member verified</div>
      </main>
      <footer role="contentinfo">Footer</footer>
    `;

    expect(discoverSemanticElements(document).map(({ role, label }) => ({ role, label }))).toEqual([
      { role: 'button', label: 'Online Services' },
    ]);
  });

  it('keeps visibility separate from viewport position and filters hidden controls', () => {
    document.body.innerHTML = `
      <button id="above">Above</button>
      <button id="below">Below</button>
      <button id="hidden" hidden>Hidden</button>
    `;

    setRect(document.querySelector('#above') as HTMLElement, {
      top: 20,
      left: 20,
      right: 120,
      bottom: 60,
    });
    setRect(document.querySelector('#below') as HTMLElement, {
      top: 900,
      left: 20,
      right: 120,
      bottom: 940,
    });

    const snapshot = createSemanticSnapshot(document, {
      viewport: { width: 800, height: 600 },
    });

    expect(snapshot.elements.map((element) => element.label)).toEqual([
      'Above',
      'Below',
    ]);
    expect(snapshot.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: 'Above', visible: true, inViewport: true }),
        expect.objectContaining({ label: 'Below', visible: true, inViewport: false }),
      ]),
    );
  });

  it('never serializes input values, including password and OTP-like fields', () => {
    document.body.innerHTML = `
      <label for="password">Password</label>
      <input id="password" type="password" value="not-a-secret" />
      <label for="otp">One Time Password</label>
      <input id="otp" inputmode="numeric" value="123456" aria-invalid="true" />
    `;

    const snapshot = createSemanticSnapshot(document);
    const serialized = JSON.stringify(snapshot);

    expect(serialized).not.toContain('not-a-secret');
    expect(serialized).not.toContain('123456');
    expect(snapshot.elements).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: 'Password',
          hasValue: true,
          validationState: 'valid',
        }),
        expect.objectContaining({
          label: 'One Time Password',
          hasValue: true,
          validationState: 'invalid',
        }),
      ]),
    );
  });

  it('does not treat an empty select placeholder as completed', () => {
    const select = document.createElement('select');
    select.setAttribute('aria-label', 'Claim type');
    select.innerHTML = '<option value="">Choose a claim type</option>';
    document.body.append(select);

    expect(discoverSemanticElements(document)).toEqual([
      expect.objectContaining({
        label: 'Claim type',
        hasValue: false,
        validationState: 'unknown',
      }),
    ]);
  });

  it('debounces mutation-driven rescans and stops observing after cleanup', async () => {
    vi.useFakeTimers();
    const scanner = createSemanticScanner({ debounceMs: 50 });
    const listener = vi.fn();
    scanner.subscribe(listener);
    scanner.start();

    expect(listener).toHaveBeenCalledTimes(1);
    document.body.append(document.createElement('button'));
    document.body.append(document.createElement('button'));

    await vi.advanceTimersByTimeAsync(49);
    expect(listener).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(1);
    expect(listener).toHaveBeenCalledTimes(2);

    scanner.stop();
    document.body.append(document.createElement('button'));
    await vi.advanceTimersByTimeAsync(100);
    expect(listener).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
