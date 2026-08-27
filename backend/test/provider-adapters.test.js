import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateReasonRequest } from '../src/contracts.js';
import { createGroqReasoner } from '../src/groq-adapter.js';
import {
  createSarvamSynthesizer,
  createSarvamTranscriber,
} from '../src/sarvam-adapters.js';

function createReasonRequest(elements = [
  {
    id: 'el_online',
    role: 'button',
    label: 'Online Services',
    visible: true,
    inViewport: true,
    disabled: false,
  },
]) {
  return validateReasonRequest({
    userUtterance: 'Mujhe PF ka paisa nikalna hai.',
    userLanguage: 'hi-IN',
    session: { recentActions: [] },
    page: {
      title: 'Member Dashboard',
      section: 'Member Services',
      elements,
    },
  });
}

const READY_WORKFLOW = {
  intent: 'the requested task',
  requiredInformation: [],
  knownInformation: [],
  missingInformation: [],
  readiness: 'ready',
  clarifyingQuestion: null,
};

test('Groq adapter sends a direct JSON reasoning request', async () => {
  let captured;
  const events = [];
  const reasoner = createGroqReasoner({
    baseUrl: 'https://api.groq.test/openai/v1',
    model: 'openai/gpt-oss-120b',
    apiKey: 'test-groq-key',
    logger: (...args) => events.push(['log', args]),
    fetcher: async (url, init) => {
      events.push(['fetch']);
      captured = { url, init };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                finish_reason: 'stop',
                message: {
                  content: JSON.stringify({
                    action: 'guide',
                    targetId: 'el_online',
                    spokenInstruction: 'Online Services par click kariye.',
                    expectedUserAction: 'click',
                    language: 'hi-IN',
                    workflow: READY_WORKFLOW,
                  }),
                },
              },
            ],
            usage: {
              prompt_tokens: 100,
              completion_tokens: 20,
              total_tokens: 120,
              prompt_tokens_details: { cached_tokens: 80 },
            },
          };
        },
      };
    },
  });

  await assert.doesNotReject(() => reasoner.reason(createReasonRequest()));
  assert.equal(events[0][0], 'log');
  assert.equal(events[0][1][0], '[Groq call]');
  assert.match(events[0][1][1].operationId, /^groq-\d+$/);
  assert.equal(events[0][1][1].consequenceTargetCount, 0);
  assert.deepEqual(events[1], ['fetch']);
  const responseLog = events.find(
    ([event, args]) => event === 'log' && args[0] === '[Groq response]',
  );
  assert.equal(responseLog[1][1].promptTokens, 100);
  assert.equal(responseLog[1][1].cachedPromptTokens, 80);
  assert.equal(responseLog[1][1].promptCacheHit, true);
  assert.equal(
    captured.url,
    'https://api.groq.test/openai/v1/chat/completions',
  );
  assert.equal(captured.init.headers.authorization, 'Bearer test-groq-key');

  const payload = JSON.parse(captured.init.body);
  assert.equal(payload.model, 'openai/gpt-oss-120b');
  assert.equal(payload.temperature, 0);
  assert.equal(payload.response_format.type, 'json_schema');
  assert.equal(payload.response_format.json_schema.name, 'guide_action');
  assert.equal(payload.response_format.json_schema.strict, true);
  assert.deepEqual(
    payload.response_format.json_schema.schema.required,
    [
      'action',
      'targetId',
      'spokenInstruction',
      'consequence',
      'expectedUserAction',
      'language',
      'workflow',
    ],
  );
  assert.deepEqual(
    payload.response_format.json_schema.schema.properties.workflow.required,
    [
      'intent',
      'requiredInformation',
      'knownInformation',
      'missingInformation',
      'readiness',
      'clarifyingQuestion',
    ],
  );
  assert.equal(
    payload.response_format.json_schema.schema.additionalProperties,
    false,
  );
  assert.equal(payload.messages[0].role, 'system');
  assert.match(payload.messages[0].content, /consequence is a hard safety requirement/);
  assert.match(payload.messages[0].content, /workflow\.readiness/);
  assert.match(payload.messages[0].content, /missingInformation/);
  assert.match(payload.messages[0].content, /browser default/);
  assert.equal(payload.messages[1].role, 'user');
  assert.match(payload.messages[1].content, /Online Services/);
  assert.match(payload.messages[1].content, /consequenceRequired/);
});

