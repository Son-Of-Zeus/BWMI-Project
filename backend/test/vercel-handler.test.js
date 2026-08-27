import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { describe, test } from 'node:test';

import {
  createBackendRequestHandler,
  MAX_VERCEL_AUDIO_BYTES,
} from '../src/server.js';

function requestFor({
  url,
  method = 'POST',
  headers = {},
  body = Buffer.alloc(0),
}) {
  const request = Readable.from(body.length ? [body] : []);
  request.url = url;
  request.method = method;
  request.headers = Object.fromEntries(
    Object.entries(headers).map(([key, value]) => [key.toLowerCase(), value]),
  );
  return request;
}

function responseFor() {
  const headers = new Map();
  let body = Buffer.alloc(0);
  let destroyed = false;

  return {
    statusCode: 200,
    headersSent: false,
    setHeader(name, value) {
      headers.set(name.toLowerCase(), value);
    },
    getHeader(name) {
      return headers.get(name.toLowerCase());
    },
    end(value) {
      if (value !== undefined) {
        body = Buffer.isBuffer(value) ? value : Buffer.from(String(value));
      }
      this.headersSent = true;
    },
    destroy() {
      destroyed = true;
      this.headersSent = true;
    },
    get body() {
      return body;
    },
    get headers() {
      return headers;
    },
    get destroyed() {
      return destroyed;
    },
  };
}

function reasonRequest() {
  return JSON.stringify({
    userUtterance: 'Continue.',
    session: { recentActions: [] },
    page: {
      title: 'Demo page',
      elements: [
        {
          id: 'el_continue',
          role: 'button',
          label: 'Continue',
          visible: true,
          inViewport: true,
          disabled: false,
        },
      ],
    },
  });
}

function createHandler(overrides = {}) {
  return createBackendRequestHandler({
    allowedOrigins: ['https://demo.example'],
    reasoner: {
      async reason() {
        return {
          action: 'guide',
          targetId: 'el_continue',
          spokenInstruction: 'Click Continue.',
          expectedUserAction: 'click',
          language: 'en-IN',
        };
      },
    },
    transcriber: {
      async transcribe() {
        return { transcript: 'Continue.', language: 'en-IN' };
      },
    },
    synthesizer: {
      async synthesize() {
        return { audio: Buffer.from([1, 2, 3]), mimeType: 'audio/test' };
      },
    },
    ...overrides,
  });
}

async function invoke(handler, requestOptions) {
  const response = responseFor();
  await handler(requestFor(requestOptions), response);
  return response;
}

describe('Vercel backend handler', () => {
  test('serves the prefixed reasoning route with the existing contract and CORS', async () => {
    const response = await invoke(createHandler(), {
      url: '/api/reason',
      headers: {
        origin: 'https://demo.example',
        'content-type': 'application/json',
      },
      body: Buffer.from(reasonRequest()),
    });

    assert.equal(response.statusCode, 200);
    assert.equal(response.headers.get('access-control-allow-origin'), 'https://demo.example');
    assert.deepEqual(JSON.parse(response.body.toString()), {
      action: 'guide',
      targetId: 'el_continue',
      spokenInstruction: 'Click Continue.',
      expectedUserAction: 'click',
      language: 'en-IN',
    });
  });

  test('accepts binary transcription input without changing the content type', async () => {
    let received;
    const handler = createHandler({
      transcriber: {
        async transcribe(input) {
          received = input;
          return { transcript: 'Continue.', language: 'en-IN' };
        },
      },
    });

    const response = await invoke(handler, {
      url: '/api/speech/transcribe',
      headers: {
        origin: 'https://demo.example',
        'content-type': 'audio/webm',
      },
      body: Buffer.from([10, 20, 30]),
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual([...received.audio], [10, 20, 30]);
    assert.equal(received.contentType, 'audio/webm');
    assert.deepEqual(JSON.parse(response.body.toString()), {
      transcript: 'Continue.',
      language: 'en-IN',
    });
  });

  test('returns synthesized audio bytes and handles preflight', async () => {
    const handler = createHandler();
    const audioResponse = await invoke(handler, {
      url: '/api/speech/synthesize',
      headers: {
        origin: 'https://demo.example',
        'content-type': 'application/json',
      },
      body: Buffer.from(JSON.stringify({ text: 'Click Continue.', language: 'en-IN' })),
    });

    assert.equal(audioResponse.statusCode, 200);
    assert.equal(audioResponse.headers.get('content-type'), 'audio/test');
    assert.deepEqual([...audioResponse.body], [1, 2, 3]);

    const preflight = await invoke(handler, {
      url: '/api/reason',
      method: 'OPTIONS',
      headers: { origin: 'https://demo.example' },
    });
    assert.equal(preflight.statusCode, 204);
    assert.equal(preflight.headers.get('access-control-allow-methods'), 'POST, OPTIONS');
  });

  test('enforces the deployment-specific audio limit before calling the transcriber', async () => {
    let transcribeCalls = 0;
    const handler = createHandler({
      maxAudioBytes: 3,
      transcriber: {
        async transcribe() {
          transcribeCalls += 1;
          return { transcript: 'ignored' };
        },
      },
    });

    const response = await invoke(handler, {
      url: '/api/speech/transcribe',
      headers: { 'content-type': 'audio/webm' },
      body: Buffer.from([1, 2, 3, 4]),
    });

    assert.equal(response.statusCode, 413);
    assert.match(response.body.toString(), /exceeds the allowed size/);
    assert.equal(transcribeCalls, 0);
    assert.equal(MAX_VERCEL_AUDIO_BYTES, 4 * 1024 * 1024);
  });
});
