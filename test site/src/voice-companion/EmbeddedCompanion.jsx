import { useEffect } from 'react'
import extensionStyles from '@voice-companion/entrypoints/content/style.css?inline'
import { createBrowserMicrophoneRecorder } from '@voice-companion/voice/voice'
import {
  mountEmbeddedCompanion,
  normalizeEmbeddedBackendUrl,
} from '@voice-companion/runtime/embedded-mount'

const EMBEDDED_RECORDING_MAX_DURATION_MS = 30_000

export default function EmbeddedCompanion() {
  useEffect(() => {
    const mounted = mountEmbeddedCompanion({
      backendUrl: normalizeEmbeddedBackendUrl(
        import.meta.env.VITE_VOICE_COMPANION_BACKEND_URL,
      ),
      styleText: extensionStyles,
      recorder: createBrowserMicrophoneRecorder({
        maxDurationMs: EMBEDDED_RECORDING_MAX_DURATION_MS,
      }),
    })

    return () => mounted.destroy()
  }, [])

  return null
}
