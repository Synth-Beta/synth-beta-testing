import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clearCatalogSearchCache, searchArtistsFuzzy } from './forgivingNameSearch.ts';

function client() {
  let calls = 0;
  return {
    get calls() {
      return calls;
    },
    rpc: async () => {
      calls++;
      return { data: [{ id: '1', name: 'Phish', match_score: 100 }], error: null };
    },
  };
}

test('repeat catalog searches within the TTL hit the cache (case/space-insensitive)', async () => {
  clearCatalogSearchCache();
  const c = client();
  const a = await searchArtistsFuzzy(c, 'Phish');
  const b = await searchArtistsFuzzy(c, '  phish ');
  assert.equal(c.calls, 1);
  assert.deepEqual(a.map((r) => r.name), ['Phish']);
  assert.deepEqual(b.map((r) => r.name), ['Phish']);
});

test('concurrent identical searches share one request; callers get separate arrays', async () => {
  clearCatalogSearchCache();
  const c = client();
  const [a, b] = await Promise.all([searchArtistsFuzzy(c, 'phish'), searchArtistsFuzzy(c, 'phish')]);
  assert.equal(c.calls, 1);
  assert.notEqual(a, b);
});

test('different limits are cached separately', async () => {
  clearCatalogSearchCache();
  const c = client();
  await searchArtistsFuzzy(c, 'phish', 5);
  await searchArtistsFuzzy(c, 'phish', 20);
  assert.equal(c.calls, 2);
});
