/**
 * Public SEO pages (DC pilot), served through api/share.ts so the deployment stays at
 * the Hobby plan's 12-function cap. middleware.ts rewrites:
 *   getsynth.app/concerts/{city}[/{sub}] -> /api/share?seo=city&slug={city}[&sub={sub}]
 *     sub = "this-weekend" or a genre slug
 *   getsynth.app/guides                  -> /api/share?seo=guides
 *   getsynth.app/{guides|learn|compare}/{slug} -> /api/share?seo=content&type={guide|brand|comparison}&slug={slug}
 *   join.getsynth.app/venues/{slug}      -> /api/share?seo=venue&slug={slug}
 *   join.getsynth.app/artists/{slug}     -> /api/share?seo=artist&slug={slug}
 *   join.getsynth.app/events/{slug}      -> /api/share?seo=event&slug={slug}
 *   {either host}/sitemap-seo.xml        -> /api/share?seo=sitemap&site={getsynth|join}
 *   {either host}/llms.txt               -> /api/share?seo=llms
 *   {either host}/indexnow-key.txt       -> /api/share?seo=indexnow-key
 * Also: /api/share?seo=tracker (visitor tracker JS) and POST /api/share?collect=1.
 *
 * Reads use the anon key, so RLS limits what a page can expose. Every page is noindex
 * until an admin sets seo_settings.mode = 'live' in the admin SEO tab.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  GETSYNTH_ORIGIN,
  artistUrl,
  contentUrl,
  escapeHtml,
  eventHasGenre,
  eventListHtml,
  eventUrl,
  genreLabel,
  isDcVenue,
  renderArtistPage,
  renderCityPage,
  renderContentPage,
  renderEventPage,
  renderGuidesIndex,
  renderLlmsTxt,
  renderNotFound,
  renderSitemap,
  renderVenuePage,
  slugifyGenre,
  venueUrl,
  weekendWindow,
  type CityView,
  type ContentType,
  type FaqItem,
  type LinkItem,
  type ReviewBlock,
  type ReviewSnippets,
  type SeoArtist,
  type SeoEvent,
  type SeoEventDetail,
  type SeoVenueDetail,
} from './render.js';
import { markdownToHtml, type Embed } from './markdown.js';
import { TRACKER_JS } from './tracker.js';
import { handleCollect } from './collect.js';

export type SeoRoute =
  | { kind: 'city'; slug: string; sub: string }
  | { kind: 'venue' | 'artist' | 'event'; slug: string }
  | { kind: 'content'; type: ContentType; slug: string }
  | { kind: 'guides' }
  | { kind: 'llms' }
  | { kind: 'sitemap'; site: 'getsynth' | 'join' }
  | { kind: 'indexnow-key' }
  | { kind: 'tracker' }
  | { kind: 'collect' };

const SLUG_RE = /^[a-z0-9-]{1,160}$/;
const CONTENT_TYPES: ContentType[] = ['guide', 'brand', 'comparison'];
const DC = { slug: 'washington-dc', name: 'Washington, DC' };
/** A genre page is indexed (and listed in the sitemap) once it has this many upcoming shows. */
export const MIN_GENRE_EVENTS = 5;
const EVENT_SELECT =
  'id,slug,title,event_date,event_status,ticket_urls,external_url,genres,artist:artists(id,name,slug),venue:venues(id,name,slug,city,state)';
const CACHE_OK = 'public, s-maxage=3600, stale-while-revalidate=86400';
/** Content pages revalidate when seo_content.updated_at changes (ETag). */
const CACHE_CONTENT = 'public, max-age=0, s-maxage=86400, must-revalidate';
const CACHE_MISS = 'public, s-maxage=300';

const cleanSlug = (value: string | undefined) => {
  const slug = value?.toLowerCase();
  return slug && SLUG_RE.test(slug) ? slug : '';
};

