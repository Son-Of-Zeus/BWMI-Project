import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ContractValidationError,
  MAX_AUDIO_BYTES,
  MAX_REASON_BODY_BYTES,
  MAX_SPEECH_JSON_BYTES,
  validateGuideAction,
  validateReasonRequest,
  validateSpeechResult,
  validateSynthesisInput,
} from './contracts.js';
import { createGroqReasoner } from './groq-adapter.js';
import {
  createPrototypeReasoner,
  createPrototypeSynthesizer,
  createPrototypeTranscriber,
} from './prototype-adapters.js';
import {
  createSarvamSynthesizer,
  createSarvamTranscriber,
} from './sarvam-adapters.js';

const DEFAULT_HOSTNAME = '127.0.0.1';
const DEFAULT_PORT = 8_787;
const DEFAULT_AUDIO_MIME_TYPE = 'audio/mpeg';
const MIME_TYPE_PATTERN = /^[\w!#$&^+.-]+\/[\w!#$&^+.-]+$/;
const ENV_FILE_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../.env',
);

function loadEnvironmentFile() {
  if (typeof process.loadEnvFile !== 'function') {
    return;
  }

  try {
    process.loadEnvFile(ENV_FILE_PATH);
  } catch (error) {
    if (error && typeof error === 'object' && error.code === 'ENOENT') {
      return;
    }
    throw error;
  }
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

function normalizeAllowedOrigins(value) {
  const origins = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(',')
      : [];
  const normalized = origins.map((origin) => origin.trim()).filter(Boolean);
  return normalized.length ? new Set(normalized) : new Set(['*']);
}

function originForRequest(request, allowedOrigins) {
  const origin = request.headers.origin;
  if (!origin) {
    return undefined;
  }
  if (allowedOrigins.has('*') || allowedOrigins.has(origin)) {
    return allowedOrigins.has('*') ? '*' : origin;
  }
  return undefined;
}

function setCorsHeaders(request, response, allowedOrigins) {
  const allowedOrigin = originForRequest(request, allowedOrigins);
  if (allowedOrigin) {
    response.setHeader('access-control-allow-origin', allowedOrigin);
    response.setHeader('vary', 'Origin');
  }
  response.setHeader('access-control-allow-methods', 'POST, OPTIONS');
  response.setHeader('access-control-allow-headers', 'content-type');
}

function headerValue(request, name) {
  const value = request.headers[name];
  return Array.isArray(value) ? value[0] : value;
}

async function readBody(request, maxBytes) {
  const chunks = [];
  let totalBytes = 0;

  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    totalBytes += buffer.length;
    if (totalBytes > maxBytes) {
      throw new HttpError(413, 'Request body exceeds the allowed size.');
    }
    chunks.push(buffer);
  }

  return Buffer.concat(chunks, totalBytes);
}

async function readJson(request, maxBytes) {
  const body = await readBody(request, maxBytes);
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function writeJson(response, status, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.statusCode = status;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.setHeader('content-length', body.length);
  response.setHeader('cache-control', 'no-store');
  response.end(body);
}

function writeAudio(response, audio, mimeType) {
  response.statusCode = 200;
  response.setHeader('content-type', mimeType);
  response.setHeader('content-length', audio.length);
  response.setHeader('cache-control', 'no-store');
  response.end(audio);
}

function errorPayload(error) {
  if (error instanceof HttpError || error instanceof ContractValidationError) {
    return {
      status: error instanceof HttpError ? error.status : 400,
      body: { error: error.message },
    };
  }

  return {
    status: 500,
    body: { error: 'Internal backend error.' },
  };
}

function upstreamError(message) {
  return new HttpError(502, message);
}

async function runReasoner(reasoner, request) {
  try {
    const result = await reasoner.reason(request);
    return validateGuideAction(result, request.page.elements);
  } catch {
    throw upstreamError('Reasoning adapter returned an invalid response.');
  }
}

async function runTranscriber(transcriber, audio, contentType) {
  try {
    const result = await transcriber.transcribe({ audio, contentType });
    return validateSpeechResult(result);
  } catch {
    throw upstreamError('Speech-to-text adapter failed.');
  }
}

function bufferFromAudio(value) {
  if (Buffer.isBuffer(value)) {
    return value;
  }
  if (value instanceof Uint8Array) {
    return Buffer.from(value);
  }
  if (value instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(value));
  }
  return undefined;
}

function normalizeAudioResult(result) {
  const source =
    result && typeof result === 'object' && !Buffer.isBuffer(result) && 'audio' in result
      ? result
      : { audio: result };
  const audio = bufferFromAudio(source.audio);
  if (!audio || audio.length === 0) {
    throw upstreamError('Text-to-speech adapter returned no audio.');
  }

  const mimeType = source.mimeType ?? DEFAULT_AUDIO_MIME_TYPE;
  if (typeof mimeType !== 'string' || !MIME_TYPE_PATTERN.test(mimeType)) {
    throw upstreamError('Text-to-speech adapter returned an invalid audio type.');
  }

  return { audio, mimeType };
}

