/**
 * Proves the review event picker actually returns past shows.
 *
 * The bug this guards: the old query ordered by event_date DESC, took 50 rows,
 * then filtered to past ones in JS. For any artist with upcoming tour dates all
 * 50 rows were future shows, so the picker was permanently empty.
 *
 * Run: node --experimental-strip-types packages/synth-shared/src/reviewEventSearch.test.ts
 */

import assert from 'node:assert/strict';
import { searchPastEventsForReview } from './forgivingNameSearch.ts';

type Filter = { op: string; column: string; value: unknown };

/** `events` returns `rows`; artists/venues lookups return `lookups[table]`. */
function fakeClient(
  rows: Record<string, unknown>[],
  error: unknown = null,
  lookups: Record<string, Array<{ id: string; name: string }>> = {}
) {
  const calls: { tables: string[]; filters: Filter[]; lookups: Filter[] } = { tables: [], filters: [], lookups: [] };
  const from = (table: string) => {
    calls.tables.push(table);
    const isEvents = table === 'events';
    let term = '';
    const builder: any = {
      select: () => builder,
      then(resolve: (r: { data: unknown; error: unknown }) => unknown) {
        if (!isEvents) {
          const hits = (lookups[table] ?? []).filter((r) => r.name.toLowerCase().includes(term));
          return Promise.resolve(resolve({ data: hits, error: null }));
        }
        return Promise.resolve(resolve({ data: error ? null : rows, error }));
      },
    };
    for (const op of ['or', 'ilike', 'lt', 'gte', 'order', 'limit']) {
      builder[op] = (column: unknown, value: unknown) => {
        const f = { op, column: String(column), value: op === 'or' ? column : value };
        (isEvents ? calls.filters : calls.lookups).push(f);
        if (op === 'ilike') term = String(value).replace(/%/g, '').toLowerCase();
        return builder;
      };
    }
    return builder;
  };
  return { calls, client: { from } as any };
}

const NOW = new Date(2026, 8, 23, 12, 0, 0); // 2026-09-23 local
const row = (id: string, date: string, artist = 'Gracie Abrams', venue = 'The Anthem') => ({
  id,
  title: 't',
  artists: { name: artist },
  venues: { name: venue },
  event_date: date,
  artist_id: 'a1',
  venue_id: 'v1',
});

async function main() {
  // 1. The past cutoff is pushed into the query, not applied after the limit.
  const a = fakeClient([row('e1', new Date(2026, 7, 1, 20, 0, 0).toISOString())]);
  await searchPastEventsForReview(a.client, 'gracie', { now: NOW });
  assert.ok(a.calls.tables.includes('events'), 'events are read from the base table by id');
  const lt = a.calls.filters.find((f) => f.op === 'lt');
  assert.deepEqual(lt, { op: 'lt', column: 'event_date', value: '2026-09-24' },
    'cutoff must be in the query, one day loose for timestamptz/local-day skew');

  // 2. Future rows the DB still returns are dropped; past rows survive.
  //    Dates are built locally: "past" is judged on the local calendar day, the
  //    same rule each app's isEventPast already uses, so a bare 00:00Z stamp
  //    would read as the previous day west of Greenwich.
  const localIso = (y: number, m: number, d: number) => new Date(y, m, d, 20, 0, 0).toISOString();
  const b = fakeClient([
    row('future', localIso(2026, 11, 1)),
    row('past', localIso(2026, 7, 1)),
    row('today', localIso(2026, 8, 23)),
  ]);
  const rows = await searchPastEventsForReview(b.client, 'gracie', { now: NOW });
  assert.deepEqual(rows.map((r) => r.id), ['past'], 'today and future are not reviewable');

  // 3. The view emits some events twice — the picker must not.
  const dupDate = new Date(2026, 7, 1, 20, 0, 0).toISOString();
  const c = fakeClient([row('dup', dupDate), row('dup', dupDate)]);
  assert.equal((await searchPastEventsForReview(c.client, 'gracie', { now: NOW })).length, 1);

  // 4. Short queries never hit the network; errors yield an empty list, not a throw.
  const d = fakeClient([row('x', new Date(2026, 7, 1, 20, 0, 0).toISOString())]);
  assert.deepEqual(await searchPastEventsForReview(d.client, 'g', { now: NOW }), []);
  assert.deepEqual(d.calls.tables, []);
  const e = fakeClient([], { message: 'boom' });
  assert.deepEqual(await searchPastEventsForReview(e.client, 'gracie', { now: NOW }), []);

  // 5. Keywords split across artist and venue: "gracie anthem" matches no single
  //    name, so it must pair artist-from-one-word with venue-from-another, and
  //    drop rows that don't contain every word.
  const f = fakeClient(
    [row('hit', localIso(2026, 7, 1)), row('miss', localIso(2026, 7, 2), 'Gracie Abrams', 'Madison Square Garden')],
    null,
    { artists: [{ id: 'a1', name: 'Gracie Abrams' }], venues: [{ id: 'v1', name: 'The Anthem' }] }
  );
  const split = await searchPastEventsForReview(f.client, 'gracie anthem', { now: NOW });
  assert.deepEqual(split.map((r) => r.id), ['hit']);
  assert.equal(split[0].artist_name_normalized, 'Gracie Abrams');
  assert.match(String(f.calls.filters.find((x) => x.op === 'or')?.value), /and\(artist_id\.in\.\(a1\),venue_id\.in\.\(v1\)\)/);

  // 6. A picked date narrows to that local day, with a one-day-loose window in the query.
  const g = fakeClient([row('d1', localIso(2026, 7, 1)), row('d2', localIso(2026, 7, 2))]);
  const onDay = await searchPastEventsForReview(g.client, 'gracie', { now: NOW, date: '2026-08-01' });
  assert.deepEqual(onDay.map((r) => r.id), ['d1']);
  assert.deepEqual(g.calls.filters.find((x) => x.op === 'gte'), { op: 'gte', column: 'event_date', value: '2026-07-31' });
  assert.deepEqual(g.calls.filters.find((x) => x.op === 'lt'), { op: 'lt', column: 'event_date', value: '2026-08-03' });

  console.log('reviewEventSearch: all assertions passed');
}

void main();
