import { validateSpeechResult } from './contracts.js';

const DEFAULT_SARVAM_BASE_URL = 'https://api.sarvam.ai';
const DEFAULT_STT_MODEL = 'saaras:v3';
const DEFAULT_STT_MODE = 'transcribe';
const DEFAULT_TTS_MODEL = 'bulbul:v3';
const DEFAULT_TTS_SPEAKER = 'shubh';
const DEFAULT_TTS_LANGUAGE = 'hi-IN';

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

async function jsonResponse(response, serviceName) {
  if (!response.ok) {
    throw new Error(`${serviceName} returned HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    throw new Error(`${serviceName} returned invalid JSON.`);
  }
}

export function createSarvamTranscriber(options = {}) {
  const fetcher = options.fetcher ?? fetch;
  const baseUrl = baseUrlFrom(options);
  const model = options.model ?? process.env.SARVAM_STT_MODEL ?? DEFAULT_STT_MODEL;
  const mode = options.mode ?? process.env.SARVAM_STT_MODE ?? DEFAULT_STT_MODE;
  const languageCode =
    options.languageCode ?? process.env.SARVAM_STT_LANGUAGE_CODE;

  return {
    async transcribe({ audio, contentType }) {
      const apiKey = apiKeyFrom(options);
      const form = new FormData();
      const blob = new Blob([audio], { type: mediaType(contentType) });
      form.append('file', blob, `voice.${extensionFor(contentType)}`);
      form.append('model', model);
      form.append('mode', mode);
      if (languageCode) {
        form.append('language_code', languageCode);
      }

      const response = await fetcher(endpointFor(baseUrl, '/speech-to-text'), {
        method: 'POST',
        headers: { 'api-subscription-key': apiKey },
        body: form,
      });
      const payload = await jsonResponse(response, 'Sarvam speech-to-text');
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
      const payload = await jsonResponse(response, 'Sarvam text-to-speech');
      const audioParts = Array.isArray(payload?.audios)
        ? payload.audios.filter((audio) => typeof audio === 'string' && audio.length > 0)
        : [];
      if (audioParts.length === 0) {
        throw new Error('Sarvam text-to-speech returned no audio.');
      }

      return {
        audio: Buffer.from(audioParts.join(''), 'base64'),
        mimeType: 'audio/wav',
      };
    },
  };
}
