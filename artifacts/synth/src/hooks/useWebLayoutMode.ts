import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';

/** Align with Tailwind `lg` (1024px). */
export const WEB_DESKTOP_MIN_WIDTH_PX = 1024;

export type WebLayoutMode = 'native' | 'web-mobile' | 'web-desktop';

/**
 * Drives responsive web chrome: native Capacitor clients vs browser mobile vs browser desktop.
 */
export function useWebLayoutMode(): WebLayoutMode {
  const [mode, setMode] = useState<WebLayoutMode>(() => computeMode());

  useEffect(() => {
    if (Capacitor.isNativePlatform()) {
      setMode('native');
      return;
    }

    const mq = window.matchMedia(`(min-width: ${WEB_DESKTOP_MIN_WIDTH_PX}px)`);
    const onChange = () => setMode(mq.matches ? 'web-desktop' : 'web-mobile');

    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return mode;
}

function computeMode(): WebLayoutMode {
  if (typeof window === 'undefined') return 'web-mobile';
  if (Capacitor.isNativePlatform()) return 'native';
  return window.matchMedia(`(min-width: ${WEB_DESKTOP_MIN_WIDTH_PX}px)`).matches
    ? 'web-desktop'
    : 'web-mobile';
}
