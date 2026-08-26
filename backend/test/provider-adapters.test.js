import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateReasonRequest } from '../src/contracts.js';
import { createGroqReasoner } from '../src/groq-adapter.js';
import {
  createSarvamSynthesizer,
  createSarvamTranscriber,
} from '../src/sarvam-adapters.js';

function createReasonRequest() {
  return validateReasonRequest({
    userUtterance: 'Mujhe PF ka paisa nikalna hai.',
    userLanguage: 'hi-IN',
    session: { recentActions: [] },
    page: {
      title: 'Member Dashboard',
      section: 'Member Services',
      elements: [
        {
          id: 'el_online',
          role: 'button',
          label: 'Online Services',
          visible: true,
          inViewport: true,
          disabled: false,
        },
      ],
    },
  });
}

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
  assert.deepEqual(events[0], ['log', ['[Groq call]']]);
  assert.deepEqual(events[1], ['fetch']);
  assert.equal(
    captured.url,
    'https://api.groq.test/openai/v1/chat/completions',
  );
  assert.equal(captured.init.headers.authorization, 'Bearer test-groq-key');

  const payload = JSON.parse(captured.init.body);
  assert.equal(payload.model, 'openai/gpt-oss-120b');
  assert.equal(payload.temperature, 0);
  assert.deepEqual(payload.response_format, { type: 'json_object' });
  assert.equal(payload.messages[0].role, 'system');
  assert.match(payload.messages[0].content, /targetId/);
  assert.equal(payload.messages[1].role, 'user');
  assert.match(payload.messages[1].content, /Online Services/);
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
  assert.deepEqual(events, [
    ['[Groq call]'],
    [
      '[Groq retry]',
      {
        service: 'Groq reasoning',
        attempt: 2,
        delayMs: 1,
      },
    ],
  ]);
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
  assert.deepEqual(events, [
    ['[Groq call]'],
    ['[Groq error]', 'Groq request failed with HTTP 404.'],
  ]);
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

  assert.deepEqual(events, [
    [
      '[Sarvam response]',
      {
        service: 'Sarvam speech-to-text',
        status: 200,
        ok: true,
        body: {
          request_id: 'request-123',
          transcript: 'Test transcript',
          language_code: 'en-IN',
        },
      },
    ],
  ]);
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
  assert.deepEqual(events, [
    [
      '[Sarvam response]',
      {
        service: 'Sarvam text-to-speech',
        status: 200,
        ok: true,
        body: { audios: ['<base64 audio: 8 characters>'] },
      },
    ],
  ]);
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
          headers: { get: (name) => name === 'retry-after' ? '1' : null },
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
  assert.deepEqual(delays, [1_000]);
  assert.deepEqual(events, [
    [
      '[Sarvam retry]',
      {
        service: 'Sarvam text-to-speech',
        attempt: 2,
        delayMs: 1_000,
        status: 429,
      },
    ],
  ]);
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
  assert.deepEqual(events, [
    [
      '[Sarvam retry]',
      {
        service: 'Sarvam text-to-speech',
        attempt: 2,
        delayMs: 1,
      },
    ],
  ]);
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
  const transcriber = createSarvamTranscriber({
    baseUrl: 'https://sarvam.test',
    apiKey: 'test-key',
    sleep: async () => assert.fail('sleep should not run'),
    logger: () => undefined,
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
