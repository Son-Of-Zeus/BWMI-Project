import { useSyncExternalStore } from 'react';
import {
  COMPANION_STATE_LABELS,
  getCompanionPosition,
  type CompanionUiStore,
} from './companion-ui';
import type { CompanionState } from '../session/session-state';

export const COMPANION_STATUS_ID = 'voice-companion-status';

export function getCompanionButtonLabel(state: CompanionState): string {
  switch (state) {
    case 'listening':
      return 'Stop listening';
    case 'error':
      return 'Try voice guidance again';
    case 'success':
      return 'Start a new voice guidance request';
    case 'waiting':
      return 'Ask a follow-up question';
    default:
      return 'Start voice guidance';
  }
}

function isBusyState(state: CompanionState): boolean {
  return state === 'listening' || state === 'thinking' || state === 'speaking';
}

type CompanionProps = {
  store: CompanionUiStore;
};

export default function Companion({ store }: CompanionProps) {
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
  const isListening = snapshot.state === 'listening';
  const isBusy = isBusyState(snapshot.state);
  const statusLabel = snapshot.latencyNotice
    ? 'Still working…'
    : COMPANION_STATE_LABELS[snapshot.state];
  const viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
  };
  const position = snapshot.targetRect
    ? getCompanionPosition(snapshot.targetRect, viewport)
    : undefined;
  const style = position
    ? {
        left: `${position.left}px`,
        top: `${position.top}px`,
        right: 'auto',
        bottom: 'auto',
      }
    : undefined;

  return (
    <section
      role="region"
      className={`companion-surface companion-surface--${snapshot.state}`}
      aria-label="Voice companion"
      aria-busy={isBusy}
      data-companion-state={snapshot.state}
      data-companion-busy={isBusy}
      data-companion-latency={snapshot.latencyNotice ? 'slow' : 'normal'}
      style={style}
    >
      <button
        className={`companion-button${isListening ? ' companion-button--listening' : ''}`}
        type="button"
        aria-label={getCompanionButtonLabel(snapshot.state)}
        aria-describedby={COMPANION_STATUS_ID}
        aria-pressed={isListening}
        onClick={() => store.toggleListening()}
      >
        <span className="companion-orb" aria-hidden="true" />
      </button>
      <button
        className="companion-reset"
        type="button"
        aria-label="Reset demo"
        title="Reset demo"
        onClick={() => store.resetDemo()}
      >
        <span aria-hidden="true">↺</span>
      </button>
      <span
        className="companion-status"
        id={COMPANION_STATUS_ID}
        role="status"
        aria-live={snapshot.state === 'error' ? 'assertive' : 'polite'}
        aria-atomic="true"
      >
        {statusLabel}
      </span>
    </section>
  );
}
