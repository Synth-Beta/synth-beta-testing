/**
 * "Just announced" shows (JamBase first listed them in the last 10 days) in the
 * recommendation feed. Shared so web and Expo place them identically.
 *
 * Source rows come from the get_just_announced_events RPC, already near the user's
 * browse location and ordered with the user's own artists (followed / bucket list) first.
 */

import type { SynthSupabaseClient } from './supabaseClientType';

export const JUST_ANNOUNCED_LABEL = 'Just announced';

/**
 * Records a feed impression/open of a just-announced card for the 10-day window test
 * (just_announced_feed_report). Fire-and-forget: tracking must never break the feed.
 */
export function logJustAnnounced(
  supabase: SynthSupabaseClient,
  eventId: string,
  action: 'impression' | 'open',
  isFan: boolean,
  platform: 'web' | 'ios' | 'android'
): void {
  void Promise.resolve(
    supabase.rpc('log_just_announced', {
      p_event_id: eventId,
      p_action: action,
      p_is_fan: isFan,
      p_platform: platform,
    })
  ).catch(() => {});
}

/** Max new shows from the user's own artists pinned above the ranked feed. */
export const JUST_ANNOUNCED_PIN_LIMIT = 3;

/** Ranker events between each injected just-announced show. */
export const JUST_ANNOUNCED_SPACING = 6;

/**
 * - Shows the ranker already returned keep their position and get the badge.
 * - Missing shows from the user's own artists are pinned at the top (up to the pin limit),
 *   because a new tour from an artist you follow is the point of the feature.
 * - Everything else missing is woven in every `spacing` ranker events; overflow is
 *   appended rather than dropped.
 *
 * Accessors instead of field names: web items key on `event_id` and badge via
 * `reasonLabel`, Expo items key on `id` and badge via `feedLabel`.
 */
export function weaveJustAnnouncedIntoFeed<T>(
  events: T[],
  justAnnounced: T[],
  getId: (item: T) => string,
  isFan: (item: T) => boolean,
  markJustAnnounced: (item: T) => T,
  spacing: number = JUST_ANNOUNCED_SPACING,
  pinLimit: number = JUST_ANNOUNCED_PIN_LIMIT
): T[] {
  if (justAnnounced.length === 0) return events;

  const announcedIds = new Set(justAnnounced.map(getId));
  const present = new Set(events.map(getId));
  const ranked = events.map((e) => (announcedIds.has(getId(e)) ? markJustAnnounced(e) : e));

  const missing = justAnnounced.filter((j) => !present.has(getId(j))).map(markJustAnnounced);
  const fans = missing.filter(isFan);
  const pinned = fans.slice(0, Math.max(0, pinLimit));
  const pinnedIds = new Set(pinned.map(getId));
  // Fans that didn't fit the pin go first in the woven pool.
  const pool = [...fans.filter((f) => !pinnedIds.has(getId(f))), ...missing.filter((m) => !isFan(m))];

  const step = Math.max(1, spacing);
  const merged: T[] = [...pinned];
  let next = 0;
  ranked.forEach((event, index) => {
    merged.push(event);
    if (next < pool.length && (index + 1) % step === 0) {
      merged.push(pool[next]);
      next += 1;
    }
  });
  return [...merged, ...pool.slice(next)];
}
