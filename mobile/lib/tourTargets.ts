import { useCallback, useRef } from 'react';

/** Controls the app tutorial can spotlight. Each screen tags its own with useTourTarget. */
export type TourTargetId = 'feed-card' | 'interested-btn' | 'tab-discover' | 'tab-post' | 'tab-chat' | 'tab-profile';

type Measurable = { measureInWindow: (cb: (x: number, y: number, width: number, height: number) => void) => void };
export type TourRect = { x: number; y: number; width: number; height: number };

const targets = new Map<TourTargetId, Measurable>();

/** Ref callback that registers a view as a tutorial target (only while `enabled`). */
export function useTourTarget(id: TourTargetId, enabled = true) {
  const last = useRef<Measurable | null>(null);
  return useCallback(
    (node: Measurable | null) => {
      // Only clear our own registration: a recycled list cell may have taken the id since.
      if (last.current && targets.get(id) === last.current) targets.delete(id);
      last.current = node;
      if (node && enabled) targets.set(id, node);
    },
    [id, enabled]
  );
}

export function measureInWindow(node: Measurable | null | undefined): Promise<TourRect | null> {
  if (!node) return Promise.resolve(null);
  return new Promise((resolve) =>
    node.measureInWindow((x, y, width, height) => resolve(width > 0 && height > 0 ? { x, y, width, height } : null))
  );
}

/** Where the target is on screen right now, or null when it isn't mounted / laid out. */
export const measureTourTarget = (id: TourTargetId) => measureInWindow(targets.get(id));