test('Groq adapter coalesces concurrent and immediate duplicate requests', async () => {
  const events = [];
  let fetchCount = 0;
  let releaseResponse;
  const responsePromise = new Promise((resolve) => {
    releaseResponse = resolve;
  });
  const reasoner = createGroqReasoner({
    baseUrl: 'https://api.groq.test/openai/v1',
    model: 'openai/gpt-oss-120b',
    apiKey: 'test-groq-key',
    logger: (...args) => events.push(args),
    fetcher: async () => {
      fetchCount += 1;
      return responsePromise;
    },
  });

  const request = createReasonRequest();
  const first = reasoner.reason(request);
  const second = reasoner.reason(request);
  releaseResponse({
    ok: true,
    status: 200,
    async json() {
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                action: 'guide',
                targetId: 'el_online',
                spokenInstruction: 'Online Services par click kariye.',
                expectedUserAction: 'click',
                language: 'hi-IN',
                workflow: READY_WORKFLOW,
              }),
            },
          },
        ],
      };
    },
  });

  const [firstResult, secondResult] = await Promise.all([first, second]);
  assert.deepEqual(firstResult, secondResult);
  assert.equal(fetchCount, 1);
  assert.equal(events.filter(([event]) => event === '[Groq call]').length, 1);
  const inFlightDedupe = events.find(
    ([event, details]) =>
      event === '[Groq dedupe]' && details.reason === 'in-flight',
  );
  assert.ok(inFlightDedupe);
  assert.match(inFlightDedupe[1].requestSignature, /^[a-f0-9]{16}$/);

  const thirdResult = await reasoner.reason(request);
  assert.deepEqual(thirdResult, firstResult);
  assert.equal(fetchCount, 1);
  assert.equal(
    events.filter(
      ([event, details]) =>
        event === '[Groq dedupe]' && details.reason === 'recent-response',
    ).length,
    1,
  );
});

test('Groq diagnostics identify a missing consequential explanation without logging text', async () => {
  const events = [];
  let callCount = 0;
  const reasoner = createGroqReasoner({
    baseUrl: 'https://api.groq.test/openai/v1',
    model: 'openai/gpt-oss-120b',
    apiKey: 'test-groq-key',
    logger: (...args) => events.push(args),
    fetcher: async () => {
      callCount += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    action: 'guide',
                    targetId: 'el_submit',
                    spokenInstruction: 'Details sahi hain to Submit Claim par click kariye.',
                    expectedUserAction: 'click',
                    language: 'hi-IN',
                    workflow: READY_WORKFLOW,
                  }),
                },
              },
            ],
          };
        },
      };
    },
  });

  await assert.rejects(
    () => reasoner.reason(createReasonRequest([
      {
        id: 'el_submit',
        role: 'button',
        label: 'Submit Claim',
        visible: true,
        inViewport: true,
        disabled: false,
      },
    ])),
    /consequence explanation/,
  );

  assert.equal(callCount, 1);
  const errorEvent = events.find(([event]) => event === '[Groq error]');
  assert.ok(errorEvent);
  assert.equal(errorEvent[2].stage, 'validate');
  assert.equal(errorEvent[2].action, 'guide');
  assert.equal(errorEvent[2].targetId, 'el_submit');
  assert.equal(errorEvent[2].targetConsequenceType, 'submission');
  assert.equal(errorEvent[2].consequenceRequired, true);
  assert.equal(errorEvent[2].consequencePresent, false);
  assert.doesNotMatch(JSON.stringify(errorEvent), /Details sahi/);
});

