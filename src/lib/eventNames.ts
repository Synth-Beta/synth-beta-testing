/**
 * `public.events` has no `artist_name` or `venue_name` column.
 *
 * The live JamBase sync (`scripts/sync-jambase-incremental-3nf.mjs`, wired up at
 * `backend/sync-routes.js:49`) destructures both out of the row before insert, so
 * PostgREST rejects any query naming them:
 *
 *     GET /rest/v1/events?select=artist_name  ->  400  42703
 *     column events.artist_name does not exist
 *
 * Because most call sites destructure only `data` and drop `error`, that 400 was
 * indistinguishable from "no events" and several features sat silently dead.
 *
 * Read names through the `artists` / `venues` relations instead, then flatten
 * them back onto the row so consumers keep reading `artist_name` / `venue_name`.
 */

/** Embed fragment to append inside an `events` select. */
export const EVENT_NAME_EMBED = 'artists(name), venues(name)';

/**
 * Use when filtering ON the name. `!inner` makes the filter apply to the event
 * row itself; without it PostgREST filters only the embedded object and every
 * event still comes back.
 */
export const EVENT_NAME_EMBED_ARTIST_INNER = 'artists!inner(name), venues(name)';
export const EVENT_NAME_EMBED_VENUE_INNER = 'artists(name), venues!inner(name)';

type EventRelations = {
  artists?: { name?: string | null } | null;
  venues?: { name?: string | null } | null;
};

// Constrain to Record<string, any>, not to EventRelations: a narrower constraint
// makes TS infer T as the constraint itself and silently drop every other column
// off the row (id, title, event_date, …).
type Named<T> = T & { artist_name: string | null; venue_name: string | null };

/** Flatten one embedded event row to the flat `artist_name` / `venue_name` shape. */
export function withEventNames<T extends Record<string, any>>(row: T): Named<T> {
  const rel = row as EventRelations;
  return {
    ...row,
    artist_name: rel?.artists?.name ?? null,
    venue_name: rel?.venues?.name ?? null,
  };
}

/** Flatten a list of embedded event rows. Tolerates null/undefined from a failed query. */
export function withEventNamesList<T extends Record<string, any>>(
  rows: T[] | null | undefined,
): Array<Named<T>> {
  return (rows ?? []).map(withEventNames);
}
