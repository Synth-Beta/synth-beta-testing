import { test } from 'node:test';
import assert from 'node:assert/strict';
import { boostEventsByArtistAffinity, type ArtistAffinity } from './artistAffinity.ts';

type Ev = { id: string; artist_id?: string | null; artist_name?: string | null };

const affinity = (names: string[], ids: string[]): ArtistAffinity => ({
  topStreamingArtistNames: new Set(names),
  reviewedArtistIds: new Set(ids),
});

const ids = (events: Ev[]) => events.map((e) => e.id);

test('matches move to the front, everything keeps the ranker order', () => {
  const events: Ev[] = [
    { id: 'a', artist_id: 'x1', artist_name: 'Unknown Act' },
    { id: 'b', artist_id: 'x2', artist_name: 'Fred again..' },
    { id: 'c', artist_id: 'x3', artist_name: 'Another Act' },
    { id: 'd', artist_id: 'x4', artist_name: 'Someone Else' },
  ];
  // 'b' matches on streaming name, 'd' on a reviewed artist_id.
  const out = boostEventsByArtistAffinity(events, affinity(['fred again..'], ['x4']));
  assert.deepEqual(ids(out), ['b', 'd', 'a', 'c']);
});

test('artist names match case- and whitespace-insensitively', () => {
  const events: Ev[] = [
    { id: 'a', artist_id: 'x1', artist_name: 'Nobody' },
    { id: 'b', artist_id: 'x2', artist_name: '  FISHER  ' },
  ];
  assert.deepEqual(ids(boostEventsByArtistAffinity(events, affinity(['fisher'], []))), ['b', 'a']);
});

test('empty affinity returns the input untouched', () => {
  const events: Ev[] = [{ id: 'a' }, { id: 'b' }];
  const out = boostEventsByArtistAffinity(events, affinity([], []));
  assert.equal(out, events, 'should short-circuit to the same array, not a copy');
});

test('null artist fields never count as a match', () => {
  const events: Ev[] = [
    { id: 'a', artist_id: null, artist_name: null },
    { id: 'b', artist_id: 'x2', artist_name: 'Skrillex' },
  ];
  // An empty-string name in the set must not match a null artist_name.
  assert.deepEqual(ids(boostEventsByArtistAffinity(events, affinity([''], []))), ['a', 'b']);
  assert.deepEqual(ids(boostEventsByArtistAffinity(events, affinity(['skrillex'], []))), ['b', 'a']);
});
