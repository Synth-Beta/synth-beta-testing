/**
 * Small pure helpers shared by the JamBase sync scripts.
 *
 * Lives in its own module because sync-jambase-incremental-3nf.mjs calls main()
 * at the top level — importing that file would kick off a real sync run, so
 * nothing testable can live in it.
 */

/**
 * True when `next` would write nothing new over `current`.
 *
 * Used to skip no-op UPDATEs. The sync re-sees the same artists and venues on
 * every page of every run, and writing a row that did not change still costs a
 * new heap tuple, a rewrite of every index on the table, a WAL record, and a
 * dead tuple for autovacuum. Null and undefined are treated as the same absence
 * so a missing column never reads as a change.
 */
export function sameValue(current, next) {
  return JSON.stringify(current ?? null) === JSON.stringify(next ?? null);
}

/**
 * Fields that extractArtistData / extractVenueData always put in the payload but
 * that must NOT be written on an UPDATE. They are correct as defaults on INSERT
 * and wrong on every update after that:
 *
 *   last_synced_at       a fresh `new Date()` on every extract. Comparing it makes
 *                        every row look changed, so it defeats the no-op guard
 *                        outright. The update sets it explicitly anyway.
 *   num_upcoming_events  hardcoded 0 in the payload, but maintained in the database
 *                        by update_artist_upcoming_events_count /
 *                        update_venue_upcoming_events_count. Writing it zeroes a
 *                        counter the triggers then have to rebuild.
 *   verified             hardcoded false in the payload. Nothing recomputes this,
 *                        so writing it silently un-verifies anything an admin
 *                        verified by hand.
 *   typical_genres       hardcoded null in the venue payload; aggregated elsewhere.
 *   identifier           rewritten by the standardize_venue_name trigger from
 *                        `name`, so the raw "jambase:1234" here never matches what
 *                        is stored and never survives a write.
 */
export const SERVER_OWNED_FIELDS = [
  'last_synced_at',
  'num_upcoming_events',
  'verified',
  'typical_genres',
  'identifier',
];

/** Returns a copy of `payload` without the fields the server owns. */
export function stripServerOwned(payload) {
  const out = { ...payload };
  for (const key of SERVER_OWNED_FIELDS) delete out[key];
  return out;
}

/**
 * True when every field in `payload` already matches `existing` — i.e. an UPDATE
 * would be a no-op. `existing` being absent means "no stored row", so write.
 */
export function isUnchanged(existing, payload) {
  if (!existing) return false;
  return Object.keys(payload).every((key) => sameValue(existing[key], payload[key]));
}
