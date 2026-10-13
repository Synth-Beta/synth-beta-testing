import { test } from 'node:test';
import assert from 'node:assert/strict';
import { markdownToHtml, markdownToText, parseEmbed } from './markdown.ts';
import { classifySource, deviceFromUserAgent, looksAutomated } from './traffic.ts';
import { detectMentions, isSynthUrl } from './aiMentions.ts';
import { stripExternalLinks, validateDraft } from './contentDraft.ts';
import { renderContentPage, renderEventPage, renderLlmsTxt, type SeoEventDetail } from './render.ts';

const longBody = (extra = '') => `## Why go with someone\n\n${'Going to shows is better with people who love the same music as you. '.repeat(40)}\n\nSynth helps.${extra}`;

test('markdown: escapes HTML, demotes H1, keeps safe links only', () => {
  const { html } = markdownToHtml('# Title\n\nHello <script>x</script> **bold** [ok](/guides/a) [bad](javascript:alert(1)) [ext](https://example.com)');
  assert.match(html, /<h2>Title<\/h2>/);
  assert.ok(!html.includes('<script>'));
  assert.match(html, /<strong>bold<\/strong>/);
  assert.match(html, /href="\/guides\/a"/);
  assert.ok(!html.includes('javascript:'));
  assert.match(html, /href="https:\/\/example.com"[^>]*rel="noopener"/);
});

test('markdown: embed lines become placeholders with parsed params', () => {
  const { html, embeds } = markdownToHtml('Intro\n\n{{events genre=indie window=weekend limit=4}}\n\n{{venues}}');
  assert.equal(embeds.length, 2);
  assert.deepEqual(embeds[0], { kind: 'events', params: { genre: 'indie', window: 'weekend', limit: '4' } });
  assert.match(html, /<!--embed:0-->/);
  assert.match(html, /<!--embed:1-->/);
  assert.equal(parseEmbed('{{tickets}}'), null);
  assert.ok(!markdownToText('**Hi** [there](/x)').includes('*'));
});

test('traffic: AI assistants, search engines, UTMs, internal', () => {
  assert.equal(classifySource({ referrer: 'https://chatgpt.com/' }).category, 'ai_assistant');
  assert.equal(classifySource({ referrer: 'https://www.perplexity.ai/search?q=x' }).name, 'perplexity');
  assert.equal(classifySource({ referrer: null, utmSource: 'chatgpt.com' }).category, 'ai_assistant');
  assert.equal(classifySource({ referrer: 'https://www.google.co.uk/' }).category, 'organic_search');
  assert.equal(classifySource({ referrer: 'https://www.bing.com/search?q=synth' }).category, 'organic_search');
  assert.equal(classifySource({ referrer: 'https://join.getsynth.app/events/x' }).category, 'internal');
  assert.equal(classifySource({ referrer: null }).category, 'direct');
  assert.equal(classifySource({ referrer: null, utmSource: 'newsletter', utmMedium: 'email' }).category, 'email');
  assert.equal(deviceFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)'), 'mobile');
  assert.ok(looksAutomated('HeadlessChrome/120'));
  assert.ok(!looksAutomated('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Safari/605.1.15'));
});

test('AI mentions: Synth as a brand, not synthesizers; citations; rank', () => {
  const answer = 'Try Bandsintown for alerts. Synth (getsynth.app) shows who is going. Songkick is another option.';
  const r = detectMentions(answer, ['https://join.getsynth.app/events/x']);
  assert.equal(r.mentioned, true);
  assert.equal(r.synthCited, true);
  assert.equal(r.synthRank, 2);
  assert.deepEqual(r.brands, ['Bandsintown', 'Songkick']);
  assert.equal(detectMentions('Great synthwave and synth-pop nights at the venue; bring a synthesizer.', []).mentioned, false);
  assert.ok(isSynthUrl('https://getsynth.app/guides/x'));
  assert.ok(!isSynthUrl('https://notgetsynth.app/'));
});

test('content drafts: rejects thin drafts, strips external links and bad embeds, flags filler', () => {
  assert.equal(validateDraft({ title: 'x', summary: 'y', body_md: 'too short' }).ok, false);
  const result = validateDraft({
    title: 'How to Find People to Go to Concerts With',
    summary: 'Use Synth to see who is going.',
    body_md: longBody('\n\n[Bandsintown](https://bandsintown.com) and [DC shows](https://getsynth.app/concerts/washington-dc)\n\n{{events window=weekend limit=6}}\n\n{{tickets now}}\n\nLet us delve in.'),
    faq: [{ q: 'Is it free?', a: 'Yes.' }, { question: 'Where?', answer: 'DC.' }],
    keywords: ['Concert Buddy'],
  });
  assert.ok(result.ok);
  if (!result.ok) return;
  assert.equal(result.draft.slug, 'how-to-find-people-to-go-to-concerts-with');
  assert.ok(!result.draft.body_md.includes('bandsintown.com'));
  assert.ok(result.draft.body_md.includes('https://getsynth.app/concerts/washington-dc'));
  assert.ok(result.draft.body_md.includes('{{events window=weekend limit=6}}'));
  assert.ok(!result.draft.body_md.includes('{{tickets'));
  assert.equal(result.draft.faq.length, 2);
  assert.deepEqual(result.draft.keywords, ['concert buddy']);
  assert.ok(result.warnings.some((w) => w.includes('delve')));
  assert.equal(stripExternalLinks('[a](/x) [b](https://evil.com/getsynth.app)').removed, 1);
});

