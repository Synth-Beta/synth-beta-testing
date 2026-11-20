import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  distanceMiles,
  fetchArtistUpcomingEvents,
  sortEventsNearestFirst,
} from './artistEventsNearby.ts';

const NYC = { latitude: 40.7128, longitude: -74.006 };
const ev = (id: string, date: string, lat: number | null, lng: number | null, extra: object = {}) => ({
  id,
  event_date: date,
  latitude: lat,
  longitude: lng,
  ...extra,
});

test('distanceMiles: NYC to LA is about 2,450 miles', () => {
  const d = distanceMiles(NYC, { latitude: 34.0522, longitude: -118.2437 });
  assert.ok(d > 2400 && d < 2500, String(d));
});

test('nearest first, then by date; same venue listed soonest first', () => {
  const rows = [
    ev('la', '2026-12-01', 34.05, -118.24),
    ev('msg-late', '2027-03-01', 40.7505, -73.9934),
    ev('philly', '2026-11-25', 39.95, -75.16),
    ev('msg-early', '2027-01-15', 40.7505, -73.9934),
  ];
  assert.deepEqual(
    sortEventsNearestFirst(rows, NYC).map((r) => r.id),
    ['msg-early', 'msg-late', 'philly', 'la'],
  );
});

test('events without coordinates go last, by date; venue coords are used as a fallback', () => {
  const rows = [
    ev('nowhere-late', '2027-05-01', null, null),
    ev('nowhere-early', '2027-01-01', null, null),
    ev('venue-coords', '2027-02-01', null, null, { venue_latitude: 40.75, venue_longitude: -73.99 }),
    ev('embedded-venue', '2027-03-01', null, null, { venues: { latitude: 40.75, longitude: -73.99 } }),
    ev('zero-placeholder', '2026-12-01', 0, 0),
    ev('boston', '2027-06-01', 42.36, -71.06),
  ];
  assert.deepEqual(
    sortEventsNearestFirst(rows, NYC).map((r) => r.id),
    ['venue-coords', 'embedded-venue', 'boston', 'zero-placeholder', 'nowhere-early', 'nowhere-late'],
  );
});

test('no viewer location -> plain date order', () => {
  const rows = [ev('b', '2027-02-01', 1, 1), ev('a', '2027-01-01', 50, 50)];
  assert.deepEqual(sortEventsNearestFirst(rows, null).map((r) => r.id), ['a', 'b']);
});

// Minimal fake of the supabase-js query builder used by fetchArtistUpcomingEvents.
function fakeClient(rows: any[], rpcResult: { data: any; error: any }) {
  const calls: string[] = [];
  const builder = (state: { from: number; to: number }) => ({
    select: () => builder(state),
    in: () => builder(state),
    gte: () => builder(state),
    order: () => builder(state),
    range: (from: number, to: number) => {
      calls.push(`range:${from}-${to}`);
      return Promise.resolve({ data: rows.slice(from, to + 1), error: null });
    },
  });
  return {
    calls,
    from: () => builder({ from: 0, to: 0 }),
    rpc: (name: string) => {
      calls.push(`rpc:${name}`);
      return Promise.resolve(rpcResult);
    },
  };
}

test('fetch: uses the SQL function when available', async () => {
  const c = fakeClient([], { data: [{ id: 'from-rpc' }], error: null });
  const out = await fetchArtistUpcomingEvents(c, { artistIds: ['x'], fromIso: '2026-11-19', origin: NYC, limit: 20 });
  assert.deepEqual(out, [{ id: 'from-rpc' }]);
  assert.deepEqual(c.calls, ['rpc:get_artist_upcoming_events_nearby']);
});

test('fetch: falls back to device-side sort when the function is missing', async () => {
  const rows = [ev('la', '2026-12-01', 34.05, -118.24), ev('nyc', '2027-01-01', 40.75, -73.99)];
  const c = fakeClient(rows, { data: null, error: { code: 'PGRST202', message: 'function not found' } });
  const out = await fetchArtistUpcomingEvents<any>(c, { artistIds: ['x'], fromIso: '2026-11-19', origin: NYC, limit: 1 });
  assert.deepEqual(out.map((r) => r.id), ['nyc']);
});

test('fetch: no location -> date-ordered page, no RPC call', async () => {
  const rows = [ev('a', '2026-12-01', 1, 1), ev('b', '2027-01-01', 1, 1), ev('c', '2027-02-01', 1, 1)];
  const c = fakeClient(rows, { data: null, error: null });
  const out = await fetchArtistUpcomingEvents<any>(c, { artistIds: ['x'], fromIso: '2026-11-19', origin: null, limit: 2, offset: 1 });
  assert.deepEqual(out.map((r) => r.id), ['b', 'c']);
  assert.deepEqual(c.calls, ['range:1-2']);
});
