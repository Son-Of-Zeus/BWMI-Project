import {
  createBackendRequestHandler,
  MAX_VERCEL_AUDIO_BYTES,
} from './server.js';

const configuredOrigins = process.env.ALLOWED_ORIGINS?.trim();

const handler = createBackendRequestHandler({
  // A missing production allowlist must fail closed. Local development keeps
  // the wildcard default through the standalone server entrypoint.
  allowedOrigins: configuredOrigins || 'https://invalid-origin.invalid',
  maxAudioBytes: MAX_VERCEL_AUDIO_BYTES,
});

export default handler;
