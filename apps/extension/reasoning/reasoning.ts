import type { SemanticPageSnapshot, ValidationState } from '../dom/semantic';
import type {
  ExpectedUserAction,
  SessionState,
} from '../session/session-state';
import type { SemanticElement } from '../registry/element-registry';
import {
  evaluateGuideActionSafety,
  redactSensitiveText,
  type SafetyTarget,
} from '../safety/safety';

export type ReasonRequest = {
  userUtterance: string;
  userLanguage?: string;
  session: {
    goal?: string;
    recentActions: Array<{
      type: string;
      label?: string;
    }>;
    pendingAction?: {
      type: ExpectedUserAction;
      targetLabel?: string;
    };
  };
  page: {
    title?: string;
    section?: string;
    elements: SemanticElement[];
  };
};

export type GuideAction =
  | {
      action: 'guide';
      targetId: string;
      spokenInstruction: string;
      consequence?: string;
      expectedUserAction: ExpectedUserAction;
      language: string;
    }
  | {
      action: 'explain';
      targetId: string;
      spokenInstruction: string;
      language: string;
    }
  | {
      action: 'scroll';
      targetId: string;
    }
  | {
      action: 'wait';
    }
  | {
      action: 'clarify';
      spokenInstruction: string;
      language: string;
    }
  | {
      action: 'success';
      spokenInstruction: string;
      language: string;
    };

export type Reasoner = {
  reason(request: ReasonRequest): Promise<GuideAction>;
};

export type ReasoningClientOptions = {
  endpoint: string;
  fetcher?: typeof fetch;
};

export type ReasoningPage = Omit<SemanticPageSnapshot, 'elements'> & {
  elements: SemanticElement[];
};

export class ReasoningValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReasoningValidationError';
  }
}

export class ReasoningRequestError extends Error {
  readonly status?: number;

  constructor(message: string, status?: number) {
    super(message);
    this.name = 'ReasoningRequestError';
    this.status = status;
  }
}

