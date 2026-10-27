/**
 * Mixes extra cards (friends' reviews, friend-interested shows, bucket-list shows) into
 * the ranked event list so the home thread reads as one feed, not a fixed every-Nth slot.
 *
 *  - Gaps between extras vary. They are seeded (user + day), so the layout is stable all
 *    day and loading the next page never reshuffles cards already on screen.
 *  - An extra that relates to an event (same artist or venue) sits right after that
 *    event when one is coming up within the gap.
 *  - Never two extras in a row. Extras that don't fit yet wait for more events instead
 *    of being dumped at the end.
 *
 * Shared so web and Expo weave identically.
 */

export type WovenEntry<E, X> = { kind: 'event'; item: E } | { kind: 'extra'; item: X };

export interface NaturalWeaveOptions<E, X> {
  /** Same seed => same layout. Use something like `${userId}:${yyyy-mm-dd}:reviews`. */
  seed: string;
  /** First extra goes after roughly this many events. */
  firstAt?: number;
  /** Events between extras, inclusive range. Clamped to >= 2 so extras never touch. */
  minGap?: number;
  maxGap?: number;
  /** Lets an extra jump to right after a related event inside its gap. */
  relatesTo?: (extra: X, event: E) => boolean;
}

/** Small seeded PRNG (mulberry32 over an FNV-1a hash of the seed). */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Returns, for each placed extra, the index of the event it follows. Extras past the
 * loaded events are left out (they get placed once more events load).
 */
export function planNaturalWeave<E, X>(
  events: E[],
  extras: X[],
  { seed, firstAt = 3, minGap = 4, maxGap = 8, relatesTo }: NaturalWeaveOptions<E, X>
): Map<number, X> {
  const rand = seededRandom(seed);
  const lo = Math.max(2, Math.floor(minGap));
  const hi = Math.max(lo, Math.floor(maxGap));
  const placed = new Map<number, X>();
  let last = -2; // index of the event the previous extra followed

  for (let x = 0; x < extras.length; x++) {
    const extra = extras[x];
    // Draw first, always: the layout of the first N extras must not depend on how
    // many events happen to be loaded.
    const jitter = Math.floor(rand() * (hi - lo + 1));
    const target = x === 0 ? Math.max(0, firstAt - 1) + Math.floor(jitter / 2) : last + lo + jitter;
    if (target >= events.length) break;

    let at = target;
    if (relatesTo) {
      for (let j = Math.max(last + 2, 0); j <= target; j++) {
        if (relatesTo(extra, events[j])) {
          at = j;
          break;
        }
      }
    }
    placed.set(at, extra);
    last = at;
  }
  return placed;
}

export function weaveNaturally<E, X>(
  events: E[],
  extras: X[],
  options: NaturalWeaveOptions<E, X>
): WovenEntry<E, X>[] {
  const placed = planNaturalWeave(events, extras, options);
  const out: WovenEntry<E, X>[] = [];
  events.forEach((item, i) => {
    out.push({ kind: 'event', item });
    const extra = placed.get(i);
    if (extra !== undefined) out.push({ kind: 'extra', item: extra });
  });
  return out;
}

/** `${prefix}:${yyyy-mm-dd}` in local time, for seeds that should change daily. */
export function dailySeed(prefix: string, now: Date = new Date()): string {
  const d = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return `${prefix}:${d}`;
}
