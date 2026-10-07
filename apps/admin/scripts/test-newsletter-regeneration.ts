/** Offline regression checks. Run with Node 24 + supplied extension resolver (see README). */
import assert from 'node:assert/strict';
import { generateDraftsFromSource } from '../src/lib/newsletterEdition/gather';
import { regenerateDecision, canSendDraft } from '../src/lib/newsletterEdition/gate';
import { readAll } from '../../../supabase/functions/newsletter-send/queries';

const now = new Date('2026-10-07T18:00:00Z');
const users = Array.from({ length: 135 }, (_, index) => ({ user_id: `user-${index}`, email: `user${index}@example.com`, name: `Reader${index}` }));
const empty = { users, news: [], reviews: [], stats: [], events: [], publicFives: [] };
const generated = await generateDraftsFromSource(empty, now, '2026-10-07');
assert.equal(generated.editionDate, '2026-10-07', 'explicit edition must not roll to tomorrow');
assert.equal(generated.drafts.length, 135, 'every eligible sparse reader must receive a reviewable draft');
assert.equal(generated.held, 0);
assert.match(generated.drafts[0].html, /Build your live music timeline/);
assert.doesNotMatch(generated.drafts[0].html, /Tickets are listed as available/);
assert.notEqual(generated.drafts[0].html, generated.drafts[1].html);

const news = [{ id: 'story', title: 'Festival announces its lineup', url: 'https://example.com/music', created_at: '2026-10-06T12:00:00Z' }];
const general = await generateDraftsFromSource({ ...empty, news }, now);
assert.match(general.drafts[0].html, /Festival announces its lineup/);
assert.doesNotMatch(general.drafts[0].html, /artist you already follow/);
const stale = await generateDraftsFromSource({ ...empty, news: [{ ...news[0], created_at: '2025-01-01' }] }, now);
assert.doesNotMatch(stale.drafts[0].html, /Festival announces its lineup/);

const reviews = Array.from({ length: 13 }, (_, index) => ({ user_id: users[0].user_id, user_created_artists: { name: `Manual artist ${index}` }, venues: { name: 'Venue' }, Event_date: '2026-09-01', rating: index < 7 ? 5 : 4 }));
const active = await generateDraftsFromSource({ ...empty, reviews }, now);
assert.match(active.drafts[0].html, /13 shows logged\. 7 five-star nights/);
assert.match(active.drafts[0].html, /Manual artist/);
const streaming = await generateDraftsFromSource({ ...empty, stats: [
  { user_id: users[0].user_id, top_artists: ['Wilco'], top_genres: ['rock'] },
  { user_id: users[0].user_id, top_artists: [{ name: 'Goose' }], top_genres: [{ genre: 'jam' }] },
] }, now);
assert.match(streaming.drafts[0].html, /Wilco/);
assert.match(streaming.drafts[0].html, /Goose/);
const duplicates = await generateDraftsFromSource({ ...empty, users: [...users, { user_id: 'duplicate', email: 'USER0@example.com' }] }, now);
assert.equal(duplicates.drafts.length, 135);

assert.equal(regenerateDecision({ status: 'approved' }), 'replace');
assert.equal(regenerateDecision({ status: 'sent' }), 'keep');
assert.equal(canSendDraft({ id: 'd', editionDate: '2026-10-07', userId: 'u', email: 'u@example.com', subject: 's', html: 'h', contentHash: 'new', status: 'needs_approval', approvedContentHash: null, sentAt: null }, new Set()).ok, false);
let pages = 0;
const rows = await readAll(() => ({ range: async (from: number, to: number) => {
  pages++;
  return { data: Array.from({ length: Math.max(0, Math.min(1201, to + 1) - from) }, (_, i) => ({ id: from + i })), error: null };
} }), 'Test pagination');
assert.equal(rows.length, 1201);
assert.equal(pages, 3);
await assert.rejects(readAll(() => ({ range: async () => ({ data: null, error: { message: 'database unavailable' } }) }), 'Reviews'), /Reviews: database unavailable/);
console.log('PASS: 135 recipients; explicit edition; honest fallback; full history; custom artists; streaming merge; deduplication; approval reset; pagination; query errors.');
