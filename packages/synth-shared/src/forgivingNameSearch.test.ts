import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  forgivingIlikePatterns,
  scoreNameMatch,
} from './forgivingNameSearch.ts';

test('substring queries match names with extra words', () => {
  assert.ok(scoreNameMatch('grateful', 'Grateful Dead') >= 90);
  assert.ok(scoreNameMatch('dead', 'Grateful Dead') >= 90);
  assert.ok(scoreNameMatch('weekend', 'Vampire Weekend') >= 90);
});

test('search is case-insensitive', () => {
  assert.equal(scoreNameMatch('grateful', 'Grateful Dead'), scoreNameMatch('GRATEFUL', 'Grateful Dead'));
  assert.equal(scoreNameMatch('weekend', 'The Weeknd'), scoreNameMatch('WEEKEND', 'The Weeknd'));
});

test('a close typo still scores as a strong match', () => {
  assert.ok(scoreNameMatch('weekend', 'The Weeknd') >= 80);
  assert.ok(scoreNameMatch('gratefl', 'Grateful Dead') >= 80);
});

test('exact and prefix matches rank above weaker contains matches', () => {
  const exact = scoreNameMatch('grateful dead', 'Grateful Dead');
  const prefix = scoreNameMatch('grateful', 'Grateful Dead');
  const tribute = scoreNameMatch('grateful', 'Cats on the Bus (Grateful Dead Tribute)');
  const typo = scoreNameMatch('weekend', 'The Weeknd');
  const weakContains = scoreNameMatch('weekend', 'Memorial Day Weekend Kick Off Alegria Patio');

  assert.equal(exact, 100);
  assert.ok(prefix > tribute);
  assert.ok(typo > weakContains);
});

test('ilike fallback patterns include 1-character deletions', () => {
  const patterns = forgivingIlikePatterns('weekend');
  assert.ok(patterns.includes('%weekend%'));
  assert.ok(patterns.includes('%weeknd%'));
});

test('partial tokens and typos still match Gracie Abrams', () => {
  assert.ok(scoreNameMatch('grace ab', 'Gracie Abrams') >= 85);
  assert.ok(scoreNameMatch('gtacie ab', 'Gracie Abrams') >= 80);
  assert.ok(scoreNameMatch('gracie', 'Gracie Abrams') >= 90);
});

test('ilike patterns expand multi-word queries and substitutions', () => {
  const grace = forgivingIlikePatterns('grace ab');
  assert.ok(grace.includes('%grace%ab%'));

  const typo = forgivingIlikePatterns('gtacie ab');
  assert.ok(typo.some((pattern) => pattern.includes('g_acie') || pattern === '% ab%'));
});
