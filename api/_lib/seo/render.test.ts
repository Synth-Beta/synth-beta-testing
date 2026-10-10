import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  renderArtistPage,
  renderCityPage,
  renderSitemap,
  renderVenuePage,
  slugifyGenre,
  ticketHref,
  weekendWindow,
  type SeoEvent,
} from './render.ts';
import { classifyBot } from './bots.ts';

const TICKET = 'https://app.opendate.io/e/show-743804?utm_source=jambase&x=1';

const event = (overrides: Partial<SeoEvent> = {}): SeoEvent => ({
  id: 'e1',
  title: 'Band <b>One</b> at Club',
  event_date: '2026-10-10T01:30:00+00:00',
  event_status: 'scheduled',
  ticket_urls: [TICKET, 'https://stubhub.example/second'],
  external_url: 'https://www.jambase.com/show/band-one',
  genres: ['Rock'],
  artist: { id: 'a1', name: 'Band One', slug: 'band-one' },
  venue: { id: 'v1', name: '9:30 Club', slug: '9-30-club-washington', city: 'Washington', state: 'District of Columbia' },
  ...overrides,
});

const venue = { id: 'v1', name: 'Evil </script><script>alert(1)</script> Venue', slug: 'evil-venue', city: 'Washington', state: 'District of Columbia', street_address: null };

test('ticket link: primary ticket URL unmodified, then JamBase event URL, then none', () => {
  assert.equal(ticketHref(event()), TICKET);
  assert.equal(ticketHref(event({ ticket_urls: [] })), 'https://www.jambase.com/show/band-one');
  assert.equal(ticketHref(event({ ticket_urls: [{ url: TICKET }] })), TICKET);
  assert.equal(ticketHref(event({ ticket_urls: ['javascript:alert(1)'], external_url: null })), null);
});

test('every page carries JamBase attribution and nofollow ticket links', () => {
  const pages = [
    renderVenuePage({ venue, events: [event()], total: 1, indexable: true }),
    renderArtistPage({ artist: { id: 'a1', name: 'Band One', slug: 'band-one', genres: ['rock'] }, events: [event()], total: 1, indexable: true }),
    renderCityPage({ cityName: 'Washington, DC', citySlug: 'washington-dc', view: { kind: 'all' }, events: [event()], genres: [], indexable: true }),
  ];
  for (const html of pages) {
    assert.match(html, /<a href="https:\/\/www\.jambase\.com" rel="nofollow">Powered by JamBase<\/a>/);
    // The ticket URL appears HTML-escaped (& -> &amp;) but otherwise unchanged.
    assert.ok(html.includes(`href="${TICKET.replace(/&/g, '&amp;')}" rel="nofollow noopener"`));
    assert.match(html, /<link rel="canonical" href="https:\/\//);
  }
});

test('user data is escaped in HTML and cannot break out of JSON-LD', () => {
  const html = renderVenuePage({ venue, events: [event()], total: 1, indexable: true });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<b>One</b>'));
  for (const block of html.match(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g) ?? []) {
    const inner = block.slice(block.indexOf('>') + 1, -'</script>'.length);
    assert.ok(!inner.includes('<'), 'raw < inside JSON-LD');
    JSON.parse(inner);
  }
});

test('noindex unless indexable', () => {
  assert.match(renderVenuePage({ venue, events: [], total: 0, indexable: false }), /<meta name="robots" content="noindex, follow">/);
  assert.match(renderVenuePage({ venue, events: [], total: 0, indexable: true }), /<meta name="robots" content="index, follow">/);
});

test('cancelled shows are labelled', () => {
  assert.match(renderVenuePage({ venue, events: [event({ event_status: 'cancelled' })], total: 1, indexable: false }), /Cancelled/);
});

test('sitemap escapes URLs', () => {
  assert.equal(renderSitemap([]).includes('<url>'), false);
  assert.match(renderSitemap(['https://join.getsynth.app/venues/a&b']), /<loc>https:\/\/join\.getsynth\.app\/venues\/a&amp;b<\/loc>/);
});

test('bot classification', () => {
  assert.deepEqual(classifyBot('Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)'), { name: 'Googlebot', category: 'search' });
  assert.deepEqual(classifyBot('Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko; compatible; Claude-SearchBot/1.0)'), { name: 'Claude-SearchBot', category: 'ai' });
  assert.deepEqual(classifyBot('Mozilla/5.0 (compatible; GPTBot/1.2; +https://openai.com/gptbot)'), { name: 'GPTBot', category: 'ai' });
  assert.equal(classifyBot('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1'), null);
});

test('genre slugs match public.seo_slugify', () => {
  assert.equal(slugifyGenre('Indie Rock'), 'indie-rock');
  assert.equal(slugifyGenre('indie-rock'), 'indie-rock');
  assert.equal(slugifyGenre('R&B'), 'r-b');
  assert.equal(slugifyGenre('Música Latina'), 'musica-latina');
});

test('this weekend runs Friday 00:00 to Monday 00:00 Eastern', () => {
  // Wednesday Oct 7 2026, 3pm ET -> Fri Oct 9 04:00Z to Mon Oct 12 04:00Z (EDT)
  const midweek = weekendWindow(new Date('2026-10-07T19:00:00Z'));
  assert.equal(midweek.start.toISOString(), '2026-10-09T04:00:00.000Z');
  assert.equal(midweek.end.toISOString(), '2026-10-12T04:00:00.000Z');
  assert.equal(midweek.label, 'Oct 9 – Oct 11');
  // Sunday 11pm ET still belongs to the current weekend.
  assert.equal(weekendWindow(new Date('2026-10-12T03:00:00Z')).start.toISOString(), '2026-10-09T04:00:00.000Z');
  // Across the DST change (Nov 1 2026): Fri Nov 6 is EST, so midnight is 05:00Z.
  assert.equal(weekendWindow(new Date('2026-11-04T17:00:00Z')).start.toISOString(), '2026-11-06T05:00:00.000Z');
});

test('city page collapses long lists by venue and artist', () => {
  const events = Array.from({ length: 12 }, (_, i) =>
    event({ id: `e${i}`, interested: i === 0 ? 3 : 0, venue: { id: `v${i % 2}`, name: `Venue ${i % 2}`, slug: `venue-${i % 2}`, city: 'Washington', state: 'District of Columbia' } }),
  );
  const html = renderCityPage({
    cityName: 'Washington, DC',
    citySlug: 'washington-dc',
    view: { kind: 'genre', slug: 'rock', label: 'Rock' },
    events,
    genres: [{ slug: 'rock', label: 'Rock', count: 12 }, { slug: 'jazz', label: 'Jazz', count: 6 }],
    indexable: true,
  });
  assert.match(html, /<details><summary>See all 12 shows<\/summary>/);
  assert.match(html, /<details><summary>Venue 0 · 6 shows<\/summary>/);
  assert.match(html, /<details><summary>All 1 artists<\/summary>/);
  assert.match(html, /3 interested on Synth/);
  assert.match(html, /<link rel="canonical" href="https:\/\/getsynth\.app\/concerts\/washington-dc\/rock">/);
  // Links to the other genre and the weekend page, not to itself.
  assert.match(html, /href="https:\/\/getsynth\.app\/concerts\/washington-dc\/jazz"/);
  assert.match(html, /href="https:\/\/getsynth\.app\/concerts\/washington-dc\/this-weekend"/);
  assert.doesNotMatch(html, /<li><a href="https:\/\/getsynth\.app\/concerts\/washington-dc\/rock">/);
});