/** Same fallback as readShareQuery in api/share.ts: rewrites can leave req.query empty. */
export function readSeoRoute(req: VercelRequest): SeoRoute | null {
  const fromParams = (get: (key: string) => string | undefined): SeoRoute | null => {
    if (get('collect')) return { kind: 'collect' };
    const kind = get('seo');
    if (kind === 'sitemap') {
      const site = get('site');
      return site === 'getsynth' || site === 'join' ? { kind, site } : null;
    }
    if (kind === 'indexnow-key' || kind === 'tracker' || kind === 'guides' || kind === 'llms') return { kind };
    // Invalid slugs still route here (as a 404) instead of falling through to share cards.
    if (kind === 'city') return { kind, slug: cleanSlug(get('slug')), sub: get('sub') ? cleanSlug(get('sub')) || '!' : '' };
    if (kind === 'venue' || kind === 'artist' || kind === 'event') return { kind, slug: cleanSlug(get('slug')) };
    if (kind === 'content') {
      const type = get('type') as ContentType | undefined;
      return { kind, type: type && CONTENT_TYPES.includes(type) ? type : 'guide', slug: cleanSlug(get('slug')) };
    }
    return null;
  };

  const direct = fromParams((key) => {
    const raw = req.query[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return typeof value === 'string' && value.trim() ? value.trim() : undefined;
  });
  if (direct) return direct;

  const candidates = [req.url, req.headers['x-vercel-forwarded-url'], req.headers['x-vercel-original-url']];
  for (const raw of candidates) {
    if (typeof raw !== 'string' || !raw) continue;
    try {
      const params = new URL(raw, 'https://placeholder.local').searchParams;
      const route = fromParams((key) => params.get(key)?.trim() || undefined);
      if (route) return route;
    } catch {
      // try next candidate
    }
  }
  return null;
}

export function seoClient(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim();
  const key =
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_ANON_KEY?.trim() ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

export type SeoSettings = { live: boolean; minVenueEvents: number };

export async function loadSettings(db: SupabaseClient): Promise<SeoSettings> {
  const { data, error } = await db.from('seo_settings').select('mode,min_venue_events').maybeSingle();
  if (error || !data) return { live: false, minVenueEvents: 3 };
  return { live: data.mode === 'live', minVenueEvents: data.min_venue_events ?? 3 };
}

export type Candidate = { entity_type: 'venue' | 'artist'; entity_id: string; name: string; slug: string | null; upcoming_events: number };

export async function loadCandidates(db: SupabaseClient): Promise<Candidate[]> {
  const { data, error } = await db.rpc('seo_page_candidates');
  if (error) throw new Error(`seo_page_candidates: ${error.message}`);
  return (data ?? []) as Candidate[];
}

export async function loadGenreCounts(db: SupabaseClient): Promise<Array<{ slug: string; label: string; count: number }>> {
  const { data, error } = await db.rpc('seo_genre_counts');
  if (error) throw new Error(`seo_genre_counts: ${error.message}`);
  return ((data ?? []) as Array<{ genre_slug: string; upcoming_events: number }>)
    .map((g) => ({ slug: g.genre_slug, label: genreLabel(g.genre_slug), count: g.upcoming_events }))
    .sort((a, b) => b.count - a.count);
}

/** Interest counts are decoration: a failure leaves them off instead of failing the page. */
export async function attachInterest(db: SupabaseClient, events: SeoEvent[]): Promise<void> {
  if (events.length === 0) return;
  const { data, error } = await db.rpc('seo_event_interest_counts', { p_event_ids: events.map((e) => e.id) });
  if (error) {
    console.warn('[seo] interest counts unavailable', error.message);
    return;
  }
  const counts = new Map(((data ?? []) as Array<{ event_id: string; interested: number }>).map((r) => [r.event_id, r.interested]));
  for (const event of events) event.interested = counts.get(event.id) ?? 0;
}

const EMPTY_BLOCK: ReviewBlock = { count: 0, avg: null, snippets: [] };

function toBlock(raw: unknown): ReviewBlock | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as { count?: number; avg?: number | string | null; snippets?: Array<{ rating: number | string | null; text: string; date: string }> };
  const count = Number(r.count ?? 0);
  if (!count) return null;
  return {
    count,
    avg: r.avg == null ? null : Number(r.avg),
    snippets: (r.snippets ?? []).filter((s) => typeof s.text === 'string').map((s) => ({ ...s, rating: s.rating == null ? null : Number(s.rating) })),
  };
}

/** Member reviews are decoration too. */
async function loadReviews(db: SupabaseClient, ids: { artist?: string | null; venue?: string | null; event?: string | null }): Promise<ReviewSnippets> {
  const { data, error } = await db.rpc('seo_review_snippets', {
    p_artist_id: ids.artist ?? null,
    p_venue_id: ids.venue ?? null,
    p_event_id: ids.event ?? null,
  });
  if (error || !data) {
    if (error) console.warn('[seo] review snippets unavailable', error.message);
    return {};
  }
  const d = data as Record<string, unknown>;
  return { artist: toBlock(d.artist), venue: toBlock(d.venue), event: toBlock(d.event) };
}

function isActive(event: SeoEvent): boolean {
  return event.event_status !== 'cancelled';
}

/** `total` is the full upcoming count; `events` is capped at `limit` for the page list. */
async function upcomingEvents(
  db: SupabaseClient,
  column: 'venue_id' | 'artist_id',
  ids: string[],
  limit: number,
): Promise<{ events: SeoEvent[]; total: number }> {
  if (ids.length === 0) return { events: [], total: 0 };
  const { data, error, count } = await db
    .from('events')
    .select(EVENT_SELECT, { count: 'exact' })
    .in(column, ids)
    .gte('event_date', new Date().toISOString())
    .order('event_date', { ascending: true })
    .limit(limit);
  if (error) throw new Error(`events: ${error.message}`);
  const events = (data ?? []) as unknown as SeoEvent[];
  return { events, total: count ?? events.length };
}

/** All upcoming DC events (about 640 today). shortcut: capped at 1000; page it if DC outgrows that. */
export async function loadDcEvents(db: SupabaseClient): Promise<SeoEvent[]> {
  const venues = (await loadCandidates(db)).filter((c) => c.entity_type === 'venue');
  const { events } = await upcomingEvents(db, 'venue_id', venues.map((v) => v.entity_id), 1000);
  return events;
}

export type ContentRow = {
  page_type: ContentType;
  slug: string;
  title: string;
  meta_description: string;
  summary: string;
  body_md: string;
  faq: unknown;
  keywords: string[] | null;
  published_at: string | null;
  updated_at: string;
};

const CONTENT_LIST_SELECT = 'page_type,slug,title,summary,keywords,updated_at';

/** Published guide/brand/comparison pages, newest first. RLS hides everything unpublished. */
export async function loadPublishedContent(db: SupabaseClient): Promise<Array<Pick<ContentRow, 'page_type' | 'slug' | 'title' | 'summary' | 'keywords' | 'updated_at'>>> {
  const { data, error } = await db
    .from('seo_content')
    .select(CONTENT_LIST_SELECT)
    .eq('status', 'published')
    .order('published_at', { ascending: false })
    .limit(500);
  if (error) {
    console.warn('[seo] content unavailable', error.message);
    return [];
  }
  return (data ?? []) as Array<Pick<ContentRow, 'page_type' | 'slug' | 'title' | 'summary' | 'keywords' | 'updated_at'>>;
}

/** Guides whose title or keywords mention one of the terms, then going-together guides. */
function relatedContent(
  items: Awaited<ReturnType<typeof loadPublishedContent>>,
  terms: string[],
  limit: number,
  exclude?: string,
): LinkItem[] {
  const needles = terms.map((t) => t.toLowerCase()).filter((t) => t.length >= 3);
  const scored = items
    .filter((i) => i.slug !== exclude)
    .map((i) => {
      const hay = `${i.title} ${(i.keywords ?? []).join(' ')}`.toLowerCase();
      const score = needles.reduce((s, n) => s + (hay.includes(n) ? 2 : 0), 0) + (/alone|solo|friends|people|buddy/.test(hay) ? 1 : 0);
      return { i, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return scored.slice(0, limit).map(({ i }) => ({ title: i.title, url: contentUrl(i.page_type, i.slug) }));
}

function setlistSongs(raw: unknown): string[] {
  const pick = (x: unknown): string | null => {
    if (typeof x === 'string') return x;
    if (x && typeof x === 'object') {
      for (const key of ['name', 'title', 'song', 'song_name']) {
        const v = (x as Record<string, unknown>)[key];
        if (typeof v === 'string') return v;
      }
    }
    return null;
  };
  let list: unknown[] = [];
  if (Array.isArray(raw)) list = raw;
  else if (raw && typeof raw === 'object') {
    const o = raw as Record<string, any>;
    if (Array.isArray(o.songs)) list = o.songs;
    else if (Array.isArray(o.setlist)) list = o.setlist;
    else if (o.sets?.set) {
      const sets = Array.isArray(o.sets.set) ? o.sets.set : [o.sets.set];
      list = sets.flatMap((s: any) => (Array.isArray(s?.song) ? s.song : []));
    }
  }
  if (list.length && list.every((x) => x && typeof x === 'object' && Array.isArray((x as any).songs))) {
    list = list.flatMap((x: any) => x.songs);
  }
  return list
    .map(pick)
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map((s) => s.trim())
    .slice(0, 60);
}

function firstImage(row: Record<string, any>): string | null {
  const candidates: unknown[] = [row.poster_image_url, row.event_media_url];
  if (Array.isArray(row.images)) {
    for (const img of row.images) candidates.push(typeof img === 'string' ? img : img?.url);
  }
  const hit = candidates.find((u) => typeof u === 'string' && /^https?:\/\//.test(u));
  return (hit as string) ?? null;
}

function num(value: unknown): number | null {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

/** venues rows vary (flat columns vs JamBase JSONB); read whatever is there. */
function toVenueDetail(row: Record<string, any>): SeoVenueDetail {
  const address = row.address && typeof row.address === 'object' ? row.address : {};
  const geo = row.geo && typeof row.geo === 'object' ? row.geo : {};
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    city: row.city ?? address.addressLocality ?? null,
    state: row.state ?? address.addressRegion?.name ?? address.addressRegion ?? null,
    street_address: row.street_address ?? address.streetAddress ?? null,
    postal_code: row.zip ?? row.postal_code ?? address.postalCode ?? null,
    capacity: num(row.maximum_attendee_capacity),
    image_url: typeof row.image_url === 'string' ? row.image_url : null,
    latitude: num(row.latitude ?? geo.latitude),
    longitude: num(row.longitude ?? geo.longitude),
  };
}

export type SitemapEntry = { loc: string; lastmod?: string | null };

/** Indexable public URLs for one host; used by the sitemap and the IndexNow cron. */
export async function collectSeoEntries(db: SupabaseClient, site: 'getsynth' | 'join', settings: SeoSettings): Promise<SitemapEntry[]> {
  if (!settings.live) return [];
  const today = new Date().toISOString().slice(0, 10);
  if (site === 'getsynth') {
    const cityUrl = `${GETSYNTH_ORIGIN}/concerts/${DC.slug}`;
    const [genres, content] = await Promise.all([loadGenreCounts(db), loadPublishedContent(db)]);
    return [
      { loc: cityUrl, lastmod: today },
      { loc: `${cityUrl}/this-weekend`, lastmod: today },
      ...genres.filter((g) => g.count >= MIN_GENRE_EVENTS).map((g) => ({ loc: `${cityUrl}/${g.slug}`, lastmod: today })),
      ...(content.length ? [{ loc: `${GETSYNTH_ORIGIN}/guides`, lastmod: content[0].updated_at }] : []),
      ...content.map((c) => ({ loc: contentUrl(c.page_type, c.slug), lastmod: c.updated_at })),
    ];
  }
  const entries: SitemapEntry[] = [];
  for (const c of await loadCandidates(db)) {
    if (!c.slug) continue;
    if (c.entity_type === 'venue' && c.upcoming_events >= settings.minVenueEvents) entries.push({ loc: venueUrl(c.slug) });
    if (c.entity_type === 'artist' && c.upcoming_events >= 1) entries.push({ loc: artistUrl(c.slug) });
  }
  for (const e of await loadDcEvents(db)) {
    if (e.slug && isActive(e)) entries.push({ loc: eventUrl(e.slug) });
  }
  return entries;
}

export async function collectSeoUrls(db: SupabaseClient, site: 'getsynth' | 'join', settings: SeoSettings): Promise<string[]> {
  return (await collectSeoEntries(db, site, settings)).map((e) => e.loc);
}

function send(
  req: VercelRequest,
  res: VercelResponse,
  status: number,
  body: string,
  type: 'html' | 'xml' | 'text' | 'js',
  cache: string,
  etag?: string,
) {
  const contentType = { html: 'text/html', xml: 'application/xml', text: 'text/plain', js: 'application/javascript' }[type];
  res.setHeader('Content-Type', `${contentType}; charset=utf-8`);
  res.setHeader('Cache-Control', cache);
  if (etag) {
    res.setHeader('ETag', etag);
    const inm = req.headers['if-none-match'];
    const match = typeof inm === 'string' && inm.split(',').map((s) => s.trim()).includes(etag);
    if (match && status === 200) return res.status(304).end();
  }
  return res.status(status).send(body);
}

function parseFaq(raw: unknown): FaqItem[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((f): f is { q: string; a: string } => !!f && typeof f.q === 'string' && typeof f.a === 'string')
    .slice(0, 10)
    .map((f) => ({ q: f.q, a: f.a }));
}

/** Fills {{events ...}} / {{venues ...}} placeholders with current DC listings. */
async function renderEmbeds(db: SupabaseClient, html: string, embeds: Embed[]): Promise<string> {
  if (embeds.length === 0) return html;
  const [events, candidates] = await Promise.all([loadDcEvents(db), loadCandidates(db)]);
  const venuesBySlug = new Map(candidates.filter((c) => c.entity_type === 'venue' && c.slug).map((c) => [c.slug!, c]));
  const blocks = embeds.map((embed) => {
    const limit = Math.min(12, Math.max(1, Number(embed.params.limit) || 6));
    if (embed.kind === 'venues') {
      const rows = candidates
        .filter((c) => c.entity_type === 'venue' && c.slug && c.upcoming_events > 0)
        .sort((a, b) => b.upcoming_events - a.upcoming_events)
        .slice(0, limit);
      return rows.length
        ? `<ul class="links">${rows.map((v) => `<li><a href="${escapeHtml(venueUrl(v.slug!))}">${escapeHtml(v.name)}</a> <span class="muted">· ${v.upcoming_events} upcoming shows</span></li>`).join('')}</ul>`
        : '';
    }
    let list = events.filter(isActive);
    if (embed.params.genre) list = list.filter((e) => eventHasGenre(e, embed.params.genre));
    if (embed.params.venue) {
      const venue = venuesBySlug.get(embed.params.venue);
      list = venue ? list.filter((e) => e.venue?.id === venue.entity_id) : [];
    }
    if (embed.params.window === 'weekend') {
      const { start, end } = weekendWindow(new Date());
      list = list.filter((e) => {
        const t = new Date(e.event_date).getTime();
        return t >= start.getTime() && t < end.getTime();
      });
    } else if (embed.params.window === 'week' || embed.params.window === 'month') {
      const horizon = Date.now() + (embed.params.window === 'week' ? 7 : 31) * 86_400_000;
      list = list.filter((e) => new Date(e.event_date).getTime() < horizon);
    }
    return list.length ? eventListHtml(list.slice(0, limit), 'both') : '';
  });
  return html.replace(/<!--embed:(\d+)-->/g, (_, i: string) => blocks[Number(i)] ?? '');
}

const SITE_CITY_LINKS: LinkItem[] = [
  { title: 'Concerts in Washington, DC', url: `${GETSYNTH_ORIGIN}/concerts/${DC.slug}` },
  { title: 'Concerts in Washington, DC this weekend', url: `${GETSYNTH_ORIGIN}/concerts/${DC.slug}/this-weekend` },
];

export async function handleSeoRoute(route: SeoRoute, req: VercelRequest, res: VercelResponse) {
  if (route.kind === 'collect') return handleCollect(req, res);
  if (route.kind === 'tracker') return send(req, res, 200, TRACKER_JS, 'js', 'public, max-age=3600, s-maxage=86400');
  if (route.kind === 'indexnow-key') {
    const key = process.env.INDEXNOW_KEY?.trim();
    return key ? send(req, res, 200, key, 'text', CACHE_OK) : send(req, res, 404, 'Not found', 'text', CACHE_MISS);
  }

  const db = seoClient();
  if (!db) return res.status(500).send('Server configuration error');

  try {
    const settings = await loadSettings(db);

    if (route.kind === 'sitemap') {
      return send(req, res, 200, renderSitemap(await collectSeoEntries(db, route.site, settings)), 'xml', CACHE_OK);
    }

    if (route.kind === 'llms') {
      const [content, candidates] = await Promise.all([loadPublishedContent(db), loadCandidates(db)]);
      const venues = candidates
        .filter((c) => c.entity_type === 'venue' && c.slug && c.upcoming_events >= settings.minVenueEvents)
        .sort((a, b) => b.upcoming_events - a.upcoming_events)
        .slice(0, 25)
        .map((c) => ({ title: c.name, url: venueUrl(c.slug!) }));
      const txt = renderLlmsTxt({
        content: content.map((c) => ({ type: c.page_type, slug: c.slug, title: c.title, summary: c.summary })),
        cityLinks: SITE_CITY_LINKS,
        venues,
      });
      return send(req, res, 200, txt, 'text', CACHE_OK);
    }

    if (route.kind === 'guides') {
      const content = await loadPublishedContent(db);
      const html = renderGuidesIndex({
        items: content.map((c) => ({ type: c.page_type, slug: c.slug, title: c.title, summary: c.summary })),
        cityLinks: SITE_CITY_LINKS,
      });
      return send(req, res, 200, settings.live && content.length ? html : html.replace('content="index, follow"', 'content="noindex, follow"'), 'html', CACHE_OK);
    }

    if (route.kind === 'content') {
      if (!route.slug) return send(req, res, 404, renderNotFound(), 'html', CACHE_MISS);
      const { data, error } = await db
        .from('seo_content')
        .select('page_type,slug,title,meta_description,summary,body_md,faq,keywords,published_at,updated_at')
        .eq('page_type', route.type)
        .eq('slug', route.slug)
        .eq('status', 'published')
        .maybeSingle();
      if (error) throw new Error(`seo_content: ${error.message}`);
      const row = data as ContentRow | null;
      if (!row) return send(req, res, 404, renderNotFound(), 'html', CACHE_MISS);
      const { html, embeds } = markdownToHtml(row.body_md);
      const [bodyHtml, all] = await Promise.all([renderEmbeds(db, html, embeds), loadPublishedContent(db)]);
      const related = relatedContent(all, row.keywords ?? [], 5, row.slug);
      const page = renderContentPage({
        type: row.page_type,
        slug: row.slug,
        title: row.title,
        metaDescription: row.meta_description,
        summary: row.summary,
        bodyHtml,
        faq: parseFaq(row.faq),
        publishedAt: row.published_at,
        updatedAt: row.updated_at,
        related: related.length ? related : SITE_CITY_LINKS,
        indexable: settings.live,
      });
      const etag = `"seo-${row.slug}-${row.updated_at ?? row.published_at ?? '0'}"`;
      return send(req, res, 200, page, 'html', CACHE_CONTENT, etag);
    }

    if (route.kind === 'city') {
      // shortcut: one city; add a cities table when the pilot expands.
      if (route.slug !== DC.slug) return send(req, res, 404, renderNotFound(), 'html', CACHE_MISS);
      const [allEvents, genres, content] = await Promise.all([loadDcEvents(db), loadGenreCounts(db), loadPublishedContent(db)]);

      let view: CityView = { kind: 'all' };
      let events = allEvents;
      let indexable = settings.live;
      if (route.sub === 'this-weekend') {
        const { start, end, label } = weekendWindow(new Date());
        view = { kind: 'weekend', label };
        events = allEvents.filter((e) => {
          const t = new Date(e.event_date).getTime();
          return t >= start.getTime() && t < end.getTime();
        });
      } else if (route.sub) {
        events = allEvents.filter((e) => eventHasGenre(e, route.sub));
        if (events.length === 0) return send(req, res, 404, renderNotFound(), 'html', CACHE_MISS);
        view = { kind: 'genre', slug: route.sub, label: genreLabel(route.sub) };
        indexable = settings.live && events.filter(isActive).length >= MIN_GENRE_EVENTS;
      }

      await attachInterest(db, events);
      const guideTerms = view.kind === 'genre' ? [view.label, view.slug] : view.kind === 'weekend' ? ['weekend', 'this week'] : ['DC', 'venue'];
      const html = renderCityPage({
        cityName: DC.name,
        citySlug: DC.slug,
        view,
        events,
        genres: genres.filter((g) => g.count >= MIN_GENRE_EVENTS),
        indexable,
        guides: relatedContent(content, guideTerms, 6),
      });
      return send(req, res, 200, html, 'html', CACHE_OK);
    }

    if (route.kind === 'venue') {
      const { data: row, error } = route.slug
        ? await db.from('venues').select('*').eq('slug', route.slug).maybeSingle()
        : { data: null, error: null };
      if (error) throw new Error(`venues: ${error.message}`);
      if (!row?.name || !row.slug) return send(req, res, 404, renderNotFound(), 'html', CACHE_MISS);
      const venue = toVenueDetail(row);
      const [{ events, total }, reviews, content] = await Promise.all([
        upcomingEvents(db, 'venue_id', [venue.id], 50),
        loadReviews(db, { venue: venue.id }),
        loadPublishedContent(db),
      ]);
      await attachInterest(db, events);
      const indexable = settings.live && isDcVenue(venue) && events.filter(isActive).length >= settings.minVenueEvents;
      const html = renderVenuePage({
        venue,
        events,
        total,
        indexable,
        reviews: reviews.venue ?? EMPTY_BLOCK,
        guides: relatedContent(content, [venue.name, 'venue'], 4),
      });
      return send(req, res, 200, html, 'html', CACHE_OK);
    }

    if (route.kind === 'event') {
      return await handleEvent(db, route.slug, settings, res);
    }

    const { data: artistRow, error } = route.slug
      ? await db.from('artists').select('id,name,slug,genres,image_url').eq('slug', route.slug).maybeSingle()
      : { data: null, error: null };
    if (error) throw new Error(`artists: ${error.message}`);
    const artist = artistRow as SeoArtist | null;
    if (!artist?.name || !artist.slug) return send(req, res, 404, renderNotFound(), 'html', CACHE_MISS);
    const [{ events, total }, reviews] = await Promise.all([
      upcomingEvents(db, 'artist_id', [artist.id], 50),
      loadReviews(db, { artist: artist.id }),
    ]);
    await attachInterest(db, events);
    const indexable = settings.live && events.some((e) => isActive(e) && isDcVenue(e.venue));
    return send(req, res, 200, renderArtistPage({ artist, events, total, indexable, reviews: reviews.artist ?? EMPTY_BLOCK }), 'html', CACHE_OK);
  } catch (err) {
    console.error('[seo] render failed', route, err);
    return send(req, res, 500, renderNotFound(), 'html', 'no-store');
  }
}

async function handleEvent(db: SupabaseClient, slug: string, settings: SeoSettings, res: VercelResponse) {
  if (!slug) return send(req, res, 404, renderNotFound(), 'html', CACHE_MISS);
  const { data: row, error } = await db
    .from('events')
    .select('*, artist:artists(id,name,slug,genres,image_url), venue:venues(*)')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`events: ${error.message}`);
  if (!row) return send(req, res, 404, renderNotFound(), 'html', CACHE_MISS);

  const venue = row.venue ? toVenueDetail(row.venue) : null;
  const artist = (row.artist as SeoArtist | null) ?? null;
  const isPast = new Date(row.event_date).getTime() < Date.now() - 6 * 3_600_000;
  const event: SeoEventDetail = {
    id: row.id,
    slug: row.slug,
    title: row.title,
    event_date: row.event_date,
    event_status: row.event_status ?? null,
    ticket_urls: row.ticket_urls,
    external_url: row.external_url ?? null,
    genres: row.genres ?? null,
    artist: artist ? { id: artist.id, name: artist.name, slug: artist.slug } : null,
    venue: venue ? { id: venue.id, name: venue.name, slug: venue.slug, city: venue.city, state: venue.state } : null,
    doors_time: row.doors_time ?? null,
    price_min: num(row.price_min),
    price_max: num(row.price_max),
    price_currency: row.price_currency ?? null,
    tour_name: row.tour_name ?? null,
    image_url: firstImage(row),
    ticket_available: typeof row.ticket_available === 'boolean' ? row.ticket_available : null,
    setlist_songs: setlistSongs(row.setlist),
    setlist_url: row.setlist_fm_url ?? null,
  };

  const [reviews, moreDates, recent, dcEvents, content] = await Promise.all([
    loadReviews(db, { artist: artist?.id, venue: venue?.id, event: event.id }),
    artist ? upcomingEvents(db, 'artist_id', [artist.id], 9) : Promise.resolve({ events: [] as SeoEvent[], total: 0 }),
    artist && !event.setlist_songs?.length
      ? db
          .from('events')
          .select('event_date,setlist,setlist_fm_url,venue:venues(name)')
          .eq('artist_id', artist.id)
          .lt('event_date', new Date().toISOString())
          .not('setlist', 'is', null)
          .order('event_date', { ascending: false })
          .limit(3)
      : Promise.resolve({ data: [] as any[], error: null }),
    isPast ? Promise.resolve([] as SeoEvent[]) : loadDcEvents(db),
    loadPublishedContent(db),
  ]);

  let recentSetlist: { date: string; venueName: string | null; songs: string[]; url: string | null } | null = null;
  for (const r of ((recent as { data: any[] | null }).data ?? [])) {
    const songs = setlistSongs(r.setlist);
    if (songs.length >= 5) {
      recentSetlist = { date: r.event_date, venueName: r.venue?.name ?? null, songs, url: r.setlist_fm_url ?? null };
      break;
    }
  }

  const eventTime = new Date(event.event_date).getTime();
  const genreSlugs = new Set((event.genres ?? artist?.genres ?? []).map(slugifyGenre));
  const similar = dcEvents
    .filter((e) => e.id !== event.id && e.artist?.id !== artist?.id && isActive(e))
    .filter((e) => (e.genres ?? []).some((g) => genreSlugs.has(slugifyGenre(g))))
    .filter((e) => Math.abs(new Date(e.event_date).getTime() - eventTime) < 10 * 86_400_000)
    .slice(0, 6);
  const others = moreDates.events.filter((e) => e.id !== event.id).slice(0, 8);
  const interestTargets: SeoEvent[] = [event, ...others, ...similar];
  await attachInterest(db, interestTargets);

  const hasOwnContent = (reviews.event?.count ?? 0) > 0 || (event.setlist_songs?.length ?? 0) >= 5;
  const indexable =
    settings.live && isDcVenue(venue) && (isPast ? hasOwnContent : isActive(event));

  const guideTerms = [venue?.name ?? '', ...(event.genres ?? []).slice(0, 2), 'alone'];
  const html = renderEventPage({
    event,
    venue,
    artist,
    reviews,
    recentSetlist,
    moreDates: others,
    similar,
    guides: relatedContent(content, guideTerms, 4),
    isPast,
    indexable,
  });
  return send(req, res, 200, html, 'html', CACHE_OK);
}
