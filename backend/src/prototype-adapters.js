import {
  classifyConsequence,
  validateGuideAction,
} from './contracts.js';

export const DEFAULT_TRANSCRIPT = Object.freeze({
  transcript: 'Mujhe PF ka paisa nikalna hai.',
  language: 'hi-IN',
});

export const DEFAULT_TRANSCRIPTS = Object.freeze([
  DEFAULT_TRANSCRIPT,
  Object.freeze({ transcript: "I'm done.", language: 'en-IN' }),
]);

const CLICK_ROLES = new Set(['button', 'link', 'menuitem', 'tab', 'interactive']);
const EXCLUDED_FALLBACK_LABEL = /\b(?:logout|log out|sign out|delete|cancel|reset|remove)\b/i;
const SUCCESS_CONTEXT = /\b(?:success|submitted|submission complete|acknowledg(?:e)?ment|reference number|application received|request complete)\b/i;

function visibleTargets(elements) {
  return elements.filter((element) => element.visible && !element.disabled);
}

function findTarget(elements, pattern, roles) {
  return elements.find(
    (element) =>
      element.visible &&
      !element.disabled &&
      pattern.test(element.label) &&
      (!roles || roles.has(element.role)),
  );
}

function isHindi(language) {
  return /^(?:hi|hinglish)/i.test(language);
}

function instructionFor(target, expectedUserAction, language) {
  if (isHindi(language)) {
    if (expectedUserAction === 'input') {
      return `${target.label} mein apni jankari darj kariye. Kaam ho jaaye to "I'm done" kahiye.`;
    }
    if (expectedUserAction === 'select') {
      return `${target.label} mein apna option select kariye.`;
    }
    return `${target.label} par click kariye.`;
  }

  if (expectedUserAction === 'input') {
    return `Enter your information in ${target.label}. Say "I'm done" when finished.`;
  }
  if (expectedUserAction === 'select') {
    return `Select an option in ${target.label}.`;
  }
  return `Click ${target.label}.`;
}

function consequenceFor(target, language) {
  const consequenceType = classifyConsequence(target.label);
  if (!consequenceType) {
    return undefined;
  }

  if (isHindi(language)) {
    const hindiConsequences = {
      submission: 'Isse aapki request submit ho jayegi.',
      consent: 'Isse aapki sahmati record ho jayegi.',
      identity: 'Isse aapki pehchaan verify hogi.',
      'personal-data': 'Isse aapki personal information update hogi.',
      financial: 'Isse aapki financial request aage badhegi.',
      credentials: 'Isse aapka credential step continue hoga.',
    };
    return hindiConsequences[consequenceType];
  }

  const englishConsequences = {
    submission: 'This will submit your request.',
    consent: 'This will record your consent.',
    identity: 'This will verify your identity.',
    'personal-data': 'This will update your personal information.',
    financial: 'This will move your financial request forward.',
    credentials: 'This will continue the credential step.',
  };
  return englishConsequences[consequenceType];
}

function guideTarget(target, language) {
  const expectedUserAction =
    target.role === 'textbox'
      ? 'input'
      : target.role === 'combobox'
        ? 'select'
        : 'click';

  const consequence = consequenceFor(target, language);
  return validateGuideAction(
    {
      action: 'guide',
      targetId: target.id,
      spokenInstruction: instructionFor(target, expectedUserAction, language),
      ...(consequence ? { consequence } : {}),
      expectedUserAction,
      language,
    },
    [target],
  );
}

function clarify(language) {
  return {
    action: 'clarify',
    spokenInstruction: isHindi(language)
      ? 'Aap claim withdraw karna chahte hain ya claim status dekhna?'
      : 'Do you want to withdraw a claim or check its status?',
    language,
  };
}

function isWithdrawalIntent(text) {
  return /\b(?:pf|paisa|withdraw|withdrawal|claim|advance)\b|निकाल|निकासी/i.test(text);
}

function isSubmitIntent(text) {
  return /\b(?:submit|final|finalize|send|file|complete)\b|जमा|सबमिट/i.test(text);
}

