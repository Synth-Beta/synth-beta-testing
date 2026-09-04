/**
 * Timeline must render show names (not "Concert") and sort by show date.
 *
 * Both regressions came from the same place: the review flow leaves
 * `reviews.event_id` null, so the `events` embed is null and the row's own
 * artist_id/venue_id are the only names available — while the list was ordered
 * by created_at but displayed Event_date.
 *
 * The select list is load-bearing too: `reviews.user_created_venue_id` only
 * exists after supabase/user-created-venues-2026-09-04/02_*.sql, and asking a
 * DB without it answers 42703 — which a caught error turns into a blank
 * passport rather than a visible failure. So both DB shapes are tested here.
 *
 * Run: npx tsx packages/synth-shared/src/reviewTimelineCore.test.ts
 */

import assert from 'node:assert/strict';
import { fetchProfileReviewTimeline } from './reviewTimelineCore';

const REVIEWS = [
  // Reviewed most recently, but the oldest show.
  {
    id: 'r1',
    rating: 3.5,
    created_at: '2026-09-01T00:00:00Z',
    Event_date: '2025-09-14T00:00:00Z',
    event_id: null,
    artist_id: 'a1',
    venue_id: 'v1',
    user_created_artist_id: null,
    user_created_venue_id: null,
    photos: null,
    events: null,
  },
  // Newest show, reviewed first. Both sides user-created.
  {
    id: 'r2',
    rating: 4,
    created_at: '2026-01-01T00:00:00Z',
    Event_date: '2026-03-02T00:00:00Z',
    event_id: null,
    artist_id: null,
    venue_id: null,
    user_created_artist_id: 'ua1',
    user_created_venue_id: 'uv1',
    photos: ['https://example.com/p.jpg'],
    events: null,
  },
  // No artist and no venue at all — still has to render something.
  {
    id: 'r3',
    rating: 5,
    created_at: '2026-02-01T00:00:00Z',
    Event_date: '2025-12-25T00:00:00Z',
    event_id: null,
    artist_id: null,
    venue_id: null,
    user_created_artist_id: null,
    user_created_venue_id: null,
    photos: null,
    events: null,
  },
];

const NAMES: Record<string, Record<string, string>> = {
  artists: { a1: 'Phoebe Bridgers' },
  venues: { v1: 'Red Rocks' },
  user_created_artists: { ua1: 'Local Openers' },
  user_created_venues: { uv1: "Dave's Garage" },
};

/** `hasVenueColumn: false` models a DB where 02_*.sql has not been applied. */
function makeClient(hasVenueColumn: boolean) {
  const selects: string[] = [];
  const client = {
    from(table: string) {
      if (table === 'reviews') {
        return {
          select: (cols: string) => {
            selects.push(cols);
            const missing = !hasVenueColumn && cols.includes('user_created_venue_id');
            const result = missing
              ? { data: null, error: { code: '42703', message: 'column reviews.user_created_venue_id does not exist' } }
              : {
                  data: REVIEWS.map((r) =>
                    hasVenueColumn ? r : Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'user_created_venue_id'))
                  ),
                  error: null,
                };
            return { eq: () => ({ or: () => Promise.resolve(result) }) };
          },
        };
      }
      return {
        select: () => ({
          in: (_col: string, ids: string[]) =>
            Promise.resolve({
              data: ids.map((id) => ({ id, name: NAMES[table]?.[id] })).filter((r) => r.name),
              error: null,
            }),
        }),
      };
    },
  };
  return { client, selects };
}

// --- DB with the migration applied -----------------------------------------
{
  const { client, selects } = makeClient(true);
  const items = await fetchProfileReviewTimeline(client, 'user-1');

  assert.equal(selects.length, 1, 'no retry needed when the column exists');
  assert.deepEqual(
    items.map((i) => i.id),
    ['r2', 'r3', 'r1'],
    'timeline must be newest-show-first, not newest-review-first'
  );
  assert.equal(items[2].title, 'Phoebe Bridgers at Red Rocks');
  assert.equal(items[2].subtitle, '3.5 stars');
  assert.equal(items[0].title, "Local Openers at Dave's Garage", 'user-created names must resolve');
  assert.equal(items[0].image_url, 'https://example.com/p.jpg');
  assert.equal(items[1].title, 'Concert', 'nameless review keeps the old fallback');
}

// --- DB without the migration ----------------------------------------------
{
  const { client, selects } = makeClient(false);
  const items = await fetchProfileReviewTimeline(client, 'user-1');

  assert.equal(selects.length, 2, '42703 must trigger exactly one retry');
  assert.ok(!selects[1].includes('user_created_venue_id'), 'the retry must drop the missing column');
  assert.equal(items.length, 3, 'a DB without the column still renders a full timeline, not a blank one');
  assert.equal(items[2].title, 'Phoebe Bridgers at Red Rocks');
  assert.equal(items[0].title, 'Local Openers', 'venue unknown, artist still names the card');
}

console.log('reviewTimelineCore: OK');
