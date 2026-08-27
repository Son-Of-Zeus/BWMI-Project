import { validateSpeechResult } from './contracts.js';

const DEFAULT_SARVAM_BASE_URL = 'https://api.sarvam.ai';
const DEFAULT_STT_MODEL = 'saaras:v3';
const DEFAULT_STT_MODE = 'transcribe';
const DEFAULT_TTS_MODEL = 'bulbul:v3';
const DEFAULT_TTS_SPEAKER = 'shubh';
const DEFAULT_TTS_LANGUAGE = 'hi-IN';
const DEFAULT_MAX_ATTEMPTS = 3;
const DEFAULT_RETRY_DELAY_MS = 250;
const RETRYABLE_STATUS_CODES = new Set([408, 425, 429, 500, 502, 503, 504]);

let sarvamOperationSequence = 0;

function nextSarvamOperationId(prefix) {
  sarvamOperationSequence += 1;
  return `${prefix}-${sarvamOperationSequence}`;
}

class SarvamPayloadError extends Error {
  constructor(serviceName, reason, message) {
    super(message);
    this.name = 'SarvamPayloadError';
    this.reason = reason;
    this.serviceName = serviceName;
  }
}

class SarvamHttpError extends Error {
  constructor(serviceName, response, payload) {
    super(`${serviceName} returned HTTP ${response.status}.`);
    this.name = 'SarvamHttpError';
    this.status = response.status;
    this.retryAfter = response.headers?.get?.('retry-after') ?? undefined;
    this.providerRequestId =
      typeof payload?.request_id === 'string'
        ? payload.request_id.slice(0, 120)
        : undefined;
    this.providerErrorCode =
      typeof payload?.error?.code === 'string'
        ? payload.error.code.slice(0, 80)
        : undefined;
  }
}

function endpointFor(baseUrl, pathname) {
  const url = new URL(baseUrl);
  url.pathname = `${url.pathname.replace(/\/+$/, '')}${pathname}`;
  url.search = '';
  return url.toString();
}

function apiKeyFrom(options) {
  const apiKey = options.apiKey ?? process.env.SARVAM_API_KEY;
  if (typeof apiKey !== 'string' || apiKey.trim().length === 0) {
    throw new Error('SARVAM_API_KEY is not configured.');
  }
  return apiKey.trim();
}

function baseUrlFrom(options) {
  return options.baseUrl ?? process.env.SARVAM_BASE_URL ?? DEFAULT_SARVAM_BASE_URL;
}

function mediaType(contentType) {
  return typeof contentType === 'string'
    ? contentType.split(';', 1)[0] || 'application/octet-stream'
    : 'application/octet-stream';
}

function extensionFor(contentType) {
  const type = mediaType(contentType);
  return (
    {
      'audio/webm': 'webm',
      'audio/wav': 'wav',
      'audio/mpeg': 'mp3',
      'audio/ogg': 'ogg',
      'audio/mp4': 'm4a',
    }[type] ?? 'audio'
  );
}

function positiveInteger(value, fallback) {
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function retryDelayMs(error, attempt, baseDelayMs) {
  const retryAfter = error instanceof SarvamHttpError ? error.retryAfter : undefined;
  if (retryAfter !== undefined) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return seconds * 1_000;
    }

    const retryAt = Date.parse(retryAfter);
    if (Number.isFinite(retryAt)) {
      return Math.max(0, retryAt - Date.now());
    }
  }

  return baseDelayMs * 2 ** (attempt - 1);
}

function isRetryable(error) {
  return (
    !(error instanceof SarvamHttpError) ||
    RETRYABLE_STATUS_CODES.has(error.status)
  );
}

function retryReason(error) {
  if (error instanceof SarvamPayloadError) {
    return error.reason;
  }
  if (error instanceof SarvamHttpError) {
    return `http-${error.status}`;
  }
  if (error?.name === 'AbortError' || error?.code === 'ETIMEDOUT') {
    return 'timeout';
  }
  if (typeof error?.code === 'string' && /^[A-Z0-9_]+$/.test(error.code)) {
    return `transport-${error.code}`;
  }
  return 'transport';
}

function retryLogDetails(error, serviceName, operationId) {
  return {
    operationId,
    service: serviceName,
    reason: retryReason(error),
    ...(error instanceof SarvamHttpError
      ? {
          status: error.status,
          ...(error.retryAfter !== undefined
            ? { retryAfter: error.retryAfter }
            : {}),
          ...(error.providerRequestId
            ? { providerRequestId: error.providerRequestId }
            : {}),
          ...(error.providerErrorCode
            ? { providerErrorCode: error.providerErrorCode }
            : {}),
        }
      : {}),
  };
}

async function requestWithRetry(request, options) {
  const maxAttempts = positiveInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS);
  const baseDelayMs = positiveInteger(
    options.retryDelayMs,
    DEFAULT_RETRY_DELAY_MS,
  );
  const sleep = options.sleep ?? ((delayMs) => new Promise((resolve) => {
    setTimeout(resolve, delayMs);
  }));

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await request();
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts || !isRetryable(error)) {
        options.logger?.(
          '[Sarvam error]',
          retryLogDetails(error, options.serviceName, options.operationId),
        );
        throw error;
      }

      const delayMs = retryDelayMs(error, attempt, baseDelayMs);
      options.logger?.('[Sarvam retry]', {
        ...retryLogDetails(error, options.serviceName, options.operationId),
        attempt: attempt + 1,
        delayMs,
      });
      await sleep(delayMs);
    }
  }

  throw lastError;
}