function isInputCompletionIntent(text) {
  if (/\b(?:not|never|don't|do not)\b.{0,16}\b(?:done|finished|complete|ready)\b/i.test(text)) {
    return false;
  }

  return (
    /\b(?:i[' ]?m|i am|we[' ]?re|we are)?\s*(?:done|finished|complete|completed|ready)\b/i.test(text) ||
    /\b(?:i[' ]?ve|i have)\s+(?:filled|entered|typed|provided)\b/i.test(text) ||
    /\b(?:bhar|fill|enter|type)(?:\s+kar)?\s+(?:diya|di|kar diya|ho gaya)\b/i.test(text)
  );
}

function isUanQuestion(text) {
  return /\buan\b/i.test(text) &&
    /\b(?:what|kya|meaning|matlab|explain|samajh|hot[ae]?|hota)\b/i.test(text);
}

function isStatusIntent(text) {
  return /\b(?:status|track|progress)\b|स्थिति/i.test(text);
}

function hasRecentActionLabel(actions, pattern) {
  return actions.some((action) => pattern.test(action.label ?? ''));
}

function findFallbackTarget(elements, text) {
  const candidates = visibleTargets(elements).filter(
    (element) => !EXCLUDED_FALLBACK_LABEL.test(element.label),
  );
  const explicitConsequentialIntent = isWithdrawalIntent(text) || isSubmitIntent(text);
  const safeCandidates = candidates.filter(
    (element) => explicitConsequentialIntent || !classifyConsequence(element.label),
  );
  const orderedRoles = [CLICK_ROLES, new Set(['combobox']), new Set(['textbox'])];

  for (const roles of orderedRoles) {
    const target = safeCandidates.find((element) => roles.has(element.role));
    if (target) {
      return target;
    }
  }

  return undefined;
}

function successAction(language) {
  return {
    action: 'success',
    spokenInstruction: isHindi(language)
      ? 'Aapka request submit ho gaya.'
      : 'Your request has been submitted.',
    language,
  };
}

export function createPrototypeReasoner() {
  return {
    async reason(request) {
      const language = request.userLanguage || 'en-IN';
      const utterance = request.userUtterance;
      const pageText = [request.page.title, request.page.section]
        .filter(Boolean)
        .join(' ');

      const hasSuccessElement = request.page.elements.some((element) =>
        SUCCESS_CONTEXT.test(element.label),
      );
      if (SUCCESS_CONTEXT.test(pageText) || hasSuccessElement) {
        return successAction(language);
      }

      const uanTarget = findTarget(request.page.elements, /\buan\b/i);
      if (uanTarget && isUanQuestion(utterance)) {
        return validateGuideAction(
          {
            action: 'explain',
            targetId: uanTarget.id,
            spokenInstruction: isHindi(language)
              ? 'UAN aapka unique member number hota hai.'
              : 'UAN is your unique member number.',
            language,
          },
          request.page.elements,
        );
      }

      const inputCompletionIntent = isInputCompletionIntent(utterance);
      if (request.session.pendingAction?.type === 'input' && !inputCompletionIntent) {
        return { action: 'wait' };
      }

      if (isWithdrawalIntent(utterance) || inputCompletionIntent) {
        const recentOnlineServices = hasRecentActionLabel(
          request.session.recentActions,
          /\bonline services?\b/i,
        );
        const claimForm = findTarget(
          request.page.elements,
          /\bclaim\b.*\bform\b|\bform 31\b/i,
          CLICK_ROLES,
        );
        if (claimForm && recentOnlineServices) {
          return guideTarget(claimForm, language);
        }

        const continueTarget = findTarget(
          request.page.elements,
          /\bcontinue(?: to review)?\b/i,
          CLICK_ROLES,
        );
        if (continueTarget) {
          return guideTarget(continueTarget, language);
        }

        const uanInput = findTarget(
          request.page.elements,
          /\buan\b/i,
          new Set(['textbox']),
        );
        const verifyControl = request.page.elements.find(
          (element) =>
            element.visible &&
            /\bverify\b/i.test(element.label) &&
            CLICK_ROLES.has(element.role),
        );
        if (
          uanInput &&
          (uanInput.hasValue !== true ||
            uanInput.validationState === 'invalid' ||
            verifyControl?.disabled === true)
        ) {
          return guideTarget(uanInput, language);
        }

        const verifyTarget = findTarget(
          request.page.elements,
          /\bverify\b/i,
          CLICK_ROLES,
        );
        if (verifyTarget) {
          return guideTarget(verifyTarget, language);
        }

        const confirmationTarget = findTarget(
          request.page.elements,
          /\b(?:confirm|reviewed).*\bsubmit\b/i,
          new Set(['checkbox']),
        );
        if (confirmationTarget && confirmationTarget.hasValue !== true) {
          return guideTarget(confirmationTarget, language);
        }

        const onlineServices = findTarget(
          request.page.elements,
          /\bonline services?\b/i,
          CLICK_ROLES,
        );
        if (onlineServices) {
          return guideTarget(onlineServices, language);
        }

        const withdrawalTarget = findTarget(
          request.page.elements,
          /\b(?:new claim|withdraw|withdrawal|advance|pension)\b/i,
          CLICK_ROLES,
        );
        if (withdrawalTarget) {
          return guideTarget(withdrawalTarget, language);
        }
      }

      if (isSubmitIntent(utterance)) {
        const submitTarget = findTarget(
          request.page.elements,
          /\b(?:submit|finalize|send|file)\b/i,
          CLICK_ROLES,
        );
        if (submitTarget) {
          return guideTarget(submitTarget, language);
        }
      }

      if (isStatusIntent(utterance)) {
        const statusTarget = findTarget(request.page.elements, /\bstatus\b/i, CLICK_ROLES);
        if (statusTarget) {
          return guideTarget(statusTarget, language);
        }
      }

      const uanInput = findTarget(request.page.elements, /\buan\b/i, new Set(['textbox']));
      if (uanInput && /\buan\b/i.test(utterance)) {
        return guideTarget(uanInput, language);
      }

      const fallbackTarget = findFallbackTarget(request.page.elements, utterance);
      if (fallbackTarget) {
        return guideTarget(fallbackTarget, language);
      }

      return clarify(language);
    },
  };
}

export function createPrototypeTranscriber({ transcript, transcripts } = {}) {
  const sequence =
    Array.isArray(transcripts) && transcripts.length > 0
      ? transcripts
      : transcript
        ? [transcript]
        : DEFAULT_TRANSCRIPTS;
  let index = 0;

  return {
    async transcribe() {
      const result = sequence[Math.min(index, sequence.length - 1)];
      index += 1;
      return {
        transcript: result.transcript,
        ...(result.language ? { language: result.language } : {}),
      };
    },
  };
}

function createSilentWav(durationMs = 120) {
  const sampleRate = 8_000;
  const channels = 1;
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const byteRate = sampleRate * blockAlign;
  const sampleCount = Math.floor((sampleRate * durationMs) / 1_000);
  const data = Buffer.alloc(sampleCount * blockAlign);
  const wav = Buffer.alloc(44 + data.length);

  wav.write('RIFF', 0);
  wav.writeUInt32LE(36 + data.length, 4);
  wav.write('WAVE', 8);
  wav.write('fmt ', 12);
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(channels, 22);
  wav.writeUInt32LE(sampleRate, 24);
  wav.writeUInt32LE(byteRate, 28);
  wav.writeUInt16LE(blockAlign, 32);
  wav.writeUInt16LE(bitsPerSample, 34);
  wav.write('data', 36);
  wav.writeUInt32LE(data.length, 40);
  data.copy(wav, 44);

  return wav;
}

export function createPrototypeSynthesizer() {
  return {
    async synthesize() {
      return {
        audio: createSilentWav(),
        mimeType: 'audio/wav',
      };
    },
  };
}
