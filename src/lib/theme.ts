/**
 * Dark mode for web. No saved choice = follow the OS; the side menu switch saves 'light' or 'dark'.
 * index.html applies the same rule inline before first paint, so there is no light flash.
 */
import { useSyncExternalStore } from 'react';

export const THEME_STORAGE_KEY = 'synth.colorScheme';
type Scheme = 'light' | 'dark';

const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
const listeners = new Set<() => void>();

function saved(): Scheme | null {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function currentScheme(): Scheme {
  return saved() ?? (media?.matches ? 'dark' : 'light');
}

function apply() {
  const dark = currentScheme() === 'dark';
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#121110' : '#CC2486');
  listeners.forEach((l) => l());
}

media?.addEventListener('change', () => {
  if (!saved()) apply();
});

export function setDarkMode(on: boolean) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, on ? 'dark' : 'light');
  } catch {
    // Storage blocked: still switch for this visit.
  }
  // Every part switches on the same frame: existing color transitions would fade each at its own speed.
  const root = document.documentElement;
  root.classList.add('theme-transition');
  window.setTimeout(() => root.classList.remove('theme-transition'), 50);
  apply();
}

export function useIsDark(): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => currentScheme() === 'dark',
    () => false,
  );
}
