import assert from 'node:assert/strict';
import { after, before, describe, test } from 'node:test';

import {
  validateReasonRequest,
} from '../src/contracts.js';
import {
  createPrototypeReasoner,
  createPrototypeTranscriber,
} from '../src/prototype-adapters.js';
import { createBackendServer } from '../src/server.js';

const allowedOrigin = 'chrome-extension://prototype';

function createReasonRequest() {
  return {
    userUtterance: 'Submit the claim now.',
    userLanguage: 'hi-IN',
    session: {
      goal: 'PF withdrawal',
      recentActions: [],
    },
    page: {
      title: 'Claim Form',
      section: 'Final step',
      elements: [
        {
          id: 'el_submit',
          role: 'button',
          label: 'Submit Claim',
          visible: true,
          inViewport: true,
          disabled: false,
        },
        {
          id: 'el_uan',
          role: 'textbox',
          label: 'UAN',
          visible: true,
          inViewport: true,
          disabled: false,
        },
      ],
    },
  };
}

describe('prototype backend server', () => {
  let app;
  let baseUrl;
  let reasonCallCount;
  let transcribeCall;
  let synthesizeCall;

  before(async () => {
    reasonCallCount = 0;
    transcribeCall = undefined;
    synthesizeCall = undefined;

    app = createBackendServer({
      allowedOrigins: [allowedOrigin],
      reasoner: {
        async reason(request) {
          reasonCallCount += 1;
          assert.equal(request.userLanguage, 'hi-IN');
          return {
            action: 'guide',
            targetId: 'el_submit',
            spokenInstruction: 'Details check karke Submit Claim par click kariye.',
            consequence: 'Isse aapki request submit ho jayegi.',
            expectedUserAction: 'click',
            language: 'hi-IN',
          };
        },
      },
      transcriber: {
        async transcribe(input) {
          transcribeCall = input;
          return { transcript: 'Mujhe PF ka paisa nikalna hai.', language: 'hi-IN' };
        },
      },
      synthesizer: {
        async synthesize(input) {
          synthesizeCall = input;
          return { audio: Buffer.from([1, 2, 3]), mimeType: 'audio/test' };
        },
      },
    });

    const address = await app.listen(0);
    baseUrl = `http://${address.address}:${address.port}`;
  });

  after(async () => {
    await app.close();
  });

  test('validates and forwards a semantic reasoning request', async () => {
    const response = await fetch(`${baseUrl}/reason`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        origin: allowedOrigin,
      },
      body: JSON.stringify(createReasonRequest()),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), allowedOrigin);
    assert.deepEqual(await response.json(), {
      action: 'guide',
      targetId: 'el_submit',
      spokenInstruction: 'Details check karke Submit Claim par click kariye.',
      consequence: 'Isse aapki request submit ho jayegi.',
      expectedUserAction: 'click',
      language: 'hi-IN',
    });
    assert.equal(reasonCallCount, 1);
  });

  test('rejects raw DOM fields before invoking the reasoner', async () => {
    const request = createReasonRequest();
    request.page.elements[0].element = { tagName: 'BUTTON' };

    const response = await fetch(`${baseUrl}/reason`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error, /unexpected field: element/);
    assert.equal(reasonCallCount, 1);
  });

  test('accepts binary speech input and returns provider-neutral transcription', async () => {
    const response = await fetch(`${baseUrl}/speech/transcribe`, {
      method: 'POST',
      headers: { 'content-type': 'audio/webm' },
      body: Buffer.from([10, 20, 30]),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      transcript: 'Mujhe PF ka paisa nikalna hai.',
      language: 'hi-IN',
    });
    assert.equal(transcribeCall.contentType, 'audio/webm');
    assert.deepEqual([...transcribeCall.audio], [10, 20, 30]);
  });

  test('validates synthesis input and returns audio bytes', async () => {
    const response = await fetch(`${baseUrl}/speech/synthesize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: 'Online Services par click kariye.', language: 'hi-IN' }),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/test');
    assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
    assert.deepEqual(synthesizeCall, {
      text: 'Online Services par click kariye.',
      language: 'hi-IN',
    });
  });

  test('accepts a longer explanation for speech synthesis', async () => {
    const text =
      'These options differ by eligibility, timing, and outcome. '
        .repeat(12)
        .trim();

    const response = await fetch(`${baseUrl}/speech/synthesize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text, language: 'en-IN' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(synthesizeCall, { text, language: 'en-IN' });
  });

  test('handles preflight and unknown routes', async () => {
    const preflight = await fetch(`${baseUrl}/reason`, {
      method: 'OPTIONS',
      headers: { origin: allowedOrigin },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');

    const missing = await fetch(`${baseUrl}/missing`, { method: 'POST' });
    assert.equal(missing.status, 404);
    assert.deepEqual(await missing.json(), { error: 'Route not found.' });
  });
});

test('prototype reasoner chooses Online Services for a PF withdrawal request', async () => {
  const request = validateReasonRequest({
    userUtterance: 'Mujhe PF ka paisa nikalna hai.',
    userLanguage: 'hi-IN',
    session: { recentActions: [] },
    page: {
      title: 'Member Dashboard',
      section: 'Member Services',
      elements: [
        {
          id: 'el_online_services',
          role: 'button',
          label: 'Online Services',
          visible: true,
          inViewport: true,
          disabled: false,
        },
      ],
    },
  });

  const action = await createPrototypeReasoner().reason(request);

  assert.deepEqual(action, {
    action: 'guide',
    targetId: 'el_online_services',
    spokenInstruction: 'Online Services par click kariye.',
    expectedUserAction: 'click',
    language: 'hi-IN',
  });
});

test('prototype transcriber supplies a completion phrase on the next voice turn', async () => {
  const transcriber = createPrototypeTranscriber();

  assert.deepEqual(await transcriber.transcribe(), {
    transcript: 'Mujhe PF ka paisa nikalna hai.',
    language: 'hi-IN',
  });
  assert.deepEqual(await transcriber.transcribe(), {
    transcript: "I'm done.",
    language: 'en-IN',
  });
});

test('prototype reasoner returns to a blocked UAN instead of global navigation', async () => {
  const request = validateReasonRequest({
    userUtterance: 'Mujhe PF ka paisa nikalna hai.',
    userLanguage: 'hi-IN',
    session: { recentActions: [{ type: 'click', label: 'Online Services' }] },
    page: {
      title: 'Submit a PF claim',
      section: 'Member verification',
      elements: [
        {
          id: 'el_uan',
          role: 'textbox',
          label: 'Universal Account Number (UAN)',
          visible: true,
          inViewport: true,
          disabled: false,
          hasValue: true,
          validationState: 'valid',
        },
        {
          id: 'el_verify',
          role: 'button',
          label: 'Verify',
          visible: true,
          inViewport: true,
          disabled: true,
        },
        {
          id: 'el_online_services',
          role: 'button',
          label: 'Online Services',
          visible: true,
          inViewport: true,
          disabled: false,
        },
      ],
    },
  });

  const action = await createPrototypeReasoner().reason(request);
  assert.equal(action.action, 'guide');
  assert.equal(action.targetId, 'el_uan');
  assert.equal(action.expectedUserAction, 'input');
});

test('prototype reasoner waits for explicit input completion before advancing', async () => {
  const baseRequest = {
    userLanguage: 'en-IN',
    session: {
      pendingAction: { type: 'input', targetLabel: 'Universal Account Number (UAN)' },
      recentActions: [{ type: 'input', label: 'Universal Account Number (UAN)' }],
    },
    page: {
      title: 'Submit a PF claim',
      section: 'Member verification',
      elements: [
        {
          id: 'el_uan',
          role: 'textbox',
          label: 'Universal Account Number (UAN)',
          visible: true,
          inViewport: true,
          disabled: false,
          hasValue: true,
          validationState: 'valid',
        },
        {
          id: 'el_verify',
          role: 'button',
          label: 'Verify',
          visible: true,
          inViewport: true,
          disabled: false,
        },
      ],
    },
  };

  const waitingAction = await createPrototypeReasoner().reason(
    validateReasonRequest({
      ...baseRequest,
      userUtterance: 'I am still typing.',
    }),
  );
  assert.deepEqual(waitingAction, { action: 'wait' });

  const completedAction = await createPrototypeReasoner().reason(
    validateReasonRequest({
      ...baseRequest,
      userUtterance: "I'm done.",
    }),
  );
  assert.equal(completedAction.action, 'guide');
  assert.equal(completedAction.targetId, 'el_verify');
});

test('prototype reasoner advances through the fictional claim journey', async () => {
  const reasoner = createPrototypeReasoner();
  const utterance = 'Mujhe PF ka paisa nikalna hai.';
  const language = 'hi-IN';
  const steps = [
    {
      recentActions: [],
      elements: [
        {
          id: 'el_online_services',
          role: 'button',
          label: 'Online Services',
          visible: true,
          inViewport: true,
          disabled: false,
        },
      ],
      targetId: 'el_online_services',
      expectedUserAction: 'click',
    },
    {
      recentActions: [{ type: 'click', label: 'Online Services' }],
      elements: [
        {
          id: 'el_claim',
          role: 'menuitem',
          label: 'Claim (Form 31, 19 & 10C)',
          visible: true,
          inViewport: true,
          disabled: false,
        },
      ],
      targetId: 'el_claim',
      expectedUserAction: 'click',
    },
    {
      recentActions: [{ type: 'click', label: 'Claim (Form 31, 19 & 10C)' }],
      elements: [
        {
          id: 'el_uan',
          role: 'textbox',
          label: 'Universal Account Number (UAN)',
          visible: true,
          inViewport: true,
          disabled: false,
          hasValue: false,
        },
        {
          id: 'el_verify',
          role: 'button',
          label: 'Verify',
          visible: true,
          inViewport: true,
          disabled: true,
        },
      ],
      targetId: 'el_uan',
      expectedUserAction: 'input',
    },
    {
      recentActions: [{ type: 'input', label: 'Universal Account Number (UAN)' }],
      elements: [
        {
          id: 'el_uan',
          role: 'textbox',
          label: 'Universal Account Number (UAN)',
          visible: true,
          inViewport: true,
          disabled: false,
          hasValue: true,
        },
        {
          id: 'el_verify',
          role: 'button',
          label: 'Verify',
          visible: true,
          inViewport: true,
          disabled: false,
        },
      ],
      targetId: 'el_verify',
      expectedUserAction: 'click',
    },
    {
      recentActions: [{ type: 'click', label: 'Verify' }],
      elements: [
        {
          id: 'el_verify',
          role: 'button',
          label: 'Verify',
          visible: true,
          inViewport: true,
          disabled: false,
        },
        {
          id: 'el_continue',
          role: 'button',
          label: 'Continue to review',
          visible: true,
          inViewport: true,
          disabled: false,
        },
      ],
      targetId: 'el_continue',
      expectedUserAction: 'click',
    },
    {
      recentActions: [{ type: 'click', label: 'Continue to review' }],
      elements: [
        {
          id: 'el_online_services_review',
          role: 'button',
          label: 'Online Services',
          visible: true,
          inViewport: true,
          disabled: false,
        },
        {
          id: 'el_confirm',
          role: 'checkbox',
          label: 'I confirm that I have reviewed the details and want to submit this claim.',
          visible: true,
          inViewport: true,
          disabled: false,
          hasValue: false,
        },
      ],
      targetId: 'el_confirm',
      expectedUserAction: 'click',
    },
    {
      recentActions: [{ type: 'click', label: 'I confirm that I have reviewed the details and want to submit this claim.' }],
      elements: [
        {
          id: 'el_online_services_review',
          role: 'button',
          label: 'Online Services',
          visible: true,
          inViewport: true,
          disabled: false,
        },
        {
          id: 'el_confirm',
          role: 'checkbox',
          label: 'I confirm that I have reviewed the details and want to submit this claim.',
          visible: true,
          inViewport: true,
          disabled: false,
          hasValue: true,
        },
        {
          id: 'el_submit',
          role: 'button',
          label: 'Submit Claim',
          visible: true,
          inViewport: true,
          disabled: false,
        },
      ],
      targetId: 'el_submit',
      expectedUserAction: 'click',
    },
    {
      recentActions: [{ type: 'click', label: 'Submit Claim' }],
      elements: [
        {
          id: 'el_success',
          role: 'interactive',
          label: 'Your claim request has been submitted.',
          visible: true,
          inViewport: true,
          disabled: false,
        },
      ],
      expectedAction: 'success',
    },
  ];

  for (const step of steps) {
    const action = await reasoner.reason(
      validateReasonRequest({
        userUtterance: utterance,
        userLanguage: language,
        session: { recentActions: step.recentActions },
        page: {
          title: 'PF Seva Demo',
          section: 'Online Claim',
          elements: step.elements,
        },
      }),
    );

    assert.equal(action.action, step.expectedAction ?? 'guide');
    if (step.expectedAction === 'success') {
      assert.equal(action.language, language);
    } else {
      assert.equal(action.targetId, step.targetId);
      assert.equal(action.expectedUserAction, step.expectedUserAction);
      if (step.targetId === 'el_submit') {
        assert.match(action.consequence, /request submit/i);
      }
    }
  }
});
