import { flushSync } from 'react-dom';

function reducedMotion() {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  );
}

/** True when the browser can animate a navigation with the View Transitions API. */
export function canAnimateNavigation() {
  return (
    typeof document !== 'undefined' &&
    typeof document.startViewTransition === 'function' &&
    !reducedMotion()
  );
}

/**
 * Runs a router update inside document.startViewTransition so the old page
 * cross-fades into the new one instead of being replaced instantly.
 * `flushSync` commits the React tree before the browser takes the new snapshot.
 */
export function runViewTransition(update: () => void) {
  if (!canAnimateNavigation()) {
    update();
    return;
  }
  document.startViewTransition(() => {
    flushSync(update);
  });
}
