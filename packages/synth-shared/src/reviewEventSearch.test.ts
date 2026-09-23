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

function fakeClient(rows: Record<string, unknown>[], error: unknown = null) {
  const calls: { table?: string; filters: Filter[] } = { filters: [] };
  const builder: any = {
    select: () => builder,
    or: (value: unknown) => {
      calls.filters.push({ op: 'or', column: '*', value });
      return builder;
    },
    then(resolve: (r: { data: unknown; error: unknown }) => unknown) {
      return Promise.resolve(resolve({ data: error ? null : rows, error }));
    },
  };
  for (const op of ['lt', 'gte', 'order', 'limit']) {
    builder[op] = (column: unknown, value: unknown) => {
      calls.filters.push({ op, column: String(column), value });
      return builder;
    };
  }
  return { calls, client: { from: (t: string) => { calls.table = t; return builder; } } as any };
}

const NOW = new Date(2026, 8, 23, 12, 0, 0); // 2026-09-23 local
const row = (id: string, date: string) => ({
  id,
  title: 't',
  artist_name_normalized: 'Gracie Abrams',
  venue_name_normalized: 'The Anthem',
  event_date: date,
  artist_id: 'a1',
  venue_id: 'v1',
});

async function main() {
  // 1. The past cutoff is pushed into the query, not applied after the limit.
  const a = fakeClient([row('e1', new Date(2026, 7, 1, 20, 0, 0).toISOString())]);
  await searchPastEventsForReview(a.client, 'gracie', { now: NOW });
  assert.equal(a.calls.table, 'events_with_artist_venue');
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
  assert.equal(d.calls.table, undefined);
  const e = fakeClient([], { message: 'boom' });
  assert.deepEqual(await searchPastEventsForReview(e.client, 'gracie', { now: NOW }), []);

  console.log('reviewEventSearch: all assertions passed');
}

void main();
