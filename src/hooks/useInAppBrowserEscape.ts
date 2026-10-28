import { useCallback, useRef, useState } from 'react';
import { detectInAppBrowser, escapeInAppBrowser } from '@synth/shared';

/**
 * Handles the Instagram/Facebook in-app-browser App Store link workaround.
 * Call `tryEscape(url)` from a click handler: returns false in a normal
 * browser (caller should let the real href/window.open proceed), or true
 * after firing the escape navigation (caller should preventDefault).
 *
 * After an escape attempt, if the page hasn't backgrounded within ~1.5s
 * (visibilitychange/pagehide/blur), the escape silently failed and
 * `showFallback` flips true so the caller can show manual instructions.
 */
export function useInAppBrowserEscape() {
  const [showFallback, setShowFallback] = useState(false);
  const cleanupRef = useRef<(() => void) | null>(null);

  const armFallbackTimer = useCallback(() => {
    cleanupRef.current?.();

    const onEscapeDetected = () => cleanup();
    const cleanup = () => {
      document.removeEventListener('visibilitychange', onEscapeDetected);
      window.removeEventListener('pagehide', onEscapeDetected);
      window.removeEventListener('blur', onEscapeDetected);
      window.clearTimeout(timer);
      cleanupRef.current = null;
    };

    document.addEventListener('visibilitychange', onEscapeDetected);
    window.addEventListener('pagehide', onEscapeDetected);
    window.addEventListener('blur', onEscapeDetected);

    const timer = window.setTimeout(() => {
      cleanup();
      setShowFallback(true);
    }, 1500);

    cleanupRef.current = cleanup;
  }, []);

  const tryEscape = useCallback((targetUrl: string, userAgent: string = navigator.userAgent): boolean => {
    const host = detectInAppBrowser(userAgent);
    if (!host) return false;
    escapeInAppBrowser(host, targetUrl);
    armFallbackTimer();
    return true;
  }, [armFallbackTimer]);

  const dismissFallback = useCallback(() => setShowFallback(false), []);

  return { tryEscape, showFallback, dismissFallback };
}
