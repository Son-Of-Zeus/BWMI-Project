const SEMANTIC_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'menuitem',
  'tab',
  'interactive',
]);

const VALIDATION_STATES = new Set(['valid', 'invalid', 'unknown']);
const EXPECTED_ACTIONS = new Set(['click', 'input', 'select']);
const READINESS_STATES = new Set([
  'ready',
  'needs_clarification',
  'not_applicable',
]);
const MAX_TEXT_LENGTH = 2_000;
const MAX_INSTRUCTION_LENGTH = 240;
const MAX_READINESS_ITEM_LENGTH = 120;
const MAX_READINESS_ITEMS = 12;

export class ContractValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContractValidationError';
  }
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value, field) {
  if (!isRecord(value)) {
    throw new ContractValidationError(`${field} must be an object`);
  }
  return value;
}

function requireArray(value, field) {
  if (!Array.isArray(value)) {
    throw new ContractValidationError(`${field} must be an array`);
  }
  return value;
}

function requireString(value, field, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ContractValidationError(`${field} must be a non-empty string`);
  }
  const normalized = value.trim();
  if (normalized.length > maxLength) {
    throw new ContractValidationError(`${field} exceeds its maximum length`);
  }
  return normalized;
}

function optionalString(value, field, maxLength = MAX_TEXT_LENGTH) {
  return value === undefined
    ? undefined
    : requireString(value, field, maxLength);
}

function requireBoolean(value, field) {
  if (typeof value !== 'boolean') {
    throw new ContractValidationError(`${field} must be a boolean`);
  }
  return value;
}

function validateReadinessItems(value, field) {
  const items = requireArray(value, field);
  if (items.length > MAX_READINESS_ITEMS) {
    throw new ContractValidationError(`${field} exceeds the maximum count`);
  }

  return items.map((item, index) =>
    requireString(item, `${field}[${index}]`, MAX_READINESS_ITEM_LENGTH),
  );
}

function requireAllowedKeys(value, allowedKeys, field) {
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).find((key) => !allowed.has(key));
  if (unexpected) {
    throw new ContractValidationError(`${field} contains unexpected field: ${unexpected}`);
  }
}

function validateSemanticElement(value, index) {
  const element = requireRecord(value, `page.elements[${index}]`);
  requireAllowedKeys(
    element,
    [
      'id',
      'role',
      'label',
      'section',
      'visible',
      'inViewport',
      'disabled',
      'hasValue',
      'validationState',
    ],
    `page.elements[${index}]`,
  );

  const role = requireString(element.role, `page.elements[${index}].role`, 24);
  if (!SEMANTIC_ROLES.has(role)) {
    throw new ContractValidationError(`page.elements[${index}].role is not supported`);
  }
  const validationState = optionalString(
    element.validationState,
    `page.elements[${index}].validationState`,
    12,
  );
  if (validationState !== undefined && !VALIDATION_STATES.has(validationState)) {
    throw new ContractValidationError(
      `page.elements[${index}].validationState is not supported`,
    );
  }

  return {
    id: requireString(element.id, `page.elements[${index}].id`, 80),
    role,
    label: requireString(element.label, `page.elements[${index}].label`),
    ...(element.section !== undefined
      ? { section: requireString(element.section, `page.elements[${index}].section`) }
      : {}),
    visible: requireBoolean(element.visible, `page.elements[${index}].visible`),
    inViewport: requireBoolean(
      element.inViewport,
      `page.elements[${index}].inViewport`,
    ),
    disabled: requireBoolean(element.disabled, `page.elements[${index}].disabled`),
    ...(element.hasValue !== undefined
      ? { hasValue: requireBoolean(element.hasValue, `page.elements[${index}].hasValue`) }
      : {}),
    ...(validationState !== undefined ? { validationState } : {}),
  };
}

/**
 * Validate the model's generic intent/readiness assessment.
 *
 * This metadata contains requirement names and status only. It must never be
 * used as a transport for the user's actual form values.
 */
