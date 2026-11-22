import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_CALENDAR_TASTE, genreSlug, rankCalendarDayEvents } from './calendarDayRank.ts';

const ev = (id: string, hour: number, extra: Record<string, unknown> = {}) => ({
  id,
  event_date: `2026-12-05T${String(hour).padStart(2, '0')}:00:00Z`,
  ...extra,
});

test('genreSlug matches genre_preference_scores keys', () => {
  assert.equal(genreSlug('Hip-Hop/Rap'), 'hip-hop-rap');
  assert.equal(genreSlug('R&B'), 'r-b');
  assert.equal(genreSlug('rhythm-and-blues-soul'), 'rhythm-and-blues-soul');
});

test('followed artist > followed venue > liked genre > time', () => {
  const taste = {
    artistIds: new Set(['a1']),
    venueIds: new Set(['v1']),
    genreScores: { jazz: 2, rock: 1 },
  };
  const events = [
    ev('early-nothing', 18),
    ev('rock', 19, { genres: ['Rock'] }),
    ev('jazz', 22, { genres: ['Jazz', 'pop'] }),
    ev('venue', 23, { venue_id: 'v1' }),
    ev('artist', 23, { artist_id: 'a1' }),
  ];
  assert.deepEqual(
    rankCalendarDayEvents(events, taste).map((e) => e.id),
    ['artist', 'venue', 'jazz', 'rock', 'early-nothing']
  );
});

test('no taste keeps time order', () => {
  const events = [ev('late', 22), ev('early', 18, { genres: ['jazz'] })];
  assert.deepEqual(rankCalendarDayEvents(events, EMPTY_CALENDAR_TASTE).map((e) => e.id), ['early', 'late']);
});