const EXECUTABLE_TEXT_PATTERN = /<\/?script\b|javascript:|```|=>|\b(?:function|const|let|var)\s+\w+/i;
const MAX_SPOKEN_INSTRUCTION_LENGTH = 240;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireString(
  value: unknown,
  field: string,
  maxLength = 2000,
): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ReasoningValidationError(`${field} must be a non-empty string`);
  }

  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ReasoningValidationError(`${field} exceeds its maximum length`);
  }

  return normalized;
}

function requireAllowedKeys(
  value: Record<string, unknown>,
  allowedKeys: string[],
): void {
  const allowed = new Set(allowedKeys);
  const unexpectedKey = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpectedKey) {
    throw new ReasoningValidationError(
      `Unexpected GuideAction field: ${unexpectedKey}`,
    );
  }
}

function requireTarget(
  value: unknown,
  availableTargets: Set<string>,
): string {
  const targetId = requireString(value, 'targetId', 80);
  if (!availableTargets.has(targetId)) {
    throw new ReasoningValidationError(`Unknown targetId: ${targetId}`);
  }
  return targetId;
}

function requireSpokenInstruction(value: unknown): string {
  const instruction = requireString(
    value,
    'spokenInstruction',
    MAX_SPOKEN_INSTRUCTION_LENGTH,
  );
  if (EXECUTABLE_TEXT_PATTERN.test(instruction)) {
    throw new ReasoningValidationError(
      'spokenInstruction contains executable content',
    );
  }
  return instruction;
}

function requireLanguage(value: unknown): string {
  return requireString(value, 'language', 24);
}

function enforceTargetSafety(
  action: GuideAction,
  targetMetadata?: Iterable<SafetyTarget>,
): GuideAction {
  if (!targetMetadata) {
    return action;
  }

  const decision = evaluateGuideActionSafety(action, targetMetadata);
  if (!decision.allowed) {
    throw new ReasoningValidationError(`Unsafe GuideAction: ${decision.reason}`);
  }

  if (action.action === 'guide' && decision.consequence && !action.consequence) {
    throw new ReasoningValidationError(
      'Consequential guide actions require a consequence explanation',
    );
  }

  return action;
}

export function validateGuideAction(
  value: unknown,
  availableTargetIds: Iterable<string>,
  targetMetadata?: Iterable<SafetyTarget>,
): GuideAction {
  if (!isRecord(value)) {
    throw new ReasoningValidationError('GuideAction must be an object');
  }

  const availableTargets = new Set(availableTargetIds);
  const action = value.action;
  if (typeof action !== 'string') {
    throw new ReasoningValidationError('GuideAction.action is required');
  }

  switch (action) {
    case 'guide': {
      requireAllowedKeys(value, [
        'action',
        'targetId',
        'spokenInstruction',
        'consequence',
        'expectedUserAction',
        'language',
      ]);
      const expectedUserAction = value.expectedUserAction;
      if (
        expectedUserAction !== 'click' &&
        expectedUserAction !== 'input' &&
        expectedUserAction !== 'select'
      ) {
        throw new ReasoningValidationError(
          'expectedUserAction must be click, input, or select',
        );
      }
      const consequence =
        value.consequence === undefined
          ? undefined
          : requireSpokenInstruction(value.consequence);
      return enforceTargetSafety({
        action,
        targetId: requireTarget(value.targetId, availableTargets),
        spokenInstruction: requireSpokenInstruction(value.spokenInstruction),
        ...(consequence ? { consequence } : {}),
        expectedUserAction,
        language: requireLanguage(value.language),
      }, targetMetadata);
    }

    case 'explain':
      requireAllowedKeys(value, [
        'action',
        'targetId',
        'spokenInstruction',
        'language',
      ]);
      return enforceTargetSafety({
        action,
        targetId: requireTarget(value.targetId, availableTargets),
        spokenInstruction: requireSpokenInstruction(value.spokenInstruction),
        language: requireLanguage(value.language),
      }, targetMetadata);

    case 'scroll':
      requireAllowedKeys(value, ['action', 'targetId']);
      return enforceTargetSafety({
        action,
        targetId: requireTarget(value.targetId, availableTargets),
      }, targetMetadata);

    case 'wait':
      requireAllowedKeys(value, ['action']);
      return { action };

    case 'clarify':
    case 'success':
      requireAllowedKeys(value, ['action', 'spokenInstruction', 'language']);
      return {
        action,
        spokenInstruction: requireSpokenInstruction(value.spokenInstruction),
        language: requireLanguage(value.language),
      };

    default:
      throw new ReasoningValidationError(`Unknown GuideAction: ${action}`);
  }
}

export function parseGuideActionJson(
  raw: string,
  availableTargetIds: Iterable<string>,
  targetMetadata?: Iterable<SafetyTarget>,
): GuideAction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ReasoningValidationError('Reasoning response is not valid JSON');
  }

  return validateGuideAction(parsed, availableTargetIds, targetMetadata);
}

function safeSemanticElement(element: SemanticElement): SemanticElement {
  const safeElement: SemanticElement = {
    id: element.id,
    role: element.role,
    label: redactSensitiveText(element.label),
    visible: element.visible,
    inViewport: element.inViewport,
    disabled: element.disabled,
  };

  if (element.section !== undefined) {
    safeElement.section = redactSensitiveText(element.section);
  }
  if (element.hasValue !== undefined) {
    safeElement.hasValue = element.hasValue;
  }
  if (element.validationState !== undefined) {
    safeElement.validationState = element.validationState as ValidationState;
  }

  return safeElement;
}

export function sanitizeReasonRequest(request: ReasonRequest): ReasonRequest {
  const safeRequest: ReasonRequest = {
    userUtterance: redactSensitiveText(
      requireString(request.userUtterance, 'userUtterance'),
    ),
    ...(request.userLanguage !== undefined
      ? {
          userLanguage: requireString(request.userLanguage, 'userLanguage', 24),
        }
      : {}),
    session: {
      recentActions: request.session.recentActions.map((action) => ({
        type: requireString(action.type, 'session.recentActions.type', 40),
        ...(action.label
          ? {
              label: redactSensitiveText(
                requireString(action.label, 'session.recentActions.label'),
              ),
            }
          : {}),
      })),
      ...(request.session.goal
        ? {
            goal: redactSensitiveText(
              requireString(request.session.goal, 'session.goal'),
            ),
          }
        : {}),
      ...(request.session.pendingAction
        ? {
            pendingAction: {
              type: request.session.pendingAction.type,
              ...(request.session.pendingAction.targetLabel
                ? {
                    targetLabel: requireString(
                      redactSensitiveText(
                        request.session.pendingAction.targetLabel,
                      ),
                      'session.pendingAction.targetLabel',
                    ),
                  }
                : {}),
            },
          }
        : {}),
    },
    page: {
      elements: request.page.elements.map(safeSemanticElement),
      ...(request.page.title
        ? {
            title: redactSensitiveText(
              requireString(request.page.title, 'page.title'),
            ),
          }
        : {}),
      ...(request.page.section
        ? {
            section: redactSensitiveText(
              requireString(request.page.section, 'page.section'),
            ),
          }
        : {}),
    },
  };

  return safeRequest;
}

export function buildReasonRequest(input: {
  userUtterance: string;
  language?: string;
  session: SessionState;
  page: ReasoningPage;
}): ReasonRequest {
  const pendingAction = input.session.pendingAction;
  const pendingTarget = pendingAction
    ? input.page.elements.find(
        (element) => element.id === pendingAction.targetId,
      )
    : undefined;

  return sanitizeReasonRequest({
    userUtterance: input.userUtterance,
    userLanguage: input.language,
    session: {
      goal: input.session.goal,
      recentActions: input.session.recentActions.map(({ type, label }) => ({
        type,
        label,
      })),
      pendingAction: pendingAction
        ? {
            type: pendingAction.expectedUserAction,
            targetLabel: pendingTarget?.label,
          }
        : undefined,
    },
    page: {
      title: input.page.page.title,
      section: input.page.page.section,
      elements: input.page.elements,
    },
  });
}

export function createReasoningClient(
  options: ReasoningClientOptions,
): Reasoner {
  const fetcher = options.fetcher ?? fetch;

  return {
    async reason(request) {
      const safeRequest = sanitizeReasonRequest(request);
      let response: Response;
      try {
        response = await fetcher(options.endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(safeRequest),
        });
      } catch (error) {
        throw new ReasoningRequestError(
          `Reasoning request failed: ${error instanceof Error ? error.message : 'unknown error'}`,
        );
      }

      if (!response.ok) {
        throw new ReasoningRequestError(
          `Reasoning endpoint returned HTTP ${response.status}`,
          response.status,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new ReasoningRequestError(
          'Reasoning endpoint returned invalid JSON',
          response.status,
        );
      }

      return validateGuideAction(
        payload,
        safeRequest.page.elements.map((element) => element.id),
        safeRequest.page.elements,
      );
    },
  };
}