export function validateIntentReadiness(value, field = 'workflow') {
  const workflow = requireRecord(value, field);
  requireAllowedKeys(
    workflow,
    [
      'intent',
      'requiredInformation',
      'knownInformation',
      'missingInformation',
      'readiness',
      'clarifyingQuestion',
    ],
    field,
  );

  const intent =
    workflow.intent === null || workflow.intent === undefined
      ? undefined
      : requireString(workflow.intent, `${field}.intent`, 160);
  const requiredInformation = validateReadinessItems(
    workflow.requiredInformation,
    `${field}.requiredInformation`,
  );
  const knownInformation = validateReadinessItems(
    workflow.knownInformation,
    `${field}.knownInformation`,
  );
  const missingInformation = validateReadinessItems(
    workflow.missingInformation,
    `${field}.missingInformation`,
  );
  const readiness = requireString(workflow.readiness, `${field}.readiness`, 32);
  if (!READINESS_STATES.has(readiness)) {
    throw new ContractValidationError(`${field}.readiness is not supported`);
  }
  const clarifyingQuestion =
    workflow.clarifyingQuestion === null || workflow.clarifyingQuestion === undefined
      ? undefined
      : requireInstruction(
          workflow.clarifyingQuestion,
          `${field}.clarifyingQuestion`,
        );

  if (missingInformation.length > 0 && readiness !== 'needs_clarification') {
    throw new ContractValidationError(
      `${field}.readiness must be needs_clarification when information is missing`,
    );
  }
  if (readiness === 'needs_clarification') {
    if (missingInformation.length === 0) {
      throw new ContractValidationError(
        `${field}.missingInformation is required for clarification`,
      );
    }
    if (!clarifyingQuestion) {
      throw new ContractValidationError(
        `${field}.clarifyingQuestion is required for clarification`,
      );
    }
  }
  if (readiness !== 'needs_clarification' && clarifyingQuestion) {
    throw new ContractValidationError(
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

export function validateReasonRequest(value) {
  const request = requireRecord(value, 'reason request');
  requireAllowedKeys(
    request,
    ['userUtterance', 'userLanguage', 'session', 'page'],
    'reason request',
  );

  const session = requireRecord(request.session, 'session');
  requireAllowedKeys(
    session,
    ['goal', 'recentActions', 'pendingAction', 'workflow'],
    'session',
  );
  const recentActions = requireArray(session.recentActions, 'session.recentActions');
  const normalizedActions = recentActions.slice(-8).map((action, index) => {
    const normalized = requireRecord(action, `session.recentActions[${index}]`);
    requireAllowedKeys(
      normalized,
      ['type', 'label'],
      `session.recentActions[${index}]`,
    );
    return {
      type: requireString(normalized.type, `session.recentActions[${index}].type`, 40),
      ...(normalized.label !== undefined
        ? {
            label: requireString(
              normalized.label,
              `session.recentActions[${index}].label`,
            ),
          }
        : {}),
    };
  });

  let pendingAction;
  if (session.pendingAction !== undefined) {
    const pending = requireRecord(session.pendingAction, 'session.pendingAction');
    requireAllowedKeys(pending, ['type', 'targetLabel'], 'session.pendingAction');
    const type = requireString(pending.type, 'session.pendingAction.type', 12);
    if (!EXPECTED_ACTIONS.has(type)) {
      throw new ContractValidationError('session.pendingAction.type is not supported');
    }
    pendingAction = {
      type,
      ...(pending.targetLabel !== undefined
        ? { targetLabel: requireString(pending.targetLabel, 'session.pendingAction.targetLabel') }
        : {}),
    };
  }

  const workflow =
    session.workflow === undefined
      ? undefined
      : validateIntentReadiness(session.workflow, 'session.workflow');

  const page = requireRecord(request.page, 'page');
  requireAllowedKeys(page, ['title', 'section', 'elements'], 'page');
  const elements = requireArray(page.elements, 'page.elements');
  if (elements.length > 200) {
    throw new ContractValidationError('page.elements exceeds the maximum count');
  }

  return {
    userUtterance: requireString(request.userUtterance, 'userUtterance'),
    ...(request.userLanguage !== undefined
      ? { userLanguage: requireString(request.userLanguage, 'userLanguage', 24) }
      : {}),
    session: {
      ...(session.goal !== undefined
        ? { goal: requireString(session.goal, 'session.goal') }
        : {}),
      recentActions: normalizedActions,
      ...(pendingAction ? { pendingAction } : {}),
      ...(workflow ? { workflow } : {}),
    },
    page: {
      ...(page.title !== undefined ? { title: requireString(page.title, 'page.title') } : {}),
      ...(page.section !== undefined
        ? { section: requireString(page.section, 'page.section') }
        : {}),
      elements: elements.map(validateSemanticElement),
    },
  };
}

const CONSEQUENCE_RULES = [
  ['submission', /\b(?:submit|file|send|finalize|withdrawal request|claim request)\b/i],
  ['consent', /\b(?:consent|agree|accept|authorize|approve|declaration)\b/i],
  ['identity', /\b(?:aadhaar|aadhar|otp|kyc|identity|verify|verification)\b/i],
  ['personal-data', /\b(?:change|update|edit|modify)\b.*\b(?:name|phone|mobile|address|bank|email|profile)\b/i],
  ['financial', /\b(?:withdraw|transfer|payment|payout|bank|money|paisa|claim)\b/i],
  ['credentials', /\b(?:password|passcode|pin|secret)\b/i],
];

export function classifyConsequence(label) {
  return CONSEQUENCE_RULES.find(([, pattern]) => pattern.test(label))?.[0];
}

function requireInstruction(value, field) {
  const instruction = requireString(value, field, MAX_INSTRUCTION_LENGTH);
  if (/<\/?script\b|javascript:|```|=>|\b(?:function|const|let|var)\s+\w+/i.test(instruction)) {
    throw new ContractValidationError(`${field} contains executable content`);
  }
  return instruction;
}

function targetById(elements, targetId) {
  const target = elements.find((element) => element.id === targetId);
  if (!target) {
    throw new ContractValidationError(`Unknown targetId: ${targetId}`);
  }
  return target;
}

export function validateGuideAction(value, elements) {
  const action = requireRecord(value, 'GuideAction');
  const availableElements = elements ?? [];
  const actionType = requireString(action.action, 'GuideAction.action', 16);
  const workflow =
    action.workflow === undefined
      ? undefined
      : validateIntentReadiness(action.workflow, 'GuideAction.workflow');

  const workflowFields = ['workflow'];
  const enforceGuideReadiness = () => {
    if (!workflow) {
      return;
    }
    if (
      workflow.readiness === 'needs_clarification' ||
      workflow.missingInformation.length > 0
    ) {
      throw new ContractValidationError(
        'GuideAction cannot guide while intent information is missing',
      );
    }
    if (workflow.readiness !== 'ready') {
      throw new ContractValidationError(
        'GuideAction requires a ready intent assessment',
      );
    }
  };

  if (actionType === 'guide') {
    requireAllowedKeys(
      action,
      [
        'action',
        'targetId',
        'spokenInstruction',
        'consequence',
        'expectedUserAction',
        'language',
        ...workflowFields,
      ],
      'GuideAction',
    );
    enforceGuideReadiness();
    const targetId = requireString(action.targetId, 'targetId', 80);
    const target = targetById(availableElements, targetId);
    if (target.disabled) {
      throw new ContractValidationError('GuideAction target is disabled');
    }
    const expectedUserAction = requireString(
      action.expectedUserAction,
      'expectedUserAction',
      12,
    );
    if (!EXPECTED_ACTIONS.has(expectedUserAction)) {
      throw new ContractValidationError('expectedUserAction is not supported');
    }
    const consequence =
      action.consequence === undefined
        ? undefined
        : requireInstruction(action.consequence, 'consequence');
    if (classifyConsequence(target.label) && !consequence) {
      throw new ContractValidationError(
        'Consequential guide actions require a consequence explanation',
      );
    }
    return {
      action: 'guide',
      targetId,
      spokenInstruction: requireInstruction(action.spokenInstruction, 'spokenInstruction'),
      ...(consequence ? { consequence } : {}),
      expectedUserAction,
      language: requireString(action.language, 'language', 24),
      ...(workflow ? { workflow } : {}),
    };
  }

  if (actionType === 'explain') {
    requireAllowedKeys(
      action,
      ['action', 'targetId', 'spokenInstruction', 'language', ...workflowFields],
      'GuideAction',
    );
    const targetId =
      action.targetId === undefined || action.targetId === null
        ? undefined
        : requireString(action.targetId, 'targetId', 80);
    if (targetId) {
      targetById(availableElements, targetId);
    }
    return {
      action: 'explain',
      ...(targetId ? { targetId } : {}),
      spokenInstruction: requireInstruction(action.spokenInstruction, 'spokenInstruction'),
      language: requireString(action.language, 'language', 24),
      ...(workflow ? { workflow } : {}),
    };
  }

  if (actionType === 'scroll') {
    requireAllowedKeys(action, ['action', 'targetId', ...workflowFields], 'GuideAction');
    targetById(availableElements, action.targetId);
    return {
      action: 'scroll',
      targetId: requireString(action.targetId, 'targetId', 80),
      ...(workflow ? { workflow } : {}),
    };
  }

  if (actionType === 'wait') {
    requireAllowedKeys(action, ['action', ...workflowFields], 'GuideAction');
    return { action: 'wait', ...(workflow ? { workflow } : {}) };
  }

  if (actionType === 'clarify' || actionType === 'success') {
    requireAllowedKeys(
      action,
      ['action', 'spokenInstruction', 'language', ...workflowFields],
      'GuideAction',
    );
    if (
      workflow &&
      actionType === 'clarify' &&
      workflow.readiness !== 'needs_clarification'
    ) {
      throw new ContractValidationError(
        'Clarify action requires a needs_clarification intent assessment',
      );
    }
    return {
      action: actionType,
      spokenInstruction: requireInstruction(action.spokenInstruction, 'spokenInstruction'),
      language: requireString(action.language, 'language', 24),
      ...(workflow ? { workflow } : {}),
    };
  }

  throw new ContractValidationError(`Unknown GuideAction: ${actionType}`);
}

export function validateSpeechResult(value) {
  const result = requireRecord(value, 'speech result');
  requireAllowedKeys(result, ['transcript', 'language'], 'speech result');
  return {
    transcript: requireString(result.transcript, 'transcript'),
    ...(result.language !== undefined
      ? { language: requireString(result.language, 'language', 24) }
      : {}),
  };
}

export function validateSynthesisInput(value) {
  const input = requireRecord(value, 'speech synthesis input');
  requireAllowedKeys(input, ['text', 'language'], 'speech synthesis input');
  return {
    text: requireString(input.text, 'text', MAX_INSTRUCTION_LENGTH),
    ...(input.language !== undefined
      ? { language: requireString(input.language, 'language', 24) }
      : {}),
  };
}

export const MAX_REASON_BODY_BYTES = 64 * 1024;
export const MAX_SPEECH_JSON_BYTES = 16 * 1024;
export const MAX_AUDIO_BYTES = 8 * 1024 * 1024;
