import { useSyncExternalStore } from 'react';

/**
 * App tutorial state, shared by the spotlight overlay (TourOverlay in the tab layout) and the
 * real features that complete its live steps. Runs on the real screens: each step opens its page
 * and spotlights the control it talks about. Two steps are live tasks the user actually does
 * (save a show, review a show). Every step can be skipped.
 */
export type TourStepId = 'feed' | 'save' | 'community' | 'review' | 'messages' | 'profile';
export type TourAction = 'interested' | 'review';

export const TASK_ACTION: Partial<Record<TourStepId, TourAction>> = { save: 'interested', review: 'review' };

const STEPS: TourStepId[] = ['feed', 'save', 'community', 'review', 'messages', 'profile'];

type TourState = { steps: TourStepId[]; index: number } | null;

let state: TourState = null;
const listeners = new Set<() => void>();
const actionListeners = new Set<(a: TourAction) => void>();
const emit = () => listeners.forEach((l) => l());

export const isTaskStep = (id: TourStepId | null | undefined) => !!id && id in TASK_ACTION;

export function getTour() {
  if (!state) return null;
  return {
    step: state.steps[state.index],
    next: state.steps[state.index + 1] ?? null,
    index: state.index,
    total: state.steps.length,
  };
}

export const isTourActive = () => state !== null;

export function startTour() {
  state = { steps: STEPS, index: 0 };
  emit();
}

/** Moves to the next step; returns it, or null when the tour is over. */
export function advanceTour(): TourStepId | null {
  if (!state) return null;
  if (state.index + 1 >= state.steps.length) {
    state = null;
    emit();
    return null;
  }
  state = { ...state, index: state.index + 1 };
  emit();
  return state.steps[state.index];
}

export function endTour() {
  state = null;
  emit();
}

/**
 * Called from the real feature (Interested toggle, review submit). Returns true when the
 * tour was waiting on exactly this action, so the caller can skip its own follow-up UI.
 */
export function reportTourAction(action: TourAction): boolean {
  const current = getTour()?.step;
  if (!current || TASK_ACTION[current] !== action) return false;
  actionListeners.forEach((l) => l(action));
  return true;
}

export function onTourAction(l: (a: TourAction) => void): () => void {
  actionListeners.add(l);
  return () => actionListeners.delete(l);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

// Stable snapshot: state object identity changes only on emit.
const snapshot = () => state;

export function useTour() {
  useSyncExternalStore(subscribe, snapshot, snapshot);
  return getTour();
}
