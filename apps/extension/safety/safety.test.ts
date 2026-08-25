import { describe, expect, it } from 'vitest';
import {
  classifyConsequence,
  evaluateGuideActionSafety,
  isSensitiveLabel,
  redactSensitiveText,
} from './safety';

describe('safety policy', () => {
  it('redacts sensitive values while retaining useful field language', () => {
    const source =
      'UAN is 100200300400, OTP: 123456, phone 98765 43210, email user@example.com, Password: secret123.';
    const redacted = redactSensitiveText(source);

    expect(redacted).toContain('UAN');
    expect(redacted).toContain('OTP');
    expect(redacted).not.toContain('100200300400');
    expect(redacted).not.toContain('123456');
    expect(redacted).not.toContain('98765 43210');
    expect(redacted).not.toContain('user@example.com');
    expect(redacted).not.toContain('secret123');
    expect(isSensitiveLabel('Universal Account Number (UAN)')).toBe(true);
    expect(isSensitiveLabel('Online Services')).toBe(false);
  });

  it('classifies consequential targets without blocking user-guided action', () => {
    expect(classifyConsequence('Submit Claim')).toBe('submission');
    expect(classifyConsequence('Change Bank Account')).toBe('personal-data');
    expect(classifyConsequence('Online Services')).toBeUndefined();

    const decision = evaluateGuideActionSafety(
      {
        action: 'guide',
        targetId: 'el_submit',
        spokenInstruction: 'Submit Claim par khud click kariye.',
        expectedUserAction: 'click',
        language: 'hi-IN',
      },
      [
        {
          id: 'el_submit',
          role: 'button',
          label: 'Submit Claim',
          disabled: false,
        },
      ],
    );

    expect(decision).toEqual({
      allowed: true,
      requiresExplicitUserAction: true,
      consequence: 'submission',
    });
  });

  it('blocks disabled or missing targets before guidance can be offered', () => {
    const action = {
      action: 'guide' as const,
      targetId: 'el_1',
      spokenInstruction: 'Click kariye.',
      expectedUserAction: 'click' as const,
      language: 'hi-IN',
    };

    expect(
      evaluateGuideActionSafety(action, [
        { id: 'el_1', role: 'button', label: 'Submit', disabled: true },
      ]),
    ).toMatchObject({ allowed: false, code: 'disabled-target' });
    expect(evaluateGuideActionSafety(action, [])).toMatchObject({
      allowed: false,
      code: 'missing-target',
    });
  });
});