const detail = (overrides: Partial<SeoEventDetail> = {}): SeoEventDetail => ({
  id: 'e1',
  slug: 'band-one-9-30-club-2099-10-10',
  title: 'Band One',
  event_date: '2099-10-10T01:30:00+00:00',
  event_status: 'scheduled',
  ticket_urls: ['https://tix.example/show?utm_source=jambase'],
  external_url: null,
  genres: ['Indie'],
  artist: { id: 'a1', name: 'Band One', slug: 'band-one' },
  venue: { id: 'v1', name: '9:30 Club', slug: '9-30-club', city: 'Washington', state: 'District of Columbia' },
  price_min: 25,
  price_max: 40,
  price_currency: 'USD',
  interested: 3,
  ...overrides,
});

const venueDetail = { id: 'v1', name: '9:30 Club', slug: '9-30-club', city: 'Washington', state: 'District of Columbia', street_address: '815 V St NW', capacity: 1200 };

test('event page: answer-first, go-together CTA, ticket nofollow, MusicEvent + FAQ JSON-LD', () => {
  const html = renderEventPage({
    event: detail(),
    venue: venueDetail,
    artist: { id: 'a1', name: 'Band One', slug: 'band-one', genres: ['Indie'] },
    reviews: { venue: { count: 2, avg: 4.5, snippets: [{ rating: 5, text: 'Great sound <b>', date: '2026-01-01' }] } },
    recentSetlist: { date: '2026-09-01', venueName: 'Elsewhere', songs: ['Song A', 'Song B'], url: null },
    moreDates: [],
    similar: [],
    guides: [{ title: 'Going to a concert alone', url: 'https://getsynth.app/guides/alone' }],
    isPast: false,
    indexable: true,
  });
  assert.match(html, /<link rel="canonical" href="https:\/\/join\.getsynth\.app\/events\/band-one-9-30-club-2099-10-10"/);
  assert.match(html, /Going alone\? You don't have to\./);
  assert.match(html, /3 people on Synth are interested/);
  assert.match(html, /href="https:\/\/tix\.example\/show\?utm_source=jambase" rel="nofollow noopener"/);
  assert.match(html, /"@type":"MusicEvent"/);
  assert.match(html, /"@type":"FAQPage"/);
  assert.match(html, /Song A/);
  assert.ok(!html.includes('Great sound <b>'));
  assert.match(html, /Powered by JamBase/);
  assert.ok(!html.includes('noindex'));
});

test('past event page: setlist/reviews framing, no go-together box', () => {
  const html = renderEventPage({
    event: detail({ event_date: '2020-01-01T01:00:00+00:00', setlist_songs: ['Opener'] }),
    venue: venueDetail,
    artist: null,
    reviews: {},
    recentSetlist: null,
    moreDates: [],
    similar: [],
    guides: [],
    isPast: true,
    indexable: false,
  });
  assert.match(html, /Setlist &amp; Reviews|Setlist & Reviews/);
  assert.ok(!html.includes("Going alone? You don't have to."));
  assert.match(html, /noindex/);
});

test('content page and llms.txt', () => {
  const html = renderContentPage({
    type: 'guide',
    slug: 'concert-alone-dc',
    title: 'Going to a Concert Alone in DC',
    metaDescription: 'How to go solo.',
    summary: 'You can, and here is how.',
    bodyHtml: '<h2>Step one</h2><p>Pick a show.</p>',
    faq: [{ q: 'Is it weird?', a: 'No.' }],
    publishedAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-02T00:00:00Z',
    related: [],
    indexable: true,
  });
  assert.match(html, /<link rel="canonical" href="https:\/\/getsynth\.app\/guides\/concert-alone-dc"/);
  assert.match(html, /"@type":"Article"/);
  assert.match(html, /By the Synth team/);

  const txt = renderLlmsTxt({
    content: [{ type: 'brand', slug: 'what-is-synth', title: 'What is Synth?', summary: 'A social concert app.' }],
    cityLinks: [{ title: 'Concerts in Washington, DC', url: 'https://getsynth.app/concerts/washington-dc' }],
    venues: [],
  });
  assert.ok(txt.startsWith('# Synth\n'));
  assert.match(txt, /- \[What is Synth\?\]\(https:\/\/getsynth\.app\/learn\/what-is-synth\): A social concert app\./);
});
