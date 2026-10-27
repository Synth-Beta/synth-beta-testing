import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Soft "turn on notifications" ask, shown in the app (never at launch) before the
 * one-shot iOS dialog. iOS never re-asks after a denial, so we only spend the
 * system prompt once the user has seen the app and said yes on our own screen.
 */
export type PushPrimerReason = 'interested' | 'session' | 'onboarding';
type Listener = (reason: PushPrimerReason) => void;

const requestListeners = new Set<Listener>();
const tourClosedListeners = new Set<() => void>();

export function requestPushPrimer(reason: PushPrimerReason): void {
  requestListeners.forEach(l => l(reason));
}
export function onPushPrimerRequest(l: Listener): () => void {
  requestListeners.add(l);
  return () => requestListeners.delete(l);
}

export function notifyFeatureTourClosed(): void {
  tourClosedListeners.forEach(l => l());
}
export function onFeatureTourClosed(l: () => void): () => void {
  tourClosedListeners.add(l);
  return () => tourClosedListeners.delete(l);
}

// At most 2 asks, at least 3 days apart.
export const PUSH_PRIMER_MAX_SHOWS = 2;
export const PUSH_PRIMER_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;

type PrimerState = { count: number; last: number };
const key = (userId: string) => `PUSH_PRIMER:${userId}`;

export function primerAllowed(state: PrimerState, now: number): boolean {
  return state.count < PUSH_PRIMER_MAX_SHOWS && now - state.last >= PUSH_PRIMER_COOLDOWN_MS;
}

export async function loadPrimerState(userId: string): Promise<PrimerState> {
  try {
    const raw = await AsyncStorage.getItem(key(userId));
    const parsed = raw ? (JSON.parse(raw) as Partial<PrimerState>) : {};
    return { count: Number(parsed.count) || 0, last: Number(parsed.last) || 0 };
  } catch {
    // Storage unavailable: behave as already asked twice so we never nag.
    return { count: PUSH_PRIMER_MAX_SHOWS, last: Date.now() };
  }
}

export async function recordPrimerShown(userId: string, prev: PrimerState): Promise<void> {
  try {
    await AsyncStorage.setItem(key(userId), JSON.stringify({ count: prev.count + 1, last: Date.now() }));
  } catch {
    // Best-effort.
  }
}