test('Groq adapter converts a guide that is not workflow-ready into clarification', async () => {
  const events = [];
  const reasoner = createGroqReasoner({
    baseUrl: 'https://api.groq.test/openai/v1',
    model: 'openai/gpt-oss-120b',
    apiKey: 'test-groq-key',
    logger: (...args) => events.push(args),
    fetcher: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: 'guide',
                  targetId: 'el_submit',
                  spokenInstruction: 'Click Submit.',
                  consequence: 'This will submit the request.',
                  expectedUserAction: 'click',
                  language: 'en-IN',
                  workflow: {
                    intent: 'complete the request',
                    requiredInformation: ['request details'],
                    knownInformation: [],
                    missingInformation: ['request details'],
                    readiness: 'needs_clarification',
                    clarifyingQuestion: 'What details should I use for this request?',
                  },
                }),
              },
            },
          ],
        };
      },
    }),
  });

  const result = await reasoner.reason(createReasonRequest([
    {
      id: 'el_submit',
      role: 'button',
      label: 'Submit Request',
      visible: true,
      inViewport: true,
      disabled: false,
    },
  ]));

  assert.deepEqual(result, {
    action: 'clarify',
    spokenInstruction: 'What details should I use for this request?',
    language: 'en-IN',
    workflow: {
      intent: 'complete the request',
      requiredInformation: ['request details'],
      knownInformation: [],
      missingInformation: ['request details'],
      readiness: 'needs_clarification',
      clarifyingQuestion: 'What details should I use for this request?',
    },
  });

  const responseEvent = events.find(([event]) => event === '[Groq response]');
  assert.ok(responseEvent);
  assert.equal(responseEvent[1].workflowReadiness, 'needs_clarification');
  assert.equal(responseEvent[1].missingInformationCount, 1);
  assert.doesNotMatch(JSON.stringify(responseEvent), /What details should/);
});

test('Groq adapter retries transient transport failures', async () => {
  const delays = [];
  const events = [];
  let callCount = 0;
  const reasoner = createGroqReasoner({
    baseUrl: 'https://api.groq.test/openai/v1',
    model: 'openai/gpt-oss-120b',
    apiKey: 'test-groq-key',
    retryDelayMs: 1,
    sleep: async (delayMs) => delays.push(delayMs),
    logger: (...args) => events.push(args),
    fetcher: async () => {
      callCount += 1;
      if (callCount === 1) {
        const error = new Error('read ECONNRESET');
        error.code = 'ECONNRESET';
        throw error;
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    action: 'guide',
                    targetId: 'el_online',
                    spokenInstruction: 'Online Services par click kariye.',
                    expectedUserAction: 'click',
                    language: 'hi-IN',
                    workflow: READY_WORKFLOW,
                  }),
                },
              },
            ],
          };
        },
      };
    },
  });

  await assert.doesNotReject(() => reasoner.reason(createReasonRequest()));
  assert.equal(callCount, 2);
  assert.deepEqual(delays, [1]);
  assert.equal(events[0][0], '[Groq call]');
  assert.equal(events[1][0], '[Groq retry]');
  assert.match(events[1][1].operationId, /^groq-\d+$/);
  assert.equal(events[1][1].service, 'Groq reasoning');
  assert.equal(events[1][1].attempt, 2);
  assert.equal(events[1][1].delayMs, 1);
});

test('Groq adapter honors the provider Retry-After header', async () => {
  const delays = [];
  const events = [];
  let callCount = 0;
  const reasoner = createGroqReasoner({
    baseUrl: 'https://api.groq.test/openai/v1',
    model: 'openai/gpt-oss-120b',
    apiKey: 'test-groq-key',
    retryDelayMs: 1,
    sleep: async (delayMs) => delays.push(delayMs),
    logger: (...args) => events.push(args),
    fetcher: async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: () => '7' },
          async json() {
            return { error: { code: 'rate_limit_exceeded' } };
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    action: 'guide',
                    targetId: 'el_online',
                    spokenInstruction: 'Online Services par click kariye.',
                    expectedUserAction: 'click',
                    language: 'hi-IN',
                    workflow: READY_WORKFLOW,
                  }),
                },
              },
            ],
          };
        },
      };
    },
  });

  await assert.doesNotReject(() => reasoner.reason(createReasonRequest()));
  assert.equal(callCount, 2);
  assert.deepEqual(delays, [7_000]);
  const retryEvent = events.find(([event]) => event === '[Groq retry]');
  assert.equal(retryEvent[1].status, 429);
  assert.equal(retryEvent[1].delayMs, 7_000);
});

