/**
 * Run: node --experimental-strip-types --test packages/synth-shared/src/musicImports.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { strToU8, zipSync } from 'fflate';
import { isSpotifyHistoryFile, readSpotifyExportFiles, summarizeSpotifyExport } from './musicImports.ts';

const accountData = JSON.stringify([
  { endTime: '2026-01-01 10:00', artistName: 'Old Fav', trackName: 'Old Song', msPlayed: 200_000 },
  { endTime: '2026-10-01 10:00', artistName: 'Fresh', trackName: 'Hit', msPlayed: 180_000 },
  { endTime: '2026-10-02 10:00', artistName: 'Fresh', trackName: 'Hit', msPlayed: 180_000 },
  { endTime: '2026-10-03 10:00', artistName: 'Skipped', trackName: 'Nope', msPlayed: 5_000 },
]);
const extended = JSON.stringify([
  { ts: '2026-10-04T10:00:00Z', master_metadata_album_artist_name: 'fresh', master_metadata_track_name: 'Other', ms_played: 60_000 },
  { ts: '2026-10-04T11:00:00Z', master_metadata_album_artist_name: null, master_metadata_track_name: null, ms_played: 900_000 },
]);

test('recognizes both export file name formats and ignores the rest', () => {
  assert.equal(isSpotifyHistoryFile('Spotify Account Data/StreamingHistory_music_0.json'), true);
  assert.equal(isSpotifyHistoryFile('StreamingHistory0.json'), true);
  assert.equal(isSpotifyHistoryFile('Spotify Extended Streaming History/Streaming_History_Audio_2025-2026_3.json'), true);
  assert.equal(isSpotifyHistoryFile('Spotify Account Data/Userdata.json'), false);
  assert.equal(isSpotifyHistoryFile('StreamingHistory_podcast_0.json'), false);
});

test('reads history out of a zip and skips unrelated entries', () => {
  const zip = zipSync({
    'Spotify Account Data/StreamingHistory_music_0.json': strToU8(accountData),
    'Spotify Account Data/Userdata.json': strToU8('{"email":"x"}'),
  });
  const texts = readSpotifyExportFiles([{ name: 'my_spotify_data.zip', bytes: zip }]);
  assert.deepEqual(texts, [accountData]);
});

test('ranks by plays per range relative to the newest play, merging names case-insensitively', () => {
  const s = summarizeSpotifyExport([accountData, extended])!;
  assert.equal(s.totalPlays, 4, 'skips (<30s) and podcast rows are not plays');
  assert.deepEqual(s.topArtistsByTimeRange.short_term.map((a) => [a.name, a.playcount]), [['Fresh', 3]]);
  assert.deepEqual(s.topArtistsByTimeRange.long_term.map((a) => a.name), ['Fresh', 'Old Fav']);
  assert.equal(s.topTracksByTimeRange.short_term[0]!.name, 'Hit');
  assert.equal(s.periodEnd, '2026-10-04T10:00:00.000Z');
});

test('returns null when nothing usable was uploaded', () => {
  assert.equal(summarizeSpotifyExport(['not json', '{"a":1}']), null);
});
