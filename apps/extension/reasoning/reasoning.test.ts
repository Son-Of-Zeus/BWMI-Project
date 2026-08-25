import { describe, expect, it, vi } from 'vitest';
import {
  buildReasonRequest,
  createReasoningClient,
  parseGuideActionJson,
  ReasoningValidationError,
  sanitizeReasonRequest,
  validateGuideAction,
} from './reasoning';
import { createSessionState } from '../session/session-state';
import type { SemanticElement } from '../registry/element-registry';

const elements: SemanticElement[] = [
  {
    id: 'el_1',
    role: 'button',
    label: 'Online Services',
    visible: true,
    inViewport: true,
    disabled: false,
  },
  {
    id: 'el_2',
    role: 'textbox',
    label: 'UAN',
    visible: true,
    inViewport: true,
    disabled: false,
    hasValue: false,
    validationState: 'unknown',
  },
];

describe('reasoning boundary', () => {
  it('builds a minimal request without timestamps, pending IDs, or DOM data', () => {
    const session = createSessionState({ now: () => 100 });
    session.setGoal('PF withdrawal');
    session.setPendingAction({
      targetId: 'el_1',
      expectedUserAction: 'click',
    });
    session.recordAction({ type: 'click', label: 'Previous', timestamp: 1 });

    const request = buildReasonRequest({
      userUtterance: ' Mujhe PF ka paisa nikalna hai ',
      language: 'hi-IN',
      session: session.getState(),
      page: {
        page: { title: 'Member Dashboard', section: 'Services' },
        elements,
      },
    });

    expect(request).toEqual({
      userUtterance: 'Mujhe PF ka paisa nikalna hai',
      userLanguage: 'hi-IN',
      session: {
        goal: 'PF withdrawal',
        recentActions: [{ type: 'click', label: 'Previous' }],
        pendingAction: { type: 'click', targetLabel: 'Online Services' },
      },
      page: {
        title: 'Member Dashboard',
        section: 'Services',
        elements,
      },
    });
    expect(JSON.stringify(request)).not.toContain('timestamp');
    expect(JSON.stringify(request)).not.toContain('"element":');
  });

  it('omits the language hint when speech recognition provides none', () => {
    const request = buildReasonRequest({
      userUtterance: 'Help me with my claim',
      session: createSessionState().getState(),
      page: {
        page: { title: 'Member Dashboard' },
        elements,
      },
    });

    expect(request).not.toHaveProperty('userLanguage');
  });

  it('validates the language hint without exposing an unbounded request field', () => {
    expect(() =>
      sanitizeReasonRequest({
        userUtterance: 'Help',
        userLanguage: 'x'.repeat(25),
        session: { recentActions: [] },
        page: { elements: [] },
      }),
    ).toThrow(/userLanguage exceeds its maximum length/);
  });

  it('accepts valid target actions and rejects unknown targets or extra fields', () => {
    expect(
      validateGuideAction(
        {
          action: 'guide',
          targetId: 'el_1',
          spokenInstruction: 'Online Services par click kariye.',
          expectedUserAction: 'click',
          language: 'hi-IN',
        },
        ['el_1', 'el_2'],
      ),
    ).toEqual({
      action: 'guide',
      targetId: 'el_1',
      spokenInstruction: 'Online Services par click kariye.',
      expectedUserAction: 'click',
      language: 'hi-IN',
    });

    expect(() =>
      validateGuideAction(
        {
          action: 'guide',
          targetId: 'el_999',
          spokenInstruction: 'Click this.',
          expectedUserAction: 'click',
          language: 'en-IN',
        },
        ['el_1'],
      ),
    ).toThrow(ReasoningValidationError);

    expect(() =>
      validateGuideAction(
        {
          action: 'wait',
          code: 'document.body.click()',
        },
        ['el_1'],
      ),
      ).toThrow(/Unexpected GuideAction field/);

    expect(() =>
      validateGuideAction(
        {
          action: 'guide',
          targetId: 'el_1',
          spokenInstruction: 'Click.',
          expectedUserAction: 'click',
          language: 'en-IN',
        },
        ['el_1'],
        [{ id: 'el_1', role: 'button', label: 'Submit', disabled: true }],
      ),
    ).toThrow(/Unsafe GuideAction/);
  });

  it('requires a consequence explanation for consequential guide targets', () => {
    const metadata = [
      { id: 'el_1', role: 'button' as const, label: 'Submit Claim', disabled: false },
    ];
    const baseAction = {
      action: 'guide' as const,
      targetId: 'el_1',
      spokenInstruction: 'Details sahi hain to khud click kariye.',
      expectedUserAction: 'click' as const,
      language: 'hi-IN',
    };

    expect(() => validateGuideAction(baseAction, ['el_1'], metadata)).toThrow(
      /consequence explanation/,
    );
    expect(
      validateGuideAction(
        {
          ...baseAction,
          consequence: 'Isse aapki claim request submit ho jayegi.',
        },
        ['el_1'],
        metadata,
      ),
    ).toEqual({
      ...baseAction,
      consequence: 'Isse aapki claim request submit ho jayegi.',
    });
  });

  it('validates target-free recovery actions and rejects executable instructions', () => {
    expect(
      validateGuideAction(
        {
          action: 'clarify',
          spokenInstruction: 'Claim withdraw karna hai ya status dekhna hai?',
          language: 'hi-IN',
        },
        [],
      ),
    ).toEqual({
      action: 'clarify',
      spokenInstruction: 'Claim withdraw karna hai ya status dekhna hai?',
      language: 'hi-IN',
    });
    expect(validateGuideAction({ action: 'wait' }, [])).toEqual({
      action: 'wait',
    });
    expect(() =>
      validateGuideAction(
        {
          action: 'success',
          spokenInstruction: '<script>alert(1)</script>',
          language: 'en-IN',
        },
        [],
      ),
    ).toThrow(/executable content/);
  });

  it('parses structured JSON and rejects malformed responses', () => {
    expect(
      parseGuideActionJson(
        JSON.stringify({ action: 'scroll', targetId: 'el_2' }),
        ['el_1', 'el_2'],
      ),
    ).toEqual({ action: 'scroll', targetId: 'el_2' });
    expect(() => parseGuideActionJson('{bad json', ['el_1'])).toThrow(
      /not valid JSON/,
    );
  });

  it('posts a sanitized request and validates the backend response', async () => {
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      const sent = JSON.parse(String(init?.body));
      expect(sent.page.elements[0]).not.toHaveProperty('element');
      expect(sent.session.recentActions[0]).not.toHaveProperty('timestamp');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          action: 'explain',
          targetId: 'el_2',
          spokenInstruction: 'UAN aapka member number hota hai.',
          language: 'hi-IN',
        }),
      } as Response;
    });
    const client = createReasoningClient({
      endpoint: 'https://example.test/reason',
      fetcher,
    });

    await expect(
      client.reason({
        userUtterance: 'UAN kya hota hai?',
        session: { recentActions: [{ type: 'explanation', timestamp: 2 } as never] },
        page: { elements },
      }),
    ).resolves.toEqual({
      action: 'explain',
      targetId: 'el_2',
      spokenInstruction: 'UAN aapka member number hota hai.',
      language: 'hi-IN',
    });
    expect(fetcher).toHaveBeenCalledWith(
      'https://example.test/reason',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('surfaces endpoint failures and invalid target responses', async () => {
    const failedFetcher = vi.fn(async () =>
      ({ ok: false, status: 503 }) as Response,
    );
    const failedClient = createReasoningClient({
      endpoint: 'https://example.test/reason',
      fetcher: failedFetcher,
    });

    await expect(
      failedClient.reason({
        userUtterance: 'Help',
        session: { recentActions: [] },
        page: { elements },
      }),
    ).rejects.toMatchObject({ status: 503 });

    const invalidResponseFetcher = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          action: 'guide',
          targetId: 'not-current',
          spokenInstruction: 'Click.',
          expectedUserAction: 'click',
          language: 'en-IN',
        }),
      }) as Response,
    );
    const invalidClient = createReasoningClient({
      endpoint: 'https://example.test/reason',
      fetcher: invalidResponseFetcher,
    });

    await expect(
      invalidClient.reason({
        userUtterance: 'Help',
        session: { recentActions: [] },
        page: { elements },
      }),
    ).rejects.toBeInstanceOf(ReasoningValidationError);

    const disabledResponseFetcher = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        json: async () => ({
          action: 'guide',
          targetId: 'el_1',
          spokenInstruction: 'Submit par click kariye.',
          expectedUserAction: 'click',
          language: 'en-IN',
        }),
      }) as Response,
    );
    const disabledClient = createReasoningClient({
      endpoint: 'https://example.test/reason',
      fetcher: disabledResponseFetcher,
    });

    await expect(
      disabledClient.reason({
        userUtterance: 'Submit karna hai',
        session: { recentActions: [] },
        page: {
          elements: [{ ...elements[0]!, disabled: true }],
        },
      }),
    ).rejects.toThrow(/Unsafe GuideAction/);
  });

  it('sanitizes optional request fields without inventing workflow context', () => {
    expect(
      sanitizeReasonRequest({
        userUtterance: 'Help',
        session: { recentActions: [] },
        page: {
          title: undefined,
          section: undefined,
          elements: [elements[0]!],
        },
      }),
    ).toEqual({
      userUtterance: 'Help',
      session: { recentActions: [] },
      page: { elements: [elements[0]] },
    });
  });

  it('redacts sensitive values from user, session, and semantic context', () => {
    const request = sanitizeReasonRequest({
      userUtterance: 'Mera UAN 100200300400 hai',
      session: {
        goal: 'Phone 9876543210 update karna hai',
        recentActions: [{ type: 'input', label: 'Account 123456789012' }],
      },
      page: {
        title: 'Member 123456789012',
        section: 'Bank 9876543210',
        elements: [
          {
            ...elements[0]!,
            label: 'Account 123456789012',
          },
        ],
      },
    });

    const serialized = JSON.stringify(request);
    expect(serialized).not.toContain('100200300400');
    expect(serialized).not.toContain('9876543210');
    expect(serialized).not.toContain('123456789012');
    expect(serialized).toContain('[redacted]');
  });
});
