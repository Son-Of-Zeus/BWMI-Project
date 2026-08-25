import { useState } from 'react';

type ShellState = 'idle' | 'listening';

export default function App() {
  const [state, setState] = useState<ShellState>('idle');
  const isListening = state === 'listening';

  return (
    <section className="voice-companion-shell" aria-label="Voice companion">
      <button
        className={`voice-button${isListening ? ' voice-button--listening' : ''}`}
        type="button"
        aria-label={isListening ? 'Stop listening' : 'Start voice guidance'}
        aria-pressed={isListening}
        onClick={() => setState(isListening ? 'idle' : 'listening')}
      >
        <span className="voice-orb" aria-hidden="true" />
      </button>
      <span className="voice-status" aria-live="polite">
        {isListening ? 'Listening…' : 'Voice guidance'}
      </span>
    </section>
  );
}
