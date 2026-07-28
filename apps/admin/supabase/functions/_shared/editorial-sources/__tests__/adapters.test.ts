import { describe, expect, it } from 'vitest';
import { canonicalUrl, contentHash, dedupeSignals, shortExcerpt } from '../normalize';
import { listAdapterMeta } from '../registry';
import { extractJsonLd, extractRssItems } from '../fetchers';

describe('normalize', () => {
  it('shortens excerpts', () => {
    const long = 'a'.repeat(500);
    expect(shortExcerpt(long).length).toBeLessThanOrEqual(280);
  });

  it('canonicalizes urls and strips tracking', () => {
    expect(canonicalUrl('https://Example.com/Path/?utm_source=x&id=1#frag')).toBe(
      'https://example.com/path?id=1',
    );
  });

  it('dedupes by canonical url preferring higher confidence', async () => {
    const a = {
      source: 'reddit',
      url: 'https://x.test/a',
      canonical_url: 'https://x.test/a',
      title: 'A',
      excerpt: 'one',
      published_at: null,
      fetched_at: new Date().toISOString(),
      subject: 'Test',
      signal_type: 'social' as const,
      sentiment: 'neutral' as const,
      confidence: 0.4,
      content_hash: await contentHash(['https://x.test/a', 'A', 'one']),
    };
    const b = { ...a, confidence: 0.9, excerpt: 'two' };
    const out = dedupeSignals([a, b]);
    expect(out).toHaveLength(1);
    expect(out[0].excerpt).toBe('two');
  });
});

describe('fetchers', () => {
  it('parses rss items', () => {
    const xml = `<?xml version="1.0"?><rss><channel>
      <item><title>Show Night</title><link>https://ex.test/1</link><description>Great gig</description></item>
    </channel></rss>`;
    const items = extractRssItems(xml);
    expect(items[0].title).toBe('Show Night');
    expect(items[0].link).toContain('ex.test');
  });

  it('parses json-ld script blocks', () => {
    const html = `<html><script type="application/ld+json">{"@type":"MusicEvent","name":"DC Show","url":"https://ex.test/e"}</script></html>`;
    const nodes = extractJsonLd(html);
    expect(nodes[0]).toMatchObject({ name: 'DC Show' });
  });
});

describe('registry', () => {
  it('includes required source adapters', () => {
    const ids = listAdapterMeta().map((a) => a.id);
    for (const id of [
      'jambase',
      'ticketmaster',
      'imp',
      'union_stage',
      'black_cat',
      'songbyrd',
      'the_wharf',
      'dc_music_live',
      'capitalbop',
      'district_fray',
      'washington_org',
      'reddit',
      'bluesky',
      'google_places',
      'setlistfm',
      'musicbrainz',
      'washingtonian',
      'axios_dc',
      'dc_music_review',
      'wtop',
      'venue_website_discovery',
    ]) {
      expect(ids).toContain(id);
    }
  });
});
