import type { SemanticPageSnapshot, ValidationState } from '../dom/semantic';
import type {
  ExpectedUserAction,
  IntentReadiness,
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
    workflow?: IntentReadiness;
  };
  page: {
    title?: string;
    section?: string;
    elements: SemanticElement[];
  };
};

type WorkflowAware = {
  workflow?: IntentReadiness;
};

export type GuideAction =
  | ({
      action: 'guide';
      targetId: string;
      spokenInstruction: string;
      consequence?: string;
      expectedUserAction: ExpectedUserAction;
      language: string;
    } & WorkflowAware)
  | ({
      action: 'explain';
      targetId?: string;
      spokenInstruction: string;
      language: string;
    } & WorkflowAware)
  | ({
      action: 'scroll';
      targetId: string;
    } & WorkflowAware)
  | ({
      action: 'wait';
    } & WorkflowAware)
  | ({
      action: 'clarify';
      spokenInstruction: string;
      language: string;
    } & WorkflowAware)
  | ({
      action: 'success';
      spokenInstruction: string;
      language: string;
    } & WorkflowAware);

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
const MAX_READINESS_ITEM_LENGTH = 120;
const MAX_READINESS_ITEMS = 12;
const READINESS_STATES = new Set<IntentReadiness['readiness']>([
  'ready',
  'needs_clarification',
  'not_applicable',
]);

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

function validateReadinessItems(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new ReasoningValidationError(`${field} must be an array`);
  }
  if (value.length > MAX_READINESS_ITEMS) {
    throw new ReasoningValidationError(`${field} exceeds the maximum count`);
  }

  return value.map((item, index) =>
    requireString(item, `${field}[${index}]`, MAX_READINESS_ITEM_LENGTH),
  );
}

export function validateIntentReadiness(
  value: unknown,
  field = 'workflow',
): IntentReadiness {
  if (!isRecord(value)) {
    throw new ReasoningValidationError(`${field} must be an object`);
  }
  requireAllowedKeys(value, [
    'intent',
    'requiredInformation',
    'knownInformation',
    'missingInformation',
    'readiness',
    'clarifyingQuestion',
  ]);

  const intent =
    value.intent === null || value.intent === undefined
      ? undefined
      : requireString(value.intent, `${field}.intent`, 160);
  const requiredInformation = validateReadinessItems(
    value.requiredInformation,
    `${field}.requiredInformation`,
  );
  const knownInformation = validateReadinessItems(
    value.knownInformation,
    `${field}.knownInformation`,
  );
  const missingInformation = validateReadinessItems(
    value.missingInformation,
    `${field}.missingInformation`,
  );
  const readinessValue = requireString(
    value.readiness,
    `${field}.readiness`,
    32,
  );
  if (!READINESS_STATES.has(readinessValue as IntentReadiness['readiness'])) {
    throw new ReasoningValidationError(`${field}.readiness is not supported`);
  }
  const readiness = readinessValue as IntentReadiness['readiness'];
  const clarifyingQuestion =
    value.clarifyingQuestion === null || value.clarifyingQuestion === undefined
      ? undefined
      : requireSpokenInstruction(value.clarifyingQuestion);

  if (missingInformation.length > 0 && readiness !== 'needs_clarification') {
    throw new ReasoningValidationError(
      `${field}.readiness must be needs_clarification when information is missing`,
    );
  }
  if (readiness === 'needs_clarification') {
    if (missingInformation.length === 0) {
      throw new ReasoningValidationError(
        `${field}.missingInformation is required for clarification`,
      );
    }
    if (!clarifyingQuestion) {
      throw new ReasoningValidationError(
        `${field}.clarifyingQuestion is required for clarification`,
      );
    }
  }
  if (readiness !== 'needs_clarification' && clarifyingQuestion) {
    throw new ReasoningValidationError(
      `${field}.clarifyingQuestion is only allowed when clarification is needed`,
    );
  }

  return {
    ...(intent ? { intent } : {}),
    requiredInformation,
    knownInformation,
    missingInformation,
    readiness,
    ...(clarifyingQuestion ? { clarifyingQuestion } : {}),
  };
}

