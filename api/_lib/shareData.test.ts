/**
 * Run: node --experimental-strip-types --test api/_lib/shareData.test.ts
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchShareReview, isOgRequest, loadImageAsDataUrl, posterCacheControl } from './shareData.ts';

/** Minimal supabase stub: from(table).select().eq().maybeSingle() → rows[table]. */
function stubSb(rows: Record<string, unknown>) {
  const chain = (table: string): any => ({
    select: () => chain(table),
    eq: () => chain(table),
    maybeSingle: async () => ({ data: rows[table] ?? null }),
  });
  return { from: (table: string) => chain(table) } as any;
}

const review = { id: 'r1', rating: 4.5, review_text: 'Great', user_id: 'u1', events: null };

test('fetchShareReview hides draft and non-public reviews', async () => {
  const users = { name: 'Tej' };
  assert.equal(await fetchShareReview(stubSb({ reviews: { ...review, is_draft: true, is_public: true }, users }), 'r1'), null);
  assert.equal(await fetchShareReview(stubSb({ reviews: { ...review, is_draft: false, is_public: false }, users }), 'r1'), null);
  const shown = await fetchShareReview(stubSb({ reviews: { ...review, is_draft: null, is_public: null }, users }), 'r1');
  assert.equal(shown?.reviewer, 'Tej');
  assert.equal(shown?.rating, 4.5);
});

test('isOgRequest detects the poster route from query or rewritten URL', () => {
  assert.equal(isOgRequest({ og: '1' }, '/api/share?og=1'), true);
  assert.equal(isOgRequest({}, '/api/og?event=abc'), true);
  assert.equal(isOgRequest({}, '/api/og'), true);
  assert.equal(isOgRequest({}, '/api/share?event=abc'), false);
  assert.equal(isOgRequest({}, '/api/ogre'), false);
});

test('loadImageAsDataUrl times out instead of hanging', async () => {
  const hang = (_: string, init?: RequestInit) =>
    new Promise<Response>((_res, rej) => init?.signal?.addEventListener('abort', () => rej(new Error('aborted'))));
  const started = Date.now();
  assert.equal(await loadImageAsDataUrl('https://slow.test/a.jpg', 50, hang as any), '');
  assert.ok(Date.now() - started < 1000);
});

test('loadImageAsDataUrl returns a data URL for images and empty otherwise', async () => {
  const ok = async () => new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
  assert.equal(await loadImageAsDataUrl('https://x.test/a.jpg', 1000, ok as any), 'data:image/jpeg;base64,AQID');
  const html = async () => new Response('<html>', { headers: { 'content-type': 'text/html' } });
  assert.equal(await loadImageAsDataUrl('https://x.test/a', 1000, html as any), '');
  const notFound = async () => new Response('', { status: 404 });
  assert.equal(await loadImageAsDataUrl('https://x.test/a.jpg', 1000, notFound as any), '');
  assert.equal(await loadImageAsDataUrl('', 1000, ok as any), '');
});

test('posterCacheControl keeps fallbacks short-lived', () => {
  assert.equal(posterCacheControl(false), 'public, s-maxage=86400, stale-while-revalidate=604800');
  assert.equal(posterCacheControl(true), 'public, s-maxage=300');
});
