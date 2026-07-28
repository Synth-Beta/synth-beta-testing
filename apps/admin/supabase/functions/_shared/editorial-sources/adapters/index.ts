import { normalizeSignal } from '../normalize';
import { signalsFromHtmlPage, signalsFromJsonLdEvents, signalsFromRss } from '../fetchers';
import type { DiscoveryContext, EnrichContext, NormalizedSignal, SourceAdapter } from '../types';

function envOrSkip(adapter: SourceAdapter, getEnv: (k: string) => string | undefined) {
  const missing = (adapter.requiresEnv || []).filter((k) => !getEnv(k));
  return missing;
}

export const redditAdapter: SourceAdapter = {
  id: 'reddit',
  name: 'Reddit',
  kind: 'api',
  async enrich(ctx) {
    const q = encodeURIComponent(
      [ctx.subject.artist_name, ctx.subject.venue_name, ctx.subject.name]
        .filter(Boolean)
        .slice(0, 2)
        .join(' '),
    );
    // Prefer old.reddit (less aggressive bot blocks) then www
    const urls = [
      `https://old.reddit.com/search.json?q=${q}&sort=relevance&t=year&limit=8`,
      `https://www.reddit.com/search.json?q=${q}&sort=relevance&t=year&limit=8`,
    ];
    let json: { data?: { children?: Array<{ data?: Record<string, unknown> }> } } | null = null;
    for (const url of urls) {
      try {
        json = await ctx.fetchJson(url);
        if (json?.data?.children?.length) break;
      } catch {
        /* try next */
      }
    }
    const children = json?.data?.children || [];
    return Promise.all(
      children.map((c) => {
        const d = c.data || {};
        const title = String(d.title || '');
        const selftext = String(d.selftext || '');
        const permalink = d.permalink ? `https://www.reddit.com${d.permalink}` : null;
        return normalizeSignal({
          source: 'reddit',
          url: permalink,
          title,
          excerpt: [title, selftext].filter(Boolean).join('. '),
          subject: ctx.subject.name,
          signal_type: 'social',
          confidence: 0.6,
          raw: { subreddit: d.subreddit, score: d.score },
        });
      }),
    );
  },
};

export const blueskyAdapter: SourceAdapter = {
  id: 'bluesky',
  name: 'Bluesky',
  kind: 'api',
  requiresEnv: ['BLUESKY_HANDLE', 'BLUESKY_APP_PASSWORD'],
  async enrich(ctx) {
    const missing = envOrSkip(this, ctx.getEnv);
    if (missing.length) return [];
    // Public search endpoint (no auth) as soft fallback
    const q = encodeURIComponent(`${ctx.subject.artist_name || ctx.subject.name} DC concert`);
    try {
      const json = await ctx.fetchJson<{
        posts?: Array<{ uri?: string; record?: { text?: string; createdAt?: string } }>;
      }>(`https://public.api.bsky.app/xrpc/app.bsky.feed.searchPosts?q=${q}&limit=5`);
      return Promise.all(
        (json.posts || []).map((p) =>
          normalizeSignal({
            source: 'bluesky',
            url: p.uri || null,
            title: 'Bluesky post',
            excerpt: p.record?.text || '',
            published_at: p.record?.createdAt || null,
            subject: ctx.subject.name,
            signal_type: 'social',
            confidence: 0.5,
          }),
        ),
      );
    } catch {
      return [];
    }
  },
};