function responseBodyForLog(payload, summarizeAudio) {
  if (!summarizeAudio || !payload || typeof payload !== 'object') {
    return payload;
  }

  const audios = Array.isArray(payload.audios)
    ? payload.audios.map((audio) =>
      typeof audio === 'string'
        ? `<base64 audio: ${audio.length} characters>`
        : '<invalid audio value>')
    : payload.audios;
  return { ...payload, ...(audios === undefined ? {} : { audios }) };
}

async function jsonResponse(
  response,
  serviceName,
  logger,
  summarizeAudio = false,
  operationId,
) {
  let payload;
  try {
    payload = await response.json();
  } catch {
    logger?.('[Sarvam response]', {
      operationId,
      service: serviceName,
      status: response.status,
      ok: response.ok,
      body: '<non-JSON response>',
    });
    throw new SarvamPayloadError(
      serviceName,
      'invalid-json',
      `${serviceName} returned invalid JSON.`,
    );
  }

  logger?.('[Sarvam response]', {
    operationId,
    service: serviceName,
    status: response.status,
    ok: response.ok,
    body: responseBodyForLog(payload, summarizeAudio),
  });

  if (!response.ok) {
    throw new SarvamHttpError(serviceName, response, payload);
  }

  return payload;
}

const BASE64_AUDIO_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

function decodeTtsAudio(payload) {
  const audioParts = Array.isArray(payload?.audios)
    ? payload.audios.filter((audio) => typeof audio === 'string' && audio.length > 0)
    : [];
  if (audioParts.length === 0) {
    throw new SarvamPayloadError(
      'Sarvam text-to-speech',
      'empty-audios',
      'Sarvam text-to-speech returned no audio.',
    );
  }

  const encodedAudio = audioParts.join('').replace(/\s+/g, '');
  if (!BASE64_AUDIO_PATTERN.test(encodedAudio)) {
    throw new SarvamPayloadError(
      'Sarvam text-to-speech',
      'invalid-base64',
      'Sarvam text-to-speech returned invalid audio.',
    );
  }

  const audio = Buffer.from(encodedAudio, 'base64');
  if (audio.length === 0) {
    throw new SarvamPayloadError(
      'Sarvam text-to-speech',
      'decoded-empty-audio',
      'Sarvam text-to-speech returned empty audio.',
    );
  }
  return audio;
}

export function createSarvamTranscriber(options = {}) {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = baseUrlFrom(options);
  const shouldLogResponses =
    options.logResponses ?? process.env.SARVAM_LOG_RESPONSES === 'true';
  const logger = shouldLogResponses ? options.logger ?? console.log : undefined;
  const retryLogger = options.logger ?? console.warn;
  const model = options.model ?? process.env.SARVAM_STT_MODEL ?? DEFAULT_STT_MODEL;
  const mode = options.mode ?? process.env.SARVAM_STT_MODE ?? DEFAULT_STT_MODE;
  const languageCode =
    options.languageCode ?? process.env.SARVAM_STT_LANGUAGE_CODE;

  return {
    async transcribe({ audio, contentType }) {
      const apiKey = apiKeyFrom(options);
      const form = new FormData();
      const operationId = nextSarvamOperationId('sarvam-stt');
      const blob = new Blob([audio], { type: mediaType(contentType) });
      form.append('file', blob, `voice.${extensionFor(contentType)}`);
      form.append('model', model);
      form.append('mode', mode);
      if (languageCode) {
        form.append('language_code', languageCode);
      }

      const payload = await requestWithRetry(async () => {
        const response = await fetcher(endpointFor(baseUrl, '/speech-to-text'), {
          method: 'POST',
          headers: { 'api-subscription-key': apiKey },
          body: form,
        });
        return jsonResponse(
          response,
          'Sarvam speech-to-text',
          logger,
          false,
          operationId,
        );
      }, {
        ...options,
        logger: retryLogger,
        serviceName: 'Sarvam speech-to-text',
        operationId,
      });
      return validateSpeechResult({
        transcript: payload?.transcript,
        ...(payload?.language_code ? { language: payload.language_code } : {}),
      });
    },
  };
}

export function createSarvamSynthesizer(options = {}) {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = baseUrlFrom(options);
  const shouldLogResponses =
    options.logResponses ?? process.env.SARVAM_LOG_RESPONSES === 'true';
  const logger = shouldLogResponses ? options.logger ?? console.log : undefined;
  const model = options.model ?? process.env.SARVAM_TTS_MODEL ?? DEFAULT_TTS_MODEL;
  const speaker =
    options.speaker ?? process.env.SARVAM_TTS_SPEAKER ?? DEFAULT_TTS_SPEAKER;
  const defaultLanguage =
    options.languageCode ??
    process.env.SARVAM_TTS_LANGUAGE_CODE ??
    DEFAULT_TTS_LANGUAGE;

  return {
    async synthesize(input) {
      const apiKey = apiKeyFrom(options);
      const operationId = nextSarvamOperationId('sarvam-tts');
      return requestWithRetry(async () => {
        const response = await fetcher(endpointFor(baseUrl, '/text-to-speech'), {
          method: 'POST',
          headers: {
            'api-subscription-key': apiKey,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            text: input.text,
            language_code: input.language ?? defaultLanguage,
            model,
            speaker,
          }),
        });
        const payload = await jsonResponse(
          response,
          'Sarvam text-to-speech',
          logger,
          true,
          operationId,
        );
        return {
          audio: decodeTtsAudio(payload),
          mimeType: 'audio/wav',
        };
      }, {
        ...options,
        logger: options.logger ?? console.warn,
        serviceName: 'Sarvam text-to-speech',
        operationId,
      });
    },
  };
}
