/**
 * Proves the ranked bucket list actually drives the feed:
 *  - it filters on artist_id, NOT the events.artist_name column (which does not exist —
 *    the JamBase sync strips artist_name/venue_name before insert, so the old
 *    .ilike('artist_name', ...) query returned an error and every bucket-list surface
 *    silently rendered zero events),
 *  - #1 on the list outranks #2 even when #2's show is sooner,
 *  - a location narrows the query to a bounding box.
 *
 * Run: node --experimental-strip-types packages/synth-shared/src/bucketListFeed.test.ts
 */

import assert from 'node:assert/strict';
import { getEventsFromRankedArtists, weaveBucketListIntoFeed } from './bucketListFeed.ts';

const ARTIST_1 = 'a1111111-1111-4111-8111-111111111111';
const ARTIST_2 = 'a2222222-2222-4222-8222-222222222222';

type Filter = { op: string; column: string; value: unknown };

function fakeClient(rows: Record<string, unknown>[], error: unknown = null) {
  const calls: { table?: string; select?: string; filters: Filter[] } = { filters: [] };
  const builder: any = {
    select(cols: string) {
      calls.select = cols;
      return builder;
    },
    then(resolve: (r: { data: unknown; error: unknown }) => unknown) {
      return Promise.resolve(resolve({ data: error ? null : rows, error }));
    },
  };
  for (const op of ['in', 'gte', 'lte', 'order', 'limit', 'ilike']) {
    builder[op] = (column: unknown, value: unknown) => {
      calls.filters.push({ op, column: String(column), value });
      return builder;
    };
  }
  return {
    calls,
    client: {
      from(table: string) {
        calls.table = table;
        return builder;
      },
    },
  };
}

const soon = new Date(Date.now() + 2 * 86400000).toISOString();
const later = new Date(Date.now() + 30 * 86400000).toISOString();

// #1's show is a month out, #2's is in two days. Rank must still win.
const rows = [
  { id: 'e-2', artist_id: ARTIST_2, event_date: soon, artists: { name: 'Second' }, venues: { name: 'Club B' } },
  { id: 'e-1', artist_id: ARTIST_1, event_date: later, artists: { name: 'First' }, venues: { name: 'Club A' } },
];

async function main() {
  // 1. Matches on artist_id, never on a nonexistent artist_name column.
  const a = fakeClient(rows);
  const ranked = await getEventsFromRankedArtists(a.client, [
    { id: ARTIST_1, name: 'First' },
    { id: ARTIST_2, name: 'Second' },
  ]);

  assert.equal(a.calls.table, 'events');
  assert.ok(a.calls.select?.includes('artists(name)'), 'must join artist names, not read events.artist_name');
  assert.ok(!a.calls.filters.some((f) => f.column === 'artist_name'), 'events has no artist_name column');
  const inFilter = a.calls.filters.find((f) => f.op === 'in');
  assert.deepEqual(inFilter, { op: 'in', column: 'artist_id', value: [ARTIST_1, ARTIST_2] });

  // 2. Rank beats date, and the reason carries the 1-based rank.
  assert.deepEqual(
    ranked.map((e) => e.id),
    ['e-1', 'e-2']
  );
  assert.equal(ranked[0].bucket_rank, 0);
  assert.equal(ranked[0].bucket_reason, '#1 on your bucket list');
  assert.equal(ranked[0].artist_name, 'First');
  assert.equal(ranked[0].venue_name, 'Club A');
  assert.equal(ranked[1].bucket_reason, '#2 on your bucket list');

  // 3. `near` adds a lat/lng bounding box; without it there is none.
  const b = fakeClient(rows);
  await getEventsFromRankedArtists(b.client, [{ id: ARTIST_1, name: 'First' }], {
    near: { lat: 40, lng: -74, radiusMiles: 50 },
  });
  const box = b.calls.filters.filter((f) => f.column === 'latitude' || f.column === 'longitude');
  assert.equal(box.length, 4, 'expected a 4-sided bounding box');
  assert.ok(a.calls.filters.every((f) => f.column !== 'latitude'), 'no box when no location given');

  // 4. An empty list short-circuits — no query at all.
  const c = fakeClient(rows);
  assert.deepEqual(await getEventsFromRankedArtists(c.client, []), []);
  assert.equal(c.calls.table, undefined);

  // 5. A query error yields [] rather than throwing into the feed.
  const d = fakeClient([], { code: '42703', message: 'column does not exist' });
  assert.deepEqual(await getEventsFromRankedArtists(d.client, [{ id: ARTIST_1, name: 'First' }]), []);

  console.log('bucketListFeed: all assertions passed');
}

void main();

// ---------------------------------------------------------------------------
// weaveBucketListIntoFeed — bucket list is woven into the ranked feed, never pinned.
// Run: node --experimental-strip-types packages/synth-shared/src/bucketListFeed.test.ts
// ---------------------------------------------------------------------------
{
  const feed = (n: number) => Array.from({ length: n }, (_, i) => ({ event_id: `r${i}` }));

  // Nothing to weave: feed is untouched.
  assert.deepEqual(weaveBucketListIntoFeed(feed(3), []), feed(3));

  // A bucket event the ranker already returned is NOT duplicated and NOT moved.
  const already = [{ event_id: 'r1' }];
  assert.deepEqual(weaveBucketListIntoFeed(feed(3), already), feed(3));

  // The feed still opens on the ranker's top pick — never on a bucket event.
  const woven = weaveBucketListIntoFeed(feed(8), [{ event_id: 'b0' }, { event_id: 'b1' }], 4);
  assert.equal(woven[0].event_id, 'r0');
  // Injected after every 4th ranker event.
  assert.equal(woven[4].event_id, 'b0');
  assert.equal(woven[9].event_id, 'b1');
  assert.equal(woven.length, 10);

  // Bucket events that do not fit are appended, never dropped.
  const overflow = weaveBucketListIntoFeed(feed(2), [{ event_id: 'b0' }, { event_id: 'b1' }], 4);
  assert.equal(overflow.length, 4);
  assert.ok(overflow.some((e) => e.event_id === 'b0'));
  assert.ok(overflow.some((e) => e.event_id === 'b1'));

  // Degenerate spacing must not inject after every single event.
  const clamped = weaveBucketListIntoFeed(feed(4), [{ event_id: 'b0' }], 0);
  assert.equal(clamped[0].event_id, 'r0');
  assert.equal(clamped.length, 5);

  console.log('weaveBucketListIntoFeed: all checks passed');
}