export const jambaseAdapter: SourceAdapter = {
  id: 'jambase',
  name: 'JamBase',
  kind: 'api',
  requiresEnv: ['JAMBASE_API_KEY', 'VITE_JAMBASE_API_KEY'],
  async discover(ctx) {
    const key = ctx.getEnv('JAMBASE_API_KEY') || ctx.getEnv('VITE_JAMBASE_API_KEY');
    if (!key) return [];
    const url = new URL('https://www.jambase.com/jb-api/v1/events');
    url.searchParams.set('apikey', key);
    url.searchParams.set('geoCityId', 'jambase:221301'); // Washington DC metro approx; soft fail if invalid
    url.searchParams.set('perPage', '20');
    try {
      const json = await ctx.fetchJson<{ events?: Array<Record<string, unknown>> }>(url.toString());
      const events = json.events || (json as { data?: Array<Record<string, unknown>> }).data || [];
      return Promise.all(
        events.slice(0, 15).map((e) =>
          normalizeSignal({
            source: 'jambase',
            url: String(e.url || e.eventUrl || '') || null,
            title: String(e.name || e.title || 'JamBase event'),
            excerpt: String(e.description || e.name || e.title || ''),
            published_at: String(e.startDate || e.date || '') || null,
            subject: String(e.name || e.title || 'JamBase event'),
            signal_type: 'listing',
            confidence: 0.75,
            raw: { id: e.id || e.identifier },
          }),
        ),
      );
    } catch {
      // fallback: HTML/jsonld from public DC page
      try {
        return await signalsFromJsonLdEvents({
          ctx,
          source: 'jambase',
          pageUrl: 'https://www.jambase.com/concerts/in/washington-dc',
          subject: 'Washington DC concerts',
        });
      } catch {
        return [];
      }
    }
  },
  async enrich(ctx) {
    const key = ctx.getEnv('JAMBASE_API_KEY') || ctx.getEnv('VITE_JAMBASE_API_KEY');
    if (!key) return [];
    const q = encodeURIComponent(ctx.subject.artist_name || ctx.subject.name);
    try {
      const url = `https://www.jambase.com/jb-api/v1/events?apikey=${key}&artistName=${q}&perPage=5`;
      const json = await ctx.fetchJson<{ events?: Array<Record<string, unknown>> }>(url);
      const events = json.events || [];
      return Promise.all(
        events.slice(0, 5).map((e) =>
          normalizeSignal({
            source: 'jambase',
            url: String(e.url || '') || null,
            title: String(e.name || e.title || ''),
            excerpt: String(e.description || e.name || ''),
            published_at: String(e.startDate || '') || null,
            subject: ctx.subject.name,
            signal_type: 'listing',
            confidence: 0.7,
          }),
        ),
      );
    } catch {
      return [];
    }
  },
};

export const ticketmasterAdapter: SourceAdapter = {
  id: 'ticketmaster',
  name: 'Ticketmaster',
  kind: 'api',
  requiresEnv: ['TICKETMASTER_API_KEY'],
  async discover(ctx) {
    const key = ctx.getEnv('TICKETMASTER_API_KEY');
    if (!key) return [];
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${key}&city=Washington&stateCode=DC&size=20&sort=date,asc`;
    try {
      const json = await ctx.fetchJson<{
        _embedded?: { events?: Array<Record<string, unknown>> };
      }>(url);
      const events = json._embedded?.events || [];
      return Promise.all(
        events.map((e) =>
          normalizeSignal({
            source: 'ticketmaster',
            url: String(e.url || '') || null,
            title: String(e.name || ''),
            excerpt: String((e as { info?: string }).info || e.name || ''),
            published_at: String((e.dates as { start?: { dateTime?: string } })?.start?.dateTime || '') || null,
            subject: String(e.name || 'Ticketmaster event'),
            signal_type: 'listing',
            confidence: 0.8,
            raw: { id: e.id },
          }),
        ),
      );
    } catch {
      return [];
    }
  },
  async enrich(ctx) {
    const key = ctx.getEnv('TICKETMASTER_API_KEY');
    if (!key) return [];
    const venueHint = ctx.subject.venue_name || '';
    const keyword = encodeURIComponent(
      [ctx.subject.artist_name, venueHint, ctx.subject.name].filter(Boolean).slice(0, 2).join(' '),
    );
    const url = `https://app.ticketmaster.com/discovery/v2/events.json?apikey=${key}&keyword=${keyword}&stateCode=DC,MD,VA&size=10&classificationName=Music`;
    try {
      const json = await ctx.fetchJson<{ _embedded?: { events?: Array<Record<string, unknown>> } }>(url);
      const events = json._embedded?.events || [];
      const venueLower = (venueHint || ctx.subject.name || '').toLowerCase();
      const filtered = venueLower
        ? events.filter((e) => {
            const venues = (e._embedded as { venues?: Array<{ name?: string }> } | undefined)?.venues || [];
            const names = venues.map((v) => (v.name || '').toLowerCase()).join(' ');
            const blob = `${e.name || ''} ${names}`.toLowerCase();
            return venueLower.split(/\s+/).some((t) => t.length > 2 && blob.includes(t));
          })
        : events;
      return Promise.all(
        (filtered.length ? filtered : events).slice(0, 8).map((e) =>
          normalizeSignal({
            source: 'ticketmaster',
            url: String(e.url || '') || null,
            title: String(e.name || ''),
            excerpt: String(e.name || ''),
            subject: ctx.subject.name,
            signal_type: 'listing',
            confidence: 0.75,
          }),
        ),
      );
    } catch {
      return [];
    }
  },
};