test('Groq adapter logs an upstream status without logging request context', async () => {
  const events = [];
  const reasoner = createGroqReasoner({
    baseUrl: 'https://api.groq.test/openai/v1',
    model: 'openai/gpt-oss-120b',
    apiKey: 'test-groq-key',
    logger: (...args) => events.push(args),
    fetcher: async () => ({ ok: false, status: 404 }),
  });

  await assert.rejects(
    () => reasoner.reason(createReasonRequest()),
    /HTTP 404/,
  );
  assert.equal(events[0][0], '[Groq call]');
  assert.equal(events[1][0], '[Groq error]');
  assert.equal(events[1][1], 'Groq request failed with HTTP 404.');
  assert.equal(events[1][2].stage, 'request');
  assert.equal(events[1][2].errorType, 'GroqHttpError');
  assert.equal(events[1][2].responseType, 'undefined');
  assert.doesNotMatch(JSON.stringify(events), /test-groq-key|Online Services/);
});

test('Groq adapter derives the user action from the validated target role', async () => {
  const reasoner = createGroqReasoner({
    baseUrl: 'https://api.groq.test/openai/v1',
    apiKey: 'test-groq-key',
    logger: () => undefined,
    fetcher: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [
            {
              message: {
                content: JSON.stringify({
                  action: 'guide',
                  targetId: 'el_online',
                  spokenInstruction: 'Click Online Services.',
                  expectedUserAction: 'Click the Online Services button.',
                  language: 'en-IN',
                  workflow: READY_WORKFLOW,
                }),
              },
            },
          ],
        };
      },
    }),
  });

  await assert.doesNotReject(async () => {
    const result = await reasoner.reason(createReasonRequest());
    assert.equal(result.expectedUserAction, 'click');
  });
});

test('Groq adapter fails clearly when the provider key is absent', async () => {
  const reasoner = createGroqReasoner({
    baseUrl: 'https://api.groq.test/openai/v1',
    fetcher: async () => {
      throw new Error('fetch should not run');
    },
  });

  await assert.rejects(
    () => reasoner.reason(createReasonRequest()),
    /GROQ_API_KEY/,
  );
});

test('Groq adapter rejects non-JSON model content', async () => {
  const reasoner = createGroqReasoner({
    baseUrl: 'https://api.groq.test/openai/v1',
    apiKey: 'test-groq-key',
    logger: () => undefined,
    fetcher: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          choices: [{ message: { content: 'not-json' } }],
        };
      },
    }),
  });

  await assert.rejects(
    () => reasoner.reason(createReasonRequest()),
    /valid JSON/,
  );
});

test('Sarvam STT adapter sends multipart audio and maps the provider result', async () => {
  let captured;
  const transcriber = createSarvamTranscriber({
    baseUrl: 'https://sarvam.test',
    apiKey: 'test-key',
    fetcher: async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            transcript: 'Mujhe PF ka paisa nikalna hai.',
            language_code: 'hi-IN',
          };
        },
      };
    },
  });

  const result = await transcriber.transcribe({
    audio: Buffer.from([1, 2, 3]),
    contentType: 'audio/webm;codecs=opus',
  });

  assert.deepEqual(result, {
    transcript: 'Mujhe PF ka paisa nikalna hai.',
    language: 'hi-IN',
  });
  assert.equal(captured.url, 'https://sarvam.test/speech-to-text');
  assert.equal(captured.init.headers['api-subscription-key'], 'test-key');
  assert.equal(captured.init.body.get('model'), 'saaras:v3');
  assert.equal(captured.init.body.get('mode'), 'transcribe');
  assert.equal(captured.init.body.get('file').type, 'audio/webm');
  assert.deepEqual(
    [...new Uint8Array(await captured.init.body.get('file').arrayBuffer())],
    [1, 2, 3],
  );
});

test('Sarvam STT adapter logs the provider response only when enabled', async () => {
  const events = [];
  const transcriber = createSarvamTranscriber({
    baseUrl: 'https://sarvam.test',
    apiKey: 'test-key',
    logResponses: true,
    logger: (...args) => events.push(args),
    fetcher: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          request_id: 'request-123',
          transcript: 'Test transcript',
          language_code: 'en-IN',
        };
      },
    }),
  });

  await transcriber.transcribe({
    audio: Buffer.from([1, 2, 3]),
    contentType: 'audio/webm',
  });

  assert.equal(events.length, 1);
  assert.equal(events[0][0], '[Sarvam response]');
  assert.match(events[0][1].operationId, /^sarvam-stt-\d+$/);
  assert.equal(events[0][1].service, 'Sarvam speech-to-text');
  assert.equal(events[0][1].status, 200);
  assert.equal(events[0][1].ok, true);
  assert.deepEqual(events[0][1].body, {
    request_id: 'request-123',
    transcript: 'Test transcript',
    language_code: 'en-IN',
  });
  assert.doesNotMatch(JSON.stringify(events), /test-key|audio/);
});