async function runSynthesizer(synthesizer, input) {
  try {
    return normalizeAudioResult(await synthesizer.synthesize(input));
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }
    throw upstreamError('Text-to-speech adapter failed.');
  }
}

async function handleRequest(request, response, options) {
  setCorsHeaders(request, response, options.allowedOrigins);

  const requestUrl = new URL(
    request.url ?? '/',
    `http://${headerValue(request, 'host') ?? DEFAULT_HOSTNAME}`,
  );

  if (request.method === 'OPTIONS') {
    response.statusCode = 204;
    response.end();
    return;
  }

  const endpoint = requestUrl.pathname;
  if (!['/reason', '/speech/transcribe', '/speech/synthesize'].includes(endpoint)) {
    throw new HttpError(404, 'Route not found.');
  }
  if (request.method !== 'POST') {
    response.setHeader('allow', 'POST, OPTIONS');
    throw new HttpError(405, 'Only POST is supported for this route.');
  }

  if (endpoint === '/reason') {
    const payload = await readJson(request, MAX_REASON_BODY_BYTES);
    const normalizedRequest = validateReasonRequest(payload);
    const action = await runReasoner(options.reasoner, normalizedRequest);
    writeJson(response, 200, action);
    return;
  }

  if (endpoint === '/speech/transcribe') {
    const audio = await readBody(request, MAX_AUDIO_BYTES);
    if (audio.length === 0) {
      throw new HttpError(400, 'Audio request body cannot be empty.');
    }
    const result = await runTranscriber(
      options.transcriber,
      audio,
      headerValue(request, 'content-type') ?? 'application/octet-stream',
    );
    writeJson(response, 200, result);
    return;
  }

  const payload = await readJson(request, MAX_SPEECH_JSON_BYTES);
  const input = validateSynthesisInput(payload);
  const result = await runSynthesizer(options.synthesizer, input);
  writeAudio(response, result.audio, result.mimeType);
}

function addressFor(server) {
  const address = server.address();
  if (!address || typeof address === 'string') {
    throw new Error('Backend server did not expose a network address.');
  }
  return address;
}

export function createBackendServer(options = {}) {
  const usePrototypeAdapters =
    options.usePrototypeAdapters ?? process.env.PROTOTYPE_MODE === 'true';
  const adapters = {
    reasoner:
      options.reasoner ??
      (usePrototypeAdapters
        ? createPrototypeReasoner()
        : createGroqReasoner(options.groq)),
    transcriber:
      options.transcriber ??
      (usePrototypeAdapters
        ? createPrototypeTranscriber()
        : createSarvamTranscriber(options.sarvam)),
    synthesizer:
      options.synthesizer ??
      (usePrototypeAdapters
        ? createPrototypeSynthesizer()
        : createSarvamSynthesizer(options.sarvam)),
    allowedOrigins: normalizeAllowedOrigins(options.allowedOrigins),
  };

  const server = http.createServer((request, response) => {
    handleRequest(request, response, adapters).catch((error) => {
      if (response.headersSent) {
        response.destroy();
        return;
      }
      const { status, body } = errorPayload(error);
      writeJson(response, status, body);
    });
  });

  return {
    server,

    listen(port = DEFAULT_PORT, hostname = DEFAULT_HOSTNAME) {
      return new Promise((resolve, reject) => {
        const onError = (error) => {
          server.off('listening', onListening);
          reject(error);
        };
        const onListening = () => {
          server.off('error', onError);
          resolve(addressFor(server));
        };
        server.once('error', onError);
        server.once('listening', onListening);
        server.listen(port, hostname);
      });
    },

    close() {
      if (!server.listening) {
        return Promise.resolve();
      }
      return new Promise((resolve, reject) => {
        server.close((error) => {
          if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') {
            reject(error);
            return;
          }
          resolve();
        });
      });
    },
  };
}

function parsePort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 && port <= 65_535 ? port : DEFAULT_PORT;
}

async function startFromCommandLine() {
  loadEnvironmentFile();
  const app = createBackendServer({
    allowedOrigins: process.env.ALLOWED_ORIGINS ?? '*',
    usePrototypeAdapters: process.env.PROTOTYPE_MODE === 'true',
  });
  const address = await app.listen(
    parsePort(process.env.PORT ?? DEFAULT_PORT),
    process.env.HOST ?? DEFAULT_HOSTNAME,
  );
  console.log(`Prototype backend listening on http://${address.address}:${address.port}`);

  const shutdown = async () => {
    await app.close();
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

const isMainModule =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMainModule) {
  startFromCommandLine().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Unable to start backend.');
    process.exitCode = 1;
  });
}