export const setlistFmAdapter: SourceAdapter = {
  id: 'setlistfm',
  name: 'setlist.fm',
  kind: 'api',
  requiresEnv: ['SETLIST_FM_API_KEY', 'VITE_SETLIST_FM_API_KEY'],
  async enrich(ctx) {
    const key = ctx.getEnv('SETLIST_FM_API_KEY') || ctx.getEnv('VITE_SETLIST_FM_API_KEY');
    if (!key || !ctx.subject.artist_name) return [];
    const url = `https://api.setlist.fm/rest/1.0/search/setlists?artistName=${encodeURIComponent(ctx.subject.artist_name)}&p=1`;
    try {
      const json = await ctx.fetchJson<{ setlist?: Array<Record<string, unknown>> }>(url, {
        headers: { Accept: 'application/json', 'x-api-key': key },
      });
      return Promise.all(
        (json.setlist || []).slice(0, 5).map((s) =>
          normalizeSignal({
            source: 'setlistfm',
            url: String(s.url || '') || null,
            title: `${ctx.subject.artist_name} setlist`,
            excerpt: String((s.venue as { name?: string })?.name || s.eventDate || 'setlist'),
            published_at: null,
            subject: ctx.subject.name,
            signal_type: 'setlist',
            confidence: 0.65,
            raw: { eventDate: s.eventDate },
          }),
        ),
      );
    } catch {
      return [];
    }
  },
};

export const musicbrainzAdapter: SourceAdapter = {
  id: 'musicbrainz',
  name: 'MusicBrainz',
  kind: 'api',
  async enrich(ctx) {
    if (!ctx.subject.artist_name) return [];
    const url = `https://musicbrainz.org/ws/2/artist/?query=artist:${encodeURIComponent(ctx.subject.artist_name)}&fmt=json&limit=3`;
    try {
      const json = await ctx.fetchJson<{ artists?: Array<Record<string, unknown>> }>(url, {
        headers: { 'User-Agent': 'SynthEditorial/2.0 (https://getsynth.app)' },
      });
      return Promise.all(
        (json.artists || []).map((a) =>
          normalizeSignal({
            source: 'musicbrainz',
            url: a.id ? `https://musicbrainz.org/artist/${a.id}` : null,
            title: String(a.name || ctx.subject.artist_name),
            excerpt: String(a.disambiguation || a.type || a.name || ''),
            subject: ctx.subject.name,
            signal_type: 'profile',
            confidence: 0.7,
          }),
        ),
      );
    } catch {
      return [];
    }
  },
};

