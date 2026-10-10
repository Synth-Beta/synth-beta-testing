/**
 * Public SEO pages (DC pilot), served through api/share.ts so the deployment stays at
 * the Hobby plan's 12-function cap. middleware.ts rewrites:
 *   getsynth.app/concerts/{city}[/{sub}] -> /api/share?seo=city&slug={city}[&sub={sub}]
 *     sub = "this-weekend" or a genre slug
 *   join.getsynth.app/venues/{slug}      -> /api/share?seo=venue&slug={slug}
 *   join.getsynth.app/artists/{slug}     -> /api/share?seo=artist&slug={slug}
 *   {either host}/sitemap-seo.xml        -> /api/share?seo=sitemap&site={getsynth|join}
 *   {either host}/indexnow-key.txt       -> /api/share?seo=indexnow-key
 *
 * Reads use the anon key, so RLS limits what a page can expose. Every page is noindex
 * until an admin sets seo_settings.mode = 'live' in the admin SEO tab.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  GETSYNTH_ORIGIN,
  artistUrl,
  eventHasGenre,
  genreLabel,
  renderArtistPage,
  renderCityPage,
  renderNotFound,
  renderSitemap,
  renderVenuePage,
  venueUrl,
  weekendWindow,
  type CityView,
  type SeoEvent,
} from './render.js';

export type SeoRoute =
  | { kind: 'city'; slug: string; sub: string }
  | { kind: 'venue' | 'artist'; slug: string }
  | { kind: 'sitemap'; site: 'getsynth' | 'join' }
  | { kind: 'indexnow-key' };

const SLUG_RE = /^[a-z0-9-]{1,160}$/;
const DC = { slug: 'washington-dc', name: 'Washington, DC', city: 'washington', state: 'District of Columbia' };
/** A genre page is indexed (and listed in the sitemap) once it has this many upcoming shows. */
export const MIN_GENRE_EVENTS = 5;
const EVENT_SELECT =
  'id,title,event_date,event_status,ticket_urls,external_url,genres,artist:artists(id,name,slug),venue:venues(id,name,slug,city,state)';
const CACHE_OK = 'public, s-maxage=3600, stale-while-revalidate=86400';
const CACHE_MISS = 'public, s-maxage=300';

const cleanSlug = (value: string | undefined) => {
  const slug = value?.toLowerCase();
  return slug && SLUG_RE.test(slug) ? slug : '';
};

