import { useSyncExternalStore } from 'react';
import {
  COMPANION_STATE_LABELS,
  getCompanionPosition,
  type CompanionUiStore,
} from './companion-ui';

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
      className={`companion-surface companion-surface--${snapshot.state}`}
      aria-label="Voice companion"
      data-companion-state={snapshot.state}
      style={style}
    >
      <button
        className={`companion-button${isListening ? ' companion-button--listening' : ''}`}
        type="button"
        aria-label={isListening ? 'Stop listening' : 'Start voice guidance'}
        aria-pressed={isListening}
        onClick={() => store.toggleListening()}
      >
        <span className="companion-orb" aria-hidden="true" />
      </button>
      <span className="companion-status" aria-live="polite">
        {COMPANION_STATE_LABELS[snapshot.state]}
      </span>
    </section>
  );
}