export const googlePlacesAdapter: SourceAdapter = {
  id: 'google_places',
  name: 'Google Places',
  kind: 'api',
  requiresEnv: ['GOOGLE_PLACES_API_KEY'],
  async enrich(ctx) {
    const key = ctx.getEnv('GOOGLE_PLACES_API_KEY');
    if (!key || !ctx.subject.venue_name) return [];
    const q = encodeURIComponent(`${ctx.subject.venue_name} ${ctx.subject.city || 'Washington DC'}`);
    try {
      const find = await ctx.fetchJson<{
        candidates?: Array<{ place_id?: string; name?: string; formatted_address?: string }>;
      }>(
        `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${q}&inputtype=textquery&fields=place_id,name,formatted_address&key=${key}`,
      );
      const placeId = find.candidates?.[0]?.place_id;
      if (!placeId) return [];
      const details = await ctx.fetchJson<{
        result?: { name?: string; website?: string; rating?: number; reviews?: Array<{ text?: string; time?: number }> };
      }>(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,website,rating,reviews&key=${key}`,
      );
      const r = details.result || {};
      const signals: NormalizedSignal[] = [
        await normalizeSignal({
          source: 'google_places',
          url: r.website || null,
          title: r.name || ctx.subject.venue_name,
          excerpt: `Google rating ${r.rating ?? 'n/a'}. ${r.website || ''}`.trim(),
          subject: ctx.subject.name,
          signal_type: 'place',
          confidence: 0.7,
          raw: { place_id: placeId, rating: r.rating },
        }),
      ];
      for (const review of (r.reviews || []).slice(0, 3)) {
        signals.push(
          await normalizeSignal({
            source: 'google_places',
            url: r.website || null,
            title: `${r.name || ctx.subject.venue_name} review`,
            excerpt: review.text || '',
            published_at: review.time ? new Date(review.time * 1000).toISOString() : null,
            subject: ctx.subject.name,
            signal_type: 'review',
            confidence: 0.55,
          }),
        );
      }
      return signals;
    } catch {
      return [];
    }
  },
};

export function makeVenueSiteAdapter(id: string, name: string, pageUrl: string): SourceAdapter {
  return {
    id,
    name,
    kind: 'html',
    async discover(ctx) {
      try {
        const fromLd = await signalsFromJsonLdEvents({
          ctx,
          source: id,
          pageUrl,
          subject: `${name} DC`,
        });
        if (fromLd.length) return fromLd;
        return await signalsFromHtmlPage({
          ctx,
          source: id,
          pageUrl,
          subject: `${name} DC`,
          signal_type: 'calendar',
        });
      } catch {
        return [];
      }
    },
    async enrich(ctx) {
      if (!ctx.subject.venue_name && !ctx.subject.name.toLowerCase().includes(name.toLowerCase().split(' ')[0])) {
        // still allow for event subjects at this venue
        if (!`${ctx.subject.venue_name || ''} ${ctx.subject.name}`.toLowerCase().includes(name.toLowerCase().split(' ')[0].toLowerCase())) {
          return [];
        }
      }
      try {
        return await signalsFromHtmlPage({
          ctx,
          source: id,
          pageUrl,
          subject: ctx.subject.name,
          signal_type: 'calendar',
        });
      } catch {
        return [];
      }
    },
  };
}

export const impAdapter = makeVenueSiteAdapter('imp', 'IMP / 9:30 Club', 'https://www.impconcerts.com/');
export const unionStageAdapter = makeVenueSiteAdapter('union_stage', 'Union Stage', 'https://www.unionstage.com/');
export const blackCatAdapter = makeVenueSiteAdapter('black_cat', 'Black Cat', 'https://www.blackcatdc.com/');
export const songbyrdAdapter = makeVenueSiteAdapter('songbyrd', 'Songbyrd', 'https://songbyrddc.com/');
export const theWharfAdapter = makeVenueSiteAdapter('the_wharf', 'The Wharf', 'https://www.wharfdc.com/');

export function makeRssAdapter(
  id: string,
  name: string,
  feedUrl: string,
  signal_type: 'news' | 'calendar' | 'review' = 'news',
): SourceAdapter {
  return {
    id,
    name,
    kind: 'rss',
    async discover(ctx) {
      try {
        return await signalsFromRss({
          ctx,
          source: id,
          feedUrl,
          subject: 'Washington DC music',
          signal_type,
        });
      } catch {
        return [];
      }
    },
    async enrich(ctx) {
      try {
        return await signalsFromRss({
          ctx,
          source: id,
          feedUrl,
          subject: ctx.subject.name,
          signal_type,
          query: ctx.subject.artist_name || ctx.subject.venue_name || ctx.subject.name.split(' ')[0],
        });
      } catch {
        return [];
      }
    },
  };
}

// Known public feeds / listing pages (soft-fail if moved)
export const dcMusicLiveAdapter = makeRssAdapter(
  'dc_music_live',
  'DC Music Live',
  'https://dcmusiclive.com/feed/',
  'calendar',
);
export const capitalBopAdapter = makeRssAdapter(
  'capitalbop',
  'CapitalBop',
  'https://www.capitalbop.com/feed/',
  'news',
);
export const districtFrayAdapter = makeRssAdapter(
  'district_fray',
  'District Fray',
  'https://districtfray.com/feed/',
  'news',
);
export const washingtonOrgAdapter: SourceAdapter = {
  id: 'washington_org',
  name: 'Washington.org',
  kind: 'html',
  async discover(ctx) {
    try {
      return await signalsFromHtmlPage({
        ctx,
        source: 'washington_org',
        pageUrl: 'https://washington.org/events',
        subject: 'Washington DC events',
        signal_type: 'calendar',
      });
    } catch {
      return [];
    }
  },
};
export const washingtonianAdapter = makeRssAdapter(
  'washingtonian',
  'Washingtonian',
  'https://www.washingtonian.com/feed/',
  'news',
);
export const axiosDcAdapter = makeRssAdapter(
  'axios_dc',
  'Axios DC',
  'https://api.axios.com/feed/audience/dc',
  'news',
);
export const dcMusicReviewAdapter = makeRssAdapter(
  'dc_music_review',
  'DC Music Review',
  'https://dcmusicreview.com/feed/',
  'review',
);
export const wtopAdapter = makeRssAdapter(
  'wtop',
  'WTOP',
  'https://wtop.com/feed/',
  'news',
);

export const venueWebsiteDiscoveryAdapter: SourceAdapter = {
  id: 'venue_website_discovery',
  name: 'DMV venue websites',
  kind: 'html',
  async discover(ctx) {
    // Placeholder; pipeline injects venue list and calls discoverVenueWebsites.
    return [];
  },
  async enrich(ctx) {
    const site = ctx.subject.website;
    if (!site) return [];
    try {
      return await signalsFromHtmlPage({
        ctx,
        source: 'venue_website_discovery',
        pageUrl: site,
        subject: ctx.subject.name,
        signal_type: 'website',
      });
    } catch {
      return [];
    }
  },
};

export async function discoverVenueWebsites(
  ctx: DiscoveryContext,
  venues: Array<{ id: string; name: string; city?: string | null; state?: string | null; url?: string | null }>,
): Promise<NormalizedSignal[]> {
  const out: NormalizedSignal[] = [];
  for (const v of venues.slice(0, 25)) {
    if (v.url) {
      out.push(
        await normalizeSignal({
          source: 'venue_website_discovery',
          url: v.url,
          title: `${v.name} website`,
          excerpt: `Official or listed site for ${v.name} (${v.city || 'DC metro'}).`,
          subject: v.name,
          signal_type: 'website',
          confidence: 0.85,
          raw: { venue_id: v.id, from: 'venues.url' },
        }),
      );
      continue;
    }
    // Soft discovery via DuckDuckGo-style html is brittle; try MusicBrainz-like search pages skipped.
    // Use Wikipedia opensearch as a weak website pointer.
    try {
      const wiki = await ctx.fetchJson<unknown[]>(
        `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(`${v.name} ${v.city || 'Washington'} music venue`)}&limit=1&namespace=0&format=json`,
      );
      const link = Array.isArray(wiki?.[3]) ? String((wiki[3] as string[])[0] || '') : '';
      if (link) {
        out.push(
          await normalizeSignal({
            source: 'venue_website_discovery',
            url: link,
            title: `${v.name} reference`,
            excerpt: `Discovered reference page for ${v.name}.`,
            subject: v.name,
            signal_type: 'website',
            confidence: 0.35,
            raw: { venue_id: v.id, from: 'wikipedia_opensearch' },
          }),
        );
      }
    } catch {
      /* soft fail */
    }
  }
  return out;
}

// silence unused in enrich signature helper
export type _Enrich = EnrichContext;