test('Sarvam TTS adapter maps base64 WAV audio to a provider-neutral result', async () => {
  let captured;
  const events = [];
  const audio = Buffer.from([82, 73, 70, 70]);
  const synthesizer = createSarvamSynthesizer({
    baseUrl: 'https://sarvam.test',
    apiKey: 'test-key',
    logResponses: true,
    logger: (...args) => events.push(args),
    fetcher: async (url, init) => {
      captured = { url, init };
      return {
        ok: true,
        status: 200,
        async json() {
          return { audios: [audio.toString('base64')] };
        },
      };
    },
  });

  const result = await synthesizer.synthesize({
    text: 'Online Services par click kariye.',
    language: 'hi-IN',
  });

  assert.deepEqual([...result.audio], [...audio]);
  assert.equal(result.mimeType, 'audio/wav');
  assert.equal(captured.url, 'https://sarvam.test/text-to-speech');
  assert.equal(captured.init.headers['api-subscription-key'], 'test-key');
  assert.deepEqual(JSON.parse(captured.init.body), {
    text: 'Online Services par click kariye.',
    language_code: 'hi-IN',
    model: 'bulbul:v3',
    speaker: 'shubh',
  });
  assert.equal(events.length, 1);
  assert.equal(events[0][0], '[Sarvam response]');
  assert.match(events[0][1].operationId, /^sarvam-tts-\d+$/);
  assert.equal(events[0][1].service, 'Sarvam text-to-speech');
  assert.equal(events[0][1].status, 200);
  assert.equal(events[0][1].ok, true);
  assert.deepEqual(events[0][1].body, {
    audios: ['<base64 audio: 8 characters>'],
  });
});

test('Sarvam adapters retry transient failures and honor Retry-After', async () => {
  const delays = [];
  const events = [];
  let callCount = 0;
  const synthesizer = createSarvamSynthesizer({
    baseUrl: 'https://sarvam.test',
    apiKey: 'test-key',
    sleep: async (delayMs) => delays.push(delayMs),
    logger: (...args) => events.push(args),
    fetcher: async () => {
      callCount += 1;
      if (callCount === 1) {
        return {
          ok: false,
          status: 429,
          headers: { get: (name) => name === 'retry-after' ? '7' : null },
          async json() {
            return { error: 'rate limited' };
          },
        };
      }
      return {
        ok: true,
        status: 200,
        async json() {
          return { audios: [Buffer.from([1, 2]).toString('base64')] };
        },
      };
    },
  });

  const result = await synthesizer.synthesize({
    text: 'Agla kadam.',
    language: 'hi-IN',
  });

  assert.deepEqual([...result.audio], [1, 2]);
  assert.equal(callCount, 2);
  assert.deepEqual(delays, [7_000]);
  assert.equal(events.length, 1);
  assert.equal(events[0][0], '[Sarvam retry]');
  assert.match(events[0][1].operationId, /^sarvam-tts-\d+$/);
  assert.equal(events[0][1].service, 'Sarvam text-to-speech');
  assert.equal(events[0][1].reason, 'http-429');
  assert.equal(events[0][1].attempt, 2);
  assert.equal(events[0][1].delayMs, 7_000);
  assert.equal(events[0][1].status, 429);
});

