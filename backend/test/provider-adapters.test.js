import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateReasonRequest } from '../src/contracts.js';
import { createGeminiReasoner } from '../src/gemini-adapter.js';
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

test('Gemini adapter sends a direct structured reasoning request', async () => {
  let captured;
  const events = [];
  const reasoner = createGeminiReasoner({
    baseUrl: 'https://generativelanguage.test/v1beta',
    model: 'gemini-2.5-flash',
    apiKey: 'test-gemini-key',
    logger: (...args) => events.push(['log', args]),
    fetcher: async (url, init) => {
      events.push(['fetch']);
      captured = { url, init };
      return {
        ok: true,
        status: 200,
        async json() {
          return {
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        action: 'guide',
                        targetId: 'el_online',
                        spokenInstruction: 'Online Services par click kariye.',
                        expectedUserAction: 'click',
                        language: 'hi-IN',
                      }),
                    },
                  ],
                },
              },
            ],
          };
        },
      };
    },
  });

  await assert.doesNotReject(() => reasoner.reason(createReasonRequest()));
  assert.deepEqual(events[0], ['log', ['[Gemini call]']]);
  assert.deepEqual(events[1], ['fetch']);
  assert.equal(
    captured.url,
    'https://generativelanguage.test/v1beta/models/gemini-2.5-flash:generateContent',
  );
  assert.equal(captured.init.headers['x-goog-api-key'], 'test-gemini-key');

  const payload = JSON.parse(captured.init.body);
  assert.equal(payload.generationConfig.temperature, 0);
  assert.equal('maxOutputTokens' in payload.generationConfig, false);
  assert.equal(payload.generationConfig.responseMimeType, 'application/json');
  assert.match(payload.systemInstruction.parts[0].text, /targetId/);
  assert.equal(payload.contents[0].role, 'user');
  assert.match(payload.contents[0].parts[0].text, /Online Services/);
});

test('Gemini adapter logs an upstream status without logging request context', async () => {
  const events = [];
  const reasoner = createGeminiReasoner({
    baseUrl: 'https://generativelanguage.test/v1beta',
    model: 'gemini-3.5-flash',
    apiKey: 'test-gemini-key',
    logger: (...args) => events.push(args),
    fetcher: async () => ({ ok: false, status: 404 }),
  });

  await assert.rejects(
    () => reasoner.reason(createReasonRequest()),
    /HTTP 404/,
  );
  assert.deepEqual(events, [
    ['[Gemini call]'],
    ['[Gemini error]', 'Gemini request failed with HTTP 404.'],
  ]);
  assert.doesNotMatch(JSON.stringify(events), /test-gemini-key|Online Services/);
});

test('Gemini adapter derives the user action from the validated target role', async () => {
  const reasoner = createGeminiReasoner({
    baseUrl: 'https://generativelanguage.test/v1beta',
    apiKey: 'test-gemini-key',
    logger: () => undefined,
    fetcher: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      action: 'guide',
                      targetId: 'el_online',
                      spokenInstruction: 'Click Online Services.',
                      expectedUserAction: 'Click the Online Services button.',
                      language: 'en-IN',
                    }),
                  },
                ],
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

test('Gemini adapter fails clearly when the provider key is absent', async () => {
  const reasoner = createGeminiReasoner({
    baseUrl: 'https://generativelanguage.test/v1beta',
    fetcher: async () => {
      throw new Error('fetch should not run');
    },
  });

  await assert.rejects(
    () => reasoner.reason(createReasonRequest()),
    /GEMINI_API_KEY/,
  );
});

test('Gemini adapter rejects non-JSON model content', async () => {
  const reasoner = createGeminiReasoner({
    baseUrl: 'https://generativelanguage.test/v1beta',
    apiKey: 'test-gemini-key',
    logger: () => undefined,
    fetcher: async () => ({
      ok: true,
      status: 200,
      async json() {
        return {
          candidates: [{ content: { parts: [{ text: 'not-json' }] } }],
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
  const audio = Buffer.from([82, 73, 70, 70]);
  const synthesizer = createSarvamSynthesizer({
    baseUrl: 'https://sarvam.test',
    apiKey: 'test-key',
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
