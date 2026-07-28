/**
 * Audience sentiment research pack — Google reviews, Yelp, and local/news press.
 * Primary path for raw user + critic texture while Reddit OAuth is gated.
 */
import { normalizeSignal } from '../normalize';
import { signalsFromRss } from '../fetchers';
import type {
  DiscoveryContext,
  EnrichContext,
  NormalizedSignal,
  ResearchSubjectRef,
  SourceAdapter,
} from '../types';

const DC_LOCATION = 'Washington, DC';
const DC_LAT = 38.9072;
const DC_LNG = -77.0369;

function venueFocus(subject: ResearchSubjectRef): string {
  return (
    subject.venue_name ||
    (subject.subject_type === 'venue' ? subject.name : '') ||
    subject.name
  ).trim();
}

function artistFocus(subject: ResearchSubjectRef): string | null {
  const a =
    subject.artist_name || (subject.subject_type === 'artist' ? subject.name : null) || null;
  return a?.trim() || null;
}

export function buildAudienceSearchTerms(subject: ResearchSubjectRef): string[] {
  const venue = venueFocus(subject);
  const artist = artistFocus(subject);
  const terms: string[] = [];
  if (venue) terms.push(venue);
  if (artist) terms.push(artist);
  if (venue && artist) terms.push(`${artist} ${venue}`);
  if (subject.event_title && subject.event_title !== artist && subject.event_title !== venue) {
    terms.push(subject.event_title);
  }
  // Dedupe
  const seen = new Set<string>();
  return terms.filter((t) => {
    const k = t.toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function reviewConfidence(rating?: number | null): number {
  if (typeof rating !== 'number') return 0.6;
  if (rating >= 4) return 0.72;
  if (rating <= 2) return 0.7;
  return 0.62;
}

// ─── Google Places (reviews + ratings) ───────────────────────────────────────

export const googlePlacesAdapter: SourceAdapter = {
  id: 'google_places',
  name: 'Google Places Reviews',
  kind: 'api',
  requiresEnv: ['GOOGLE_PLACES_API_KEY'],
  async enrich(ctx) {
    const key = ctx.getEnv('GOOGLE_PLACES_API_KEY');
    const focus = venueFocus(ctx.subject);
    if (!key || !focus) return [];

    const city = ctx.subject.city || 'Washington DC';
    const queries = [
      `${focus} ${city}`,
      `${focus} concert venue ${city}`,
      focus,
    ];

    try {
      let placeId: string | undefined;
      let matchedName: string | undefined;

      for (const q of queries) {
        const find = await ctx.fetchJson<{
          candidates?: Array<{ place_id?: string; name?: string }>;
          status?: string;
        }>(
          `https://maps.googleapis.com/maps/api/place/findplacefromtext/json?input=${encodeURIComponent(q)}&inputtype=textquery&fields=place_id,name,formatted_address&locationbias=circle:25000@${DC_LAT},${DC_LNG}&key=${key}`,
        );
        placeId = find.candidates?.[0]?.place_id;
        matchedName = find.candidates?.[0]?.name;
        if (placeId) break;
      }
      if (!placeId) return [];

      const details = await ctx.fetchJson<{
        result?: {
          name?: string;
          website?: string;
          url?: string;
          rating?: number;
          user_ratings_total?: number;
          formatted_address?: string;
          editorial_summary?: { overview?: string };
          reviews?: Array<{
            author_name?: string;
            rating?: number;
            text?: string;
            time?: number;
            relative_time_description?: string;
          }>;
        };
        status?: string;
      }>(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=name,website,url,rating,user_ratings_total,formatted_address,editorial_summary,reviews&reviews_sort=most_relevant&key=${key}`,
      );

      const r = details.result || {};
      const mapsUrl = r.url || null;
      const placeName = r.name || matchedName || focus;
      const signals: NormalizedSignal[] = [];

      const ratingLine = [
        typeof r.rating === 'number' ? `Google rating ${r.rating}/5` : null,
        typeof r.user_ratings_total === 'number' ? `from ${r.user_ratings_total} reviews` : null,
        r.formatted_address || null,
      ]
        .filter(Boolean)
        .join(' · ');

      signals.push(
        await normalizeSignal({
          source: 'google_places',
          url: mapsUrl || r.website || null,
          title: `${placeName} — Google Places`,
          excerpt: ratingLine || `Google Places listing for ${placeName}`,
          subject: ctx.subject.name,
          signal_type: 'place',
          confidence: 0.78,
          sentiment:
            typeof r.rating === 'number'
              ? r.rating >= 4
                ? 'positive'
                : r.rating <= 2.5
                  ? 'negative'
                  : 'mixed'
              : undefined,
          raw: {
            place_id: placeId,
            rating: r.rating,
            user_ratings_total: r.user_ratings_total,
            address: r.formatted_address,
          },
        }),
      );

      if (r.editorial_summary?.overview) {
        signals.push(
          await normalizeSignal({
            source: 'google_places',
            url: mapsUrl || r.website || null,
            title: `${placeName} — Google editorial summary`,
            excerpt: r.editorial_summary.overview,
            subject: ctx.subject.name,
            signal_type: 'review',
            confidence: 0.65,
            raw: { place_id: placeId, kind: 'editorial_summary' },
          }),
        );
      }

      for (const review of (r.reviews || []).slice(0, 5)) {
        if (!review.text?.trim()) continue;
        const author = review.author_name || 'Google reviewer';
        const stars = typeof review.rating === 'number' ? `${review.rating}/5` : '';
        signals.push(
          await normalizeSignal({
            source: 'google_places',
            url: mapsUrl || r.website || null,
            title: `${placeName} Google review${stars ? ` (${stars})` : ''} — ${author}`,
            excerpt: review.text,
            published_at: review.time ? new Date(review.time * 1000).toISOString() : null,
            subject: ctx.subject.name,
            signal_type: 'review',
            confidence: reviewConfidence(review.rating),
            sentiment:
              typeof review.rating === 'number'
                ? review.rating >= 4
                  ? 'positive'
                  : review.rating <= 2
                    ? 'negative'
                    : 'mixed'
                : undefined,
            raw: {
              place_id: placeId,
              kind: 'review',
              author: review.author_name,
              rating: review.rating,
              relative_time: review.relative_time_description,
            },
          }),
        );
      }

      ctx.log?.('[google_places] enrich', {
        place: placeName,
        reviews: (r.reviews || []).length,
        rating: r.rating,
      });
      return signals;
    } catch (err) {
      ctx.log?.('[google_places] error', {
        error: err instanceof Error ? err.message : String(err),
      });
      return [];
    }
  },
};

// ─── Yelp Fusion (business + reviews) ────────────────────────────────────────

export const yelpAdapter: SourceAdapter = {
  id: 'yelp',
  name: 'Yelp Reviews',
  kind: 'api',
  requiresEnv: ['YELP_API_KEY'],
  async enrich(ctx) {
    const key = ctx.getEnv('YELP_API_KEY');
    const focus = venueFocus(ctx.subject);
    if (!key || !focus) return [];

    const headers = {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'User-Agent': 'synth-editorial-research/2.0 (+https://getsynth.app)',
    };

    try {
      const search = await ctx.fetchJson<{
        businesses?: Array<{
          id?: string;
          name?: string;
          url?: string;
          rating?: number;
          review_count?: number;
          categories?: Array<{ title?: string }>;
          location?: { display_address?: string[] };
        }>;
      }>(
        `https://api.yelp.com/v3/businesses/search?term=${encodeURIComponent(focus)}&location=${encodeURIComponent(DC_LOCATION)}&categories=musicvenues,nightlife,arts,bars&limit=3&sort_by=best_match`,
        { headers },
      );

      let biz = search.businesses?.[0];
      // Fallback without category filter if musicvenues miss
      if (!biz?.id) {
        const broad = await ctx.fetchJson<{
          businesses?: Array<{
            id?: string;
            name?: string;
            url?: string;
            rating?: number;
            review_count?: number;
            categories?: Array<{ title?: string }>;
            location?: { display_address?: string[] };
          }>;
        }>(
          `https://api.yelp.com/v3/businesses/search?term=${encodeURIComponent(focus)}&location=${encodeURIComponent(DC_LOCATION)}&limit=3&sort_by=best_match`,
          { headers },
        );
        biz = broad.businesses?.[0];
      }
      if (!biz?.id) return [];

      const signals: NormalizedSignal[] = [];
      const address = (biz.location?.display_address || []).join(', ');
      const cats = (biz.categories || []).map((c) => c.title).filter(Boolean).join(', ');
      const summary = [
        typeof biz.rating === 'number' ? `Yelp ${biz.rating}/5` : null,
        typeof biz.review_count === 'number' ? `${biz.review_count} reviews` : null,
        cats || null,
        address || null,
      ]
        .filter(Boolean)
        .join(' · ');

      signals.push(
        await normalizeSignal({
          source: 'yelp',
          url: biz.url || null,
          title: `${biz.name || focus} — Yelp`,
          excerpt: summary || `Yelp listing for ${biz.name || focus}`,
          subject: ctx.subject.name,
          signal_type: 'place',
          confidence: 0.8,
          sentiment:
            typeof biz.rating === 'number'
              ? biz.rating >= 4
                ? 'positive'
                : biz.rating <= 2.5
                  ? 'negative'
                  : 'mixed'
              : undefined,
          raw: {
            business_id: biz.id,
            rating: biz.rating,
            review_count: biz.review_count,
            categories: cats,
          },
        }),
      );

      const reviewsJson = await ctx.fetchJson<{
        reviews?: Array<{
          id?: string;
          url?: string;
          text?: string;
          rating?: number;
          time_created?: string;
          user?: { name?: string };
        }>;
      }>(`https://api.yelp.com/v3/businesses/${biz.id}/reviews?limit=3&sort_by=yelp_sort`, {
        headers,
      });

      for (const review of reviewsJson.reviews || []) {
        if (!review.text?.trim()) continue;
        const who = review.user?.name || 'Yelp reviewer';
        const stars = typeof review.rating === 'number' ? `${review.rating}/5` : '';
        signals.push(
          await normalizeSignal({
            source: 'yelp',
            url: review.url || biz.url || null,
            title: `${biz.name || focus} Yelp review${stars ? ` (${stars})` : ''} — ${who}`,
            excerpt: review.text,
            published_at: review.time_created || null,
            subject: ctx.subject.name,
            signal_type: 'review',
            confidence: reviewConfidence(review.rating),
            sentiment:
              typeof review.rating === 'number'
                ? review.rating >= 4
                  ? 'positive'
                  : review.rating <= 2
                    ? 'negative'
                    : 'mixed'
                : undefined,
            raw: {
              business_id: biz.id,
              kind: 'review',
              rating: review.rating,
              review_id: review.id,
            },
          }),
        );
      }

      ctx.log?.('[yelp] enrich', {
        business: biz.name,
        reviews: (reviewsJson.reviews || []).length,
        rating: biz.rating,
      });
      return signals;
    } catch (err) {
      ctx.log?.('[yelp] error', { error: err instanceof Error ? err.message : String(err) });
      return [];
    }
  },
};

// ─── Local / national news mentions (NewsAPI + Google News RSS) ──────────────

const LOCAL_PRESS_FEEDS: Array<{ id: string; name: string; feedUrl: string }> = [
  { id: 'dcist', name: 'DCist', feedUrl: 'https://dcist.com/feed/' },
  {
    id: 'city_paper',
    name: 'Washington City Paper',
    feedUrl: 'https://washingtoncitypaper.com/feed/',
  },
  {
    id: 'brightest_young_things',
    name: 'Brightest Young Things',
    feedUrl: 'https://brightestyoungthings.com/feed/',
  },
];

function googleNewsRssUrl(query: string): string {
  const q = encodeURIComponent(query);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

async function newsApiSignals(
  ctx: EnrichContext,
  terms: string[],
): Promise<NormalizedSignal[]> {
  const key = ctx.getEnv('NEWS_API_KEY');
  if (!key || !terms.length) return [];

  const qParts = terms.slice(0, 2).map((t) => `"${t}"`);
  const q = `(${qParts.join(' OR ')}) AND (Washington OR DC OR DMV OR concert OR venue OR music)`;

  try {
    const json = await ctx.fetchJson<{
      articles?: Array<{
        title?: string;
        description?: string;
        url?: string;
        publishedAt?: string;
        source?: { name?: string };
        content?: string;
      }>;
      status?: string;
    }>(
      `https://newsapi.org/v2/everything?q=${encodeURIComponent(q)}&language=en&sortBy=relevancy&pageSize=12&apiKey=${key}`,
    );

    return Promise.all(
      (json.articles || [])
        .filter((a) => a.title && a.url)
        .slice(0, 10)
        .map((a) =>
          normalizeSignal({
            source: 'news_api',
            url: a.url || null,
            title: `${a.source?.name ? `${a.source.name}: ` : ''}${a.title}`,
            excerpt: a.description || a.content || a.title || '',
            published_at: a.publishedAt || null,
            subject: ctx.subject.name,
            signal_type: 'news',
            confidence: 0.68,
            raw: { provider: 'newsapi', outlet: a.source?.name },
          }),
        ),
    );
  } catch (err) {
    ctx.log?.('[news_api] error', { error: err instanceof Error ? err.message : String(err) });
    return [];
  }
}

async function googleNewsSignals(
  ctx: EnrichContext,
  terms: string[],
): Promise<NormalizedSignal[]> {
  // Tight subject queries only — no broad music/DC sweeps.
  const primary = terms[0];
  const secondary = terms[1];
  const queries: string[] = [];
  if (primary) {
    queries.push(`"${primary}" ("Washington DC" OR "Washington, DC" OR DMV)`);
    queries.push(`"${primary}" (concert OR venue OR show OR review)`);
  }
  if (secondary && secondary.toLowerCase() !== primary?.toLowerCase()) {
    queries.push(`"${secondary}" "${primary}"`);
  }

  const needles = terms.map((t) => t.toLowerCase()).filter((t) => t.length >= 3);
  const out: NormalizedSignal[] = [];
  for (const q of queries.slice(0, 3)) {
    try {
      const batch = await signalsFromRss({
        ctx,
        source: 'google_news',
        feedUrl: googleNewsRssUrl(q),
        subject: ctx.subject.name,
        signal_type: 'news',
      });
      const focused = batch.filter((s) => {
        const hay = `${s.title || ''} ${s.excerpt}`.toLowerCase();
        return needles.some((n) => hay.includes(n));
      });
      out.push(
        ...focused.map((s) => ({
          ...s,
          confidence: Math.max(s.confidence, 0.62),
          raw: { ...(s.raw || {}), provider: 'google_news', query: q },
        })),
      );
    } catch {
      /* soft fail */
    }
  }
  return out.slice(0, 8);
}

async function localFeedSignals(
  ctx: EnrichContext,
  terms: string[],
): Promise<NormalizedSignal[]> {
  const needles = terms.map((t) => t.toLowerCase()).filter(Boolean);
  if (!needles.length) return [];

  const settled = await Promise.allSettled(
    LOCAL_PRESS_FEEDS.map(async (feed) => {
      const items = await signalsFromRss({
        ctx,
        source: feed.id,
        feedUrl: feed.feedUrl,
        subject: ctx.subject.name,
        signal_type: 'news',
      });
      return items
        .filter((s) => {
          const hay = `${s.title || ''} ${s.excerpt}`.toLowerCase();
          // Prefer full-term match; avoid loose single-token hits like "club"
          return needles.some((n) => {
            if (hay.includes(n)) return true;
            const parts = n.split(/\s+/).filter((w) => w.length > 4 && !/^(club|venue|theater|theatre|hall|show)$/i.test(w));
            return parts.length > 0 && parts.every((w) => hay.includes(w));
          });
        })
        .map((s) => ({
          ...s,
          title: s.title?.startsWith(feed.name) ? s.title : `${feed.name}: ${s.title || 'Article'}`,
          confidence: Math.max(s.confidence, 0.58),
          raw: { ...(s.raw || {}), outlet: feed.name, pack: 'local_press' },
        }));
    }),
  );

  const out: NormalizedSignal[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') out.push(...r.value);
  }
  return out.slice(0, 10);
}

/** Aggregates NewsAPI + Google News + DCist/City Paper/BYT subject hits. */
export const localNewsAdapter: SourceAdapter = {
  id: 'local_news',
  name: 'Local & news sentiment',
  kind: 'api',
  // NEWS_API_KEY optional — Google News RSS + local feeds still run without it.
  requiresEnv: [],
  async discover(ctx) {
    // Metro music news pulse via Google News (no key)
    try {
      return await signalsFromRss({
        ctx,
        source: 'google_news',
        feedUrl: googleNewsRssUrl(
          '(concert OR venue OR "live music") (Washington OR "Washington DC" OR DMV)',
        ),
        subject: 'Washington DC concerts',
        signal_type: 'news',
      });
    } catch {
      return [];
    }
  },
  async enrich(ctx) {
    const terms = buildAudienceSearchTerms(ctx.subject);
    if (!terms.length) return [];

    // Skip NewsAPI by default (too broad / noisy). Opt in with NEWS_API_ENABLED=1.
    const newsApi =
      ctx.getEnv('NEWS_API_ENABLED') === '1' ? await newsApiSignals(ctx, terms) : [];
    const [gnews, local] = await Promise.all([
      googleNewsSignals(ctx, terms),
      localFeedSignals(ctx, terms),
    ]);

    const merged = [...newsApi, ...gnews, ...local];
    ctx.log?.('[local_news] enrich', {
      terms,
      newsApi: newsApi.length,
      googleNews: gnews.length,
      localFeeds: local.length,
      total: merged.length,
    });
    return merged.slice(0, 20);
  },
};

/** Tripadvisor mentions via Google News site: filter (no partner API). */
export const tripadvisorMentionsAdapter: SourceAdapter = {
  id: 'tripadvisor_mentions',
  name: 'Tripadvisor mentions',
  kind: 'rss',
  async enrich(ctx) {
    const focus = venueFocus(ctx.subject);
    if (!focus) return [];
    try {
      const batch = await signalsFromRss({
        ctx,
        source: 'tripadvisor_mentions',
        feedUrl: googleNewsRssUrl(`site:tripadvisor.com "${focus}" (Washington OR DC)`),
        subject: ctx.subject.name,
        signal_type: 'review',
      });
      return batch.slice(0, 6).map((s) => ({
        ...s,
        confidence: Math.max(s.confidence, 0.55),
        signal_type: 'review' as const,
        raw: { ...(s.raw || {}), provider: 'google_news', site: 'tripadvisor.com' },
      }));
    } catch {
      return [];
    }
  },
};

export const AUDIENCE_SENTIMENT_ADAPTERS: SourceAdapter[] = [
  googlePlacesAdapter,
  yelpAdapter,
  localNewsAdapter,
  tripadvisorMentionsAdapter,
];

export type _AudienceEnrich = EnrichContext;
export type _AudienceDiscovery = DiscoveryContext;
