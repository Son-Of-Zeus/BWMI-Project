import assert from 'node:assert/strict';
import { test } from 'node:test';

import { validateReasonRequest } from '../src/contracts.js';
import {
  createLiteLLMReasoner,
} from '../src/litellm-adapter.js';
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

test('LiteLLM adapter sends an OpenAI-compatible structured reasoning request', async () => {
  let captured;
  const reasoner = createLiteLLMReasoner({
    endpoint: 'http://litellm.test/v1',
    model: 'demo-model',
    apiKey: 'test-key',
    fetcher: async (url, init) => {
      captured = { url, init };
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
  assert.equal(captured.url, 'http://litellm.test/v1/chat/completions');
  assert.equal(captured.init.headers.authorization, 'Bearer test-key');

  const payload = JSON.parse(captured.init.body);
  assert.equal(payload.model, 'demo-model');
  assert.equal(payload.temperature, 0);
  assert.deepEqual(payload.response_format, { type: 'json_object' });
  assert.equal(payload.messages[0].role, 'system');
  assert.match(payload.messages[0].content, /targetId/);
  assert.match(payload.messages[1].content, /Online Services/);
});

test('LiteLLM adapter rejects non-JSON assistant content', async () => {
  const reasoner = createLiteLLMReasoner({
    endpoint: 'http://litellm.test/chat/completions',
    model: 'demo-model',
    fetcher: async () => ({
      ok: true,
      status: 200,
      async json() {
        return { choices: [{ message: { content: 'not-json' } }] };
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