test('Sarvam TTS retries empty successful audio payloads', async () => {
  const delays = [];
  const events = [];
  const audio = Buffer.from([1, 2]);
  let callCount = 0;
  const synthesizer = createSarvamSynthesizer({
    baseUrl: 'https://sarvam.test',
    apiKey: 'test-key',
    retryDelayMs: 1,
    sleep: async (delayMs) => delays.push(delayMs),
    logger: (...args) => events.push(args),
    fetcher: async () => {
      callCount += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return callCount === 1
            ? { audios: [] }
            : { audios: [audio.toString('base64')] };
        },
      };
    },
  });

  const result = await synthesizer.synthesize({
    text: 'Agla kadam.',
    language: 'hi-IN',
  });

  assert.deepEqual([...result.audio], [...audio]);
  assert.equal(result.mimeType, 'audio/wav');
  assert.equal(callCount, 2);
  assert.deepEqual(delays, [1]);
  assert.equal(events.length, 1);
  assert.equal(events[0][0], '[Sarvam retry]');
  assert.match(events[0][1].operationId, /^sarvam-tts-\d+$/);
  assert.equal(events[0][1].service, 'Sarvam text-to-speech');
  assert.equal(events[0][1].reason, 'empty-audios');
  assert.equal(events[0][1].attempt, 2);
  assert.equal(events[0][1].delayMs, 1);
});

test('Sarvam TTS reports the malformed payload reason after bounded retries', async () => {
  const delays = [];
  const events = [];
  let callCount = 0;
  const synthesizer = createSarvamSynthesizer({
    baseUrl: 'https://sarvam.test',
    apiKey: 'test-key',
    maxAttempts: 2,
    retryDelayMs: 1,
    sleep: async (delayMs) => delays.push(delayMs),
    logger: (...args) => events.push(args),
    fetcher: async () => {
      callCount += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return { audios: [] };
        },
      };
    },
  });

  await assert.rejects(
    () => synthesizer.synthesize({ text: 'Agla kadam.', language: 'hi-IN' }),
    /no audio/,
  );

  assert.equal(callCount, 2);
  assert.deepEqual(delays, [1]);
  assert.equal(events.length, 2);
  assert.equal(events[0][0], '[Sarvam retry]');
  assert.equal(events[0][1].reason, 'empty-audios');
  assert.equal(events[1][0], '[Sarvam error]');
  assert.match(events[1][1].operationId, /^sarvam-tts-\d+$/);
  assert.equal(events[1][1].reason, 'empty-audios');
});

test('Sarvam TTS retries invalid successful audio payloads', async () => {
  const audio = Buffer.from([3, 4]);
  let callCount = 0;
  const synthesizer = createSarvamSynthesizer({
    baseUrl: 'https://sarvam.test',
    apiKey: 'test-key',
    retryDelayMs: 1,
    sleep: async () => undefined,
    logger: () => undefined,
    fetcher: async () => {
      callCount += 1;
      return {
        ok: true,
        status: 200,
        async json() {
          return callCount === 1
            ? { audios: ['not valid base64'] }
            : { audios: [audio.toString('base64')] };
        },
      };
    },
  });

  const result = await synthesizer.synthesize({
    text: 'Agla kadam.',
    language: 'hi-IN',
  });

  assert.deepEqual([...result.audio], [...audio]);
  assert.equal(callCount, 2);
});

test('Sarvam adapters do not retry permanent provider rejections', async () => {
  let callCount = 0;
  const events = [];
  const transcriber = createSarvamTranscriber({
    baseUrl: 'https://sarvam.test',
    apiKey: 'test-key',
    sleep: async () => assert.fail('sleep should not run'),
    logger: (...args) => events.push(args),
    fetcher: async () => {
      callCount += 1;
      return {
        ok: false,
        status: 400,
        headers: { get: () => null },
        async json() {
          return { error: 'invalid request' };
        },
      };
    },
  });

  await assert.rejects(
    () => transcriber.transcribe({
      audio: Buffer.from([1]),
      contentType: 'audio/webm',
    }),
    /HTTP 400/,
  );
  assert.equal(callCount, 1);
  assert.equal(events.length, 1);
  assert.equal(events[0][0], '[Sarvam error]');
  assert.match(events[0][1].operationId, /^sarvam-stt-\d+$/);
  assert.equal(events[0][1].reason, 'http-400');
  assert.equal(events[0][1].status, 400);
});

test('Sarvam adapters fail clearly when the provider key is absent', async () => {
  const transcriber = createSarvamTranscriber({
    baseUrl: 'https://sarvam.test',
    fetcher: async () => {
      throw new Error('fetch should not run');
    },
  });

  await assert.rejects(
    () => transcriber.transcribe({ audio: Buffer.from([1]), contentType: 'audio/wav' }),
    /SARVAM_API_KEY/,
  );
});
