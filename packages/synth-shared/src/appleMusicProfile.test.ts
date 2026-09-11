import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildAppleMusicProfile } from './appleMusicProfile.ts';

const song = (id: string, name: string, artistName: string, genreNames: string[]) => ({
  id,
  attributes: { name, artistName, genreNames, artwork: { url: 'https://img/{w}x{h}.jpg' } },
});

test('ranks artists by listening (not alphabet), drops "Music", dedupes library copies', () => {
  const { topArtists, topTracks } = buildAppleMusicProfile({
    heavyRotation: [
      { attributes: { name: 'Clarity', artistName: 'Zedd', genreNames: ['Dance', 'Music'] } },
      { attributes: { name: 'Chill Mix' } }, // playlist: no artist, ignored
    ],
    recentlyPlayed: [
      song('1', 'Clarity', 'Zedd', ['Dance', 'Music']),
      song('2', 'Hello', 'Adele', ['Pop', 'Music']),
    ],
    library: [
      song('i.1', 'Dancing Queen', 'ABBA', ['Pop', 'Music']),
      song('i.2', 'Clarity', 'Zedd', ['Dance', 'Music']), // same song, library id
    ],
  });

  assert.deepEqual(topArtists.map((a) => a.name), ['Zedd', 'Adele', 'ABBA']);
  assert.deepEqual(topArtists[0].genres, ['Dance']);
  assert.deepEqual(topTracks.map((t) => t.name), ['Clarity', 'Hello', 'Dancing Queen']);
  assert.equal(topTracks[0].artists[0].name, 'Zedd');
  assert.equal(topTracks[0].album.images[0].url, 'https://img/300x300.jpg');
});

test('empty input yields empty profile (caller refuses to save it)', () => {
  const { topArtists, topTracks } = buildAppleMusicProfile({ heavyRotation: [], recentlyPlayed: [], library: [] });
  assert.equal(topArtists.length, 0);
  assert.equal(topTracks.length, 0);
});