/** Same fallback as readShareQuery in api/share.ts: rewrites can leave req.query empty. */
export function readSeoRoute(req: VercelRequest): SeoRoute | null {
  const fromParams = (get: (key: string) => string | undefined): SeoRoute | null => {
    const kind = get('seo');
    if (kind === 'sitemap') {
      const site = get('site');
      return site === 'getsynth' || site === 'join' ? { kind, site } : null;
    }
    if (kind === 'indexnow-key') return { kind };
    // Invalid slugs still route here (as a 404) instead of falling through to share cards.
    if (kind === 'city') return { kind, slug: cleanSlug(get('slug')), sub: get('sub') ? cleanSlug(get('sub')) || '!' : '' };
    if (kind === 'venue' || kind === 'artist') return { kind, slug: cleanSlug(get('slug')) };
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

type Candidate = { entity_type: 'venue' | 'artist'; entity_id: string; name: string; slug: string | null; upcoming_events: number };

async function loadCandidates(db: SupabaseClient): Promise<Candidate[]> {
  const { data, error } = await db.rpc('seo_page_candidates');
  if (error) throw new Error(`seo_page_candidates: ${error.message}`);
  return (data ?? []) as Candidate[];
}

async function loadGenreCounts(db: SupabaseClient): Promise<Array<{ slug: string; label: string; count: number }>> {
  const { data, error } = await db.rpc('seo_genre_counts');
  if (error) throw new Error(`seo_genre_counts: ${error.message}`);
  return ((data ?? []) as Array<{ genre_slug: string; upcoming_events: number }>)
    .map((g) => ({ slug: g.genre_slug, label: genreLabel(g.genre_slug), count: g.upcoming_events }))
    .sort((a, b) => b.count - a.count);
}

/** Interest counts are decoration: a failure leaves them off instead of failing the page. */
async function attachInterest(db: SupabaseClient, events: SeoEvent[]): Promise<void> {
  if (events.length === 0) return;
  const { data, error } = await db.rpc('seo_event_interest_counts', { p_event_ids: events.map((e) => e.id) });
  if (error) {
    console.warn('[seo] interest counts unavailable', error.message);
    return;
  }
  const counts = new Map(((data ?? []) as Array<{ event_id: string; interested: number }>).map((r) => [r.event_id, r.interested]));
  for (const event of events) event.interested = counts.get(event.id) ?? 0;
}

function isDc(venue: { city: string | null; state: string | null } | null | undefined): boolean {
  return !!venue && venue.city?.trim().toLowerCase() === DC.city && venue.state === DC.state;
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
async function loadDcEvents(db: SupabaseClient): Promise<SeoEvent[]> {
  const venues = (await loadCandidates(db)).filter((c) => c.entity_type === 'venue');
  const { events } = await upcomingEvents(db, 'venue_id', venues.map((v) => v.entity_id), 1000);
  return events;
}

/** Indexable public URLs for one host; used by the sitemap and the IndexNow cron. */
export async function collectSeoUrls(db: SupabaseClient, site: 'getsynth' | 'join', settings: SeoSettings): Promise<string[]> {
  if (!settings.live) return [];
  if (site === 'getsynth') {
    const cityUrl = `${GETSYNTH_ORIGIN}/concerts/${DC.slug}`;
    const genres = (await loadGenreCounts(db)).filter((g) => g.count >= MIN_GENRE_EVENTS);
    return [cityUrl, `${cityUrl}/this-weekend`, ...genres.map((g) => `${cityUrl}/${g.slug}`)];
  }
  const urls: string[] = [];
  for (const c of await loadCandidates(db)) {
    if (!c.slug) continue;
    if (c.entity_type === 'venue' && c.upcoming_events >= settings.minVenueEvents) urls.push(venueUrl(c.slug));
    if (c.entity_type === 'artist' && c.upcoming_events >= 1) urls.push(artistUrl(c.slug));
  }
  return urls;
}

function send(res: VercelResponse, status: number, body: string, type: 'html' | 'xml' | 'text', cache: string) {
  const contentType = { html: 'text/html', xml: 'application/xml', text: 'text/plain' }[type];
  res.setHeader('Content-Type', `${contentType}; charset=utf-8`);
  res.setHeader('Cache-Control', cache);
  return res.status(status).send(body);
}

export async function handleSeoRoute(route: SeoRoute, res: VercelResponse) {
  if (route.kind === 'indexnow-key') {
    const key = process.env.INDEXNOW_KEY?.trim();
    return key ? send(res, 200, key, 'text', CACHE_OK) : send(res, 404, 'Not found', 'text', CACHE_MISS);
  }

  const db = seoClient();
  if (!db) return res.status(500).send('Server configuration error');

  try {
    const settings = await loadSettings(db);

    if (route.kind === 'sitemap') {
      return send(res, 200, renderSitemap(await collectSeoUrls(db, route.site, settings)), 'xml', CACHE_OK);
    }

    if (route.kind === 'city') {
      // shortcut: one city; add a cities table when the pilot expands.
      if (route.slug !== DC.slug) return send(res, 404, renderNotFound(), 'html', CACHE_MISS);
      const [allEvents, genres] = await Promise.all([loadDcEvents(db), loadGenreCounts(db)]);

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
        if (events.length === 0) return send(res, 404, renderNotFound(), 'html', CACHE_MISS);
        view = { kind: 'genre', slug: route.sub, label: genreLabel(route.sub) };
        indexable = settings.live && events.filter(isActive).length >= MIN_GENRE_EVENTS;
      }

      await attachInterest(db, events);
      const html = renderCityPage({
        cityName: DC.name,
        citySlug: DC.slug,
        view,
        events,
        genres: genres.filter((g) => g.count >= MIN_GENRE_EVENTS),
        indexable,
      });
      return send(res, 200, html, 'html', CACHE_OK);
    }

    if (route.kind === 'venue') {
      const { data: venue, error } = route.slug
        ? await db.from('venues').select('id,name,slug,city,state,street_address').eq('slug', route.slug).maybeSingle()
        : { data: null, error: null };
      if (error) throw new Error(`venues: ${error.message}`);
      if (!venue?.name || !venue.slug) return send(res, 404, renderNotFound(), 'html', CACHE_MISS);
      const { events, total } = await upcomingEvents(db, 'venue_id', [venue.id], 50);
      await attachInterest(db, events);
      const indexable = settings.live && isDc(venue) && events.filter(isActive).length >= settings.minVenueEvents;
      return send(res, 200, renderVenuePage({ venue, events, total, indexable }), 'html', CACHE_OK);
    }

    const { data: artist, error } = route.slug
      ? await db.from('artists').select('id,name,slug,genres').eq('slug', route.slug).maybeSingle()
      : { data: null, error: null };
    if (error) throw new Error(`artists: ${error.message}`);
    if (!artist?.name || !artist.slug) return send(res, 404, renderNotFound(), 'html', CACHE_MISS);
    const { events, total } = await upcomingEvents(db, 'artist_id', [artist.id], 50);
    await attachInterest(db, events);
    const indexable = settings.live && events.some((e) => isActive(e) && isDc(e.venue));
    return send(res, 200, renderArtistPage({ artist, events, total, indexable }), 'html', CACHE_OK);
  } catch (err) {
    console.error('[seo] render failed', route, err);
    return send(res, 500, renderNotFound(), 'html', 'no-store');
  }
}