function redactWorkflowText(value: string): string {
  return redactSensitiveText(value).replace(
    /(?:₹|rs\.?|inr|\$|€|£)\s*[\d,]+(?:\.\d+)?|\b\d{5,18}\b/gi,
    '[redacted]',
  );
}

function safeIntentReadiness(workflow: IntentReadiness): IntentReadiness {
  const safeWorkflow = validateIntentReadiness(workflow);
  return {
    ...(safeWorkflow.intent
      ? { intent: redactWorkflowText(safeWorkflow.intent) }
      : {}),
    requiredInformation: safeWorkflow.requiredInformation.map(redactWorkflowText),
    knownInformation: safeWorkflow.knownInformation.map(redactWorkflowText),
    missingInformation: safeWorkflow.missingInformation.map(redactWorkflowText),
    readiness: safeWorkflow.readiness,
    ...(safeWorkflow.clarifyingQuestion
      ? { clarifyingQuestion: redactWorkflowText(safeWorkflow.clarifyingQuestion) }
      : {}),
  };
}

function enforceTargetSafety(
  action: GuideAction,
  targetMetadata?: Iterable<SafetyTarget>,
): GuideAction {
  if (
    action.action === 'guide' &&
    action.workflow &&
    (action.workflow.readiness !== 'ready' ||
      action.workflow.missingInformation.length > 0)
  ) {
    throw new ReasoningValidationError(
      'GuideAction cannot guide while intent information is missing',
    );
  }

  if (
    action.action === 'clarify' &&
    action.workflow &&
    action.workflow.readiness !== 'needs_clarification'
  ) {
    throw new ReasoningValidationError(
      'Clarify action requires a needs_clarification intent assessment',
    );
  }

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

  const workflow =
    value.workflow === undefined
      ? undefined
      : validateIntentReadiness(value.workflow, 'workflow');

  switch (action) {
    case 'guide': {
      requireAllowedKeys(value, [
        'action',
        'targetId',
        'spokenInstruction',
        'consequence',
        'expectedUserAction',
        'language',
        'workflow',
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
        ...(workflow ? { workflow } : {}),
      }, targetMetadata);
    }

    case 'explain': {
      requireAllowedKeys(value, [
        'action',
        'targetId',
        'spokenInstruction',
        'language',
        'workflow',
      ]);
      const targetId =
        value.targetId === undefined || value.targetId === null
          ? undefined
          : requireTarget(value.targetId, availableTargets);
      return enforceTargetSafety({
        action,
        ...(targetId ? { targetId } : {}),
        spokenInstruction: requireSpokenInstruction(value.spokenInstruction),
        language: requireLanguage(value.language),
        ...(workflow ? { workflow } : {}),
      }, targetMetadata);
    }

    case 'scroll':
      requireAllowedKeys(value, ['action', 'targetId', 'workflow']);
      return enforceTargetSafety({
        action,
        targetId: requireTarget(value.targetId, availableTargets),
        ...(workflow ? { workflow } : {}),
      }, targetMetadata);

    case 'wait':
      requireAllowedKeys(value, ['action', 'workflow']);
      return { action, ...(workflow ? { workflow } : {}) };

    case 'clarify':
    case 'success':
      requireAllowedKeys(value, [
        'action',
        'spokenInstruction',
        'language',
        'workflow',
      ]);
      if (
        workflow &&
        action === 'clarify' &&
        workflow.readiness !== 'needs_clarification'
      ) {
        throw new ReasoningValidationError(
          'Clarify action requires a needs_clarification intent assessment',
        );
      }
      return {
        action,
        spokenInstruction: requireSpokenInstruction(value.spokenInstruction),
        language: requireLanguage(value.language),
        ...(workflow ? { workflow } : {}),
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
      ...(request.session.workflow
        ? { workflow: safeIntentReadiness(request.session.workflow) }
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
      workflow: input.session.workflow,
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
