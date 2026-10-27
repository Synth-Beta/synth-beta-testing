import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLastfmUsername } from './lastfm.ts';

test('accepts a bare name, @name, or a pasted profile URL', () => {
  assert.equal(normalizeLastfmUsername('  rj_music '), 'rj_music');
  assert.equal(normalizeLastfmUsername('@rj_music'), 'rj_music');
  assert.equal(normalizeLastfmUsername('https://www.last.fm/user/rj_music'), 'rj_music');
  assert.equal(normalizeLastfmUsername('last.fm/de/user/Rj-Music?tab=x'), 'Rj-Music');
});

test('rejects anything that cannot be a Last.fm username', () => {
  assert.equal(normalizeLastfmUsername(''), null);
  assert.equal(normalizeLastfmUsername('a'), null);
  assert.equal(normalizeLastfmUsername('1abc'), null);
  assert.equal(normalizeLastfmUsername('has space'), null);
  assert.equal(normalizeLastfmUsername('waytoolongusername1'), null);
  assert.equal(normalizeLastfmUsername(42), null);
});
