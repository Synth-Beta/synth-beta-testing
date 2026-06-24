/**
 * /share — Dynamic OG preview page for Synth share links.
 *
 * Fetches real event / review / artist / venue data from Supabase and returns
 * server-rendered HTML with correct og:title, og:description, og:image so that
 * iMessage, WhatsApp, Instagram DMs etc. show a rich card instead of the
 * generic app icon.
 *
 * Routes (set in vercel.json):
 *   /share?event=<uuid>
 *   /share?review=<uuid>
 *   /share?artist=<uuid>
 *   /share?venue=<uuid>
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseServerConfig } from './lib/serverEnv';

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Security: Reject malformed UUID query params before hitting the database. */
function isValidShareUuid(value: string | undefined): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

/**
 * Inlined from @synth/shared — Vercel serverless cannot bundle the workspace
 * package barrel (pulls friendNotifications, passport, etc. and crashes).
 */
function buildWebAppUrlFromShareCanonical(siteUrl: string, canonicalShareUrl: string): string | null {
  try {
    const params = new URL(canonicalShareUrl).searchParams;
    const ref = params.get('ref');
    const refSuffix = ref ? `&ref=${encodeURIComponent(ref)}` : '';
    const base = siteUrl.replace(/\/+$/, '');

    const event = params.get('event');
    if (event) return `${base}/?event=${encodeURIComponent(event)}${refSuffix}`;

    const review = params.get('review');
    if (review) return `${base}/?review=${encodeURIComponent(review)}${refSuffix}`;

    const artist = params.get('artist');
    if (artist) return `${base}/?artist=${encodeURIComponent(artist)}${refSuffix}`;

    const venue = params.get('venue');
    if (venue) return `${base}/?venue=${encodeURIComponent(venue)}${refSuffix}`;
  } catch {
    // malformed URL
  }
  return null;
}

function spaRedirectForQuery(
  siteUrl: string,
  kind: 'event' | 'review' | 'artist' | 'venue',
  id: string,
  referrerId?: string
): string {
  const base = siteUrl.replace(/\/+$/, '');
  const refSuffix = referrerId ? `&ref=${encodeURIComponent(referrerId)}` : '';
  return `${base}/?${kind}=${encodeURIComponent(id)}${refSuffix}`;
}

/** Vercel rewrites can leave `req.query` empty; always fall back to the request URL. */
function readShareQuery(req: VercelRequest): {
  event?: string;
  review?: string;
  artist?: string;
  venue?: string;
  referrerId?: string;
} {
  const pick = (key: string): string | undefined => {
    const raw = req.query[key];
    if (typeof raw === 'string' && raw.trim()) return raw.trim();
    if (Array.isArray(raw) && typeof raw[0] === 'string' && raw[0].trim()) return raw[0].trim();
    return undefined;
  };

  const fromSearchParams = (params: URLSearchParams) => ({
    event: params.get('event')?.trim() || undefined,
    review: params.get('review')?.trim() || undefined,
    artist: params.get('artist')?.trim() || undefined,
    venue: params.get('venue')?.trim() || undefined,
    referrerId: params.get('ref')?.trim() || undefined,
  });

  const direct = {
    event: pick('event'),
    review: pick('review'),
    artist: pick('artist'),
    venue: pick('venue'),
    referrerId: pick('ref'),
  };
  if (direct.event || direct.review || direct.artist || direct.venue) {
    return direct;
  }

  const urlCandidates: string[] = [];
  if (typeof req.url === 'string' && req.url) urlCandidates.push(req.url);

  const forwarded = req.headers['x-vercel-forwarded-url'];
  if (typeof forwarded === 'string') urlCandidates.push(forwarded);
  const original = req.headers['x-vercel-original-url'];
  if (typeof original === 'string') urlCandidates.push(original);

  for (const raw of urlCandidates) {
    try {
      const pathAndQuery = raw.startsWith('http')
        ? raw
        : `https://placeholder.local${raw.startsWith('/') ? raw : `/${raw}`}`;
      const parsed = fromSearchParams(new URL(pathAndQuery).searchParams);
      if (parsed.event || parsed.review || parsed.artist || parsed.venue) {
        return parsed;
      }
    } catch {
      // try next candidate
    }
  }

  return direct;
}

/** Crawlers need HTML+OG tags; real users should go straight to the in-app deep link. */
function isSocialPreviewCrawler(userAgent: string | undefined): boolean {
  if (!userAgent) return false;
  return /bot|crawl|spider|facebookexternalhit|twitterbot|slackbot|whatsapp|telegram|linkedinbot|discordbot|preview|googlebot|bingpreview|embed/i.test(
    userAgent
  );
}

// Local shape types — keeps the fetchers free of `any` casts
interface ArtistRef { name: string }
interface VenueRef  { name: string; city: string; state: string }

interface EventRow {
  id: string; title: string | null; event_date: string | null;
  image_url: string | null; poster_image_url: string | null;
  images: Record<string, string> | null; genres: string[] | null;
  artists: ArtistRef | ArtistRef[] | null;
  venues:  VenueRef  | VenueRef[]  | null;
}
interface ReviewRow {
  id: string; overall_rating: number | null; created_at: string | null;
  events:   (Omit<EventRow, 'genres'>) | null;
  profiles: { display_name: string | null; username: string | null } | null;
}
interface ArtistRow { id: string; name: string; image_url: string | null; genres: string[] | null }
interface VenueRow  { id: string; name: string; city: string | null; state: string | null; image_url: string | null }

const APP_STORE_URL =
  'https://apps.apple.com/us/app/synth-for-live-music-lovers/id6757408095';
function getBaseUrl(): string {
  const raw =
    process.env.SITE_URL?.trim() ||
    process.env.VITE_SITE_URL?.trim() ||
    process.env.VITE_PUBLIC_SITE_URL?.trim() ||
    '';
  return (raw || 'https://join.getsynth.app').replace(/\/+$/, '');
}

const BASE_URL = getBaseUrl();
const FALLBACK_IMAGE = `${BASE_URL}/og-default.png`;

// ─── Helpers ────────────────────────────────────────────────────────────────

function esc(str: string | null | undefined): string {
  return (str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return '';
  }
}

function pickImage(row: Record<string, any>): string {
  return (
    row.poster_image_url ||
    row.image_url ||
    row.images?.portrait_url ||
    row.images?.square_url ||
    ''
  );
}

function starRating(score: number): string {
  const full = Math.round(Math.max(0, Math.min(5, score)));
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}

// ─── Page renderer ──────────────────────────────────────────────────────────

function renderPage(opts: {
  ogTitle: string;
  ogDescription: string;
  ogImage: string;
  canonicalUrl: string;
  badge: string;
  headline: string;
  sublines: string[];
  heroImage: string;
  rating?: number;
  referrerId?: string;  // passed through to App Store URL for attribution
}): string {
  const { ogTitle, ogDescription, ogImage, canonicalUrl, badge, headline, sublines, heroImage, rating, referrerId } = opts;
  const spaUrl =
    buildWebAppUrlFromShareCanonical(BASE_URL, canonicalUrl) ?? `${BASE_URL}/`;
  // If a referrer is present, append ?referral= to the App Store link so the
  // app can read it on first launch for attribution (best-effort; App Store
  // does not guarantee delivery of custom params but some analytics tools pick it up).
  const appStoreLink = referrerId
    ? `${APP_STORE_URL}?referral=${encodeURIComponent(referrerId)}`
    : APP_STORE_URL;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/>
  <title>${esc(ogTitle)}</title>

  <!-- Open Graph --------------------------------------------------------- -->
  <meta property="og:type"        content="website"/>
  <meta property="og:site_name"   content="Synth"/>
  <meta property="og:title"       content="${esc(ogTitle)}"/>
  <meta property="og:description" content="${esc(ogDescription)}"/>
  <meta property="og:url"         content="${esc(canonicalUrl)}"/>
  <meta property="og:image"       content="${esc(ogImage || FALLBACK_IMAGE)}"/>
  <meta property="og:image:width"  content="1200"/>
  <meta property="og:image:height" content="630"/>

  <!-- Twitter / X -------------------------------------------------------- -->
  <meta name="twitter:card"        content="summary_large_image"/>
  <meta name="twitter:title"       content="${esc(ogTitle)}"/>
  <meta name="twitter:description" content="${esc(ogDescription)}"/>
  <meta name="twitter:image"       content="${esc(ogImage || FALLBACK_IMAGE)}"/>

  <!-- iOS Smart App Banner (shows "Open in Synth" in Safari) ------------- -->
  <meta name="apple-itunes-app" content="app-id=6757408095, app-argument=${esc(canonicalUrl)}"/>

  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    html,body{height:100%;background:#0a0a0a;color:#fff;
      font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;
      -webkit-font-smoothing:antialiased}

    .page{min-height:100vh;display:flex;flex-direction:column;max-width:430px;margin:0 auto}

    /* Hero image --------------------------------------------------------- */
    .hero{position:relative;width:100%;aspect-ratio:4/5;overflow:hidden;background:#111;flex-shrink:0}
    .hero img{width:100%;height:100%;object-fit:cover;display:block}
    .hero-gradient{position:absolute;inset:0;
      background:linear-gradient(to bottom,rgba(0,0,0,.05) 0%,rgba(10,10,10,0) 35%,rgba(10,10,10,1) 100%)}
    .hero-empty{width:100%;height:100%;
      background:linear-gradient(135deg,#1a0a14 0%,#120008 100%);
      display:flex;align-items:center;justify-content:center}
    .hero-empty svg{width:72px;height:72px;opacity:.15}

    /* Content ------------------------------------------------------------ */
    .content{flex:1;padding:20px 24px 48px}

    .synth-brand{display:flex;align-items:center;gap:10px;margin-bottom:22px}
    .synth-mark{width:36px;height:36px;background:#e91e8c;border-radius:10px;
      display:flex;align-items:center;justify-content:center;flex-shrink:0}
    .synth-name{font-size:18px;font-weight:700;letter-spacing:-.2px}
    .synth-sub{font-size:12px;color:rgba(255,255,255,.4);margin-top:1px}

    .badge{display:inline-block;font-size:10px;font-weight:700;letter-spacing:1.8px;
      color:#e91e8c;text-transform:uppercase;margin-bottom:10px}

    .headline{font-size:26px;font-weight:700;line-height:1.2;letter-spacing:-.3px;
      color:#fff;margin-bottom:10px}

    .rating{font-size:20px;color:#e91e8c;letter-spacing:3px;margin-bottom:10px}

    .subline{font-size:15px;color:rgba(255,255,255,.55);line-height:1.5;margin-bottom:3px}

    .divider{height:1px;background:rgba(255,255,255,.07);margin:22px 0}

    /* CTAs --------------------------------------------------------------- */
    .cta{display:flex;flex-direction:column;gap:12px}

    .btn-primary{display:flex;align-items:center;justify-content:center;gap:10px;
      background:#e91e8c;color:#fff;border:none;border-radius:16px;
      padding:17px 24px;font-size:16px;font-weight:600;text-decoration:none;
      -webkit-tap-highlight-color:transparent;cursor:pointer}
    .btn-primary:active{opacity:.88}

    .btn-ghost{display:flex;align-items:center;justify-content:center;
      background:rgba(255,255,255,.07);color:rgba(255,255,255,.55);
      border:none;border-radius:16px;padding:14px 24px;
      font-size:14px;font-weight:500;text-decoration:none;
      -webkit-tap-highlight-color:transparent}

    .foot{text-align:center;font-size:11px;color:rgba(255,255,255,.2);margin-top:28px}
  </style>
</head>
<body>
<div class="page">

  <!-- Hero --------------------------------------------------------------- -->
  <div class="hero">
    ${heroImage
      ? `<img src="${esc(heroImage)}" alt="${esc(headline)}" loading="eager"/>
         <div class="hero-gradient"></div>`
      : `<div class="hero-empty">
           <svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="1.2">
             <path stroke-linecap="round" stroke-linejoin="round"
               d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803
                  1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0
                  0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632
                  2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25
                  2.25 0 009 15.553z"/>
           </svg>
         </div>`
    }
  </div>

  <!-- Content ------------------------------------------------------------ -->
  <div class="content">
    <div class="synth-brand">
      <div class="synth-mark">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M9 9l10.5-3m0 6.553v3.75a2.25 2.25 0 01-1.632 2.163l-1.32.377a1.803
            1.803 0 11-.99-3.467l2.31-.66a2.25 2.25 0 001.632-2.163zm0
            0V2.25L9 5.25v10.303m0 0v3.75a2.25 2.25 0 01-1.632
            2.163l-1.32.377a1.803 1.803 0 01-.99-3.467l2.31-.66A2.25
            2.25 0 009 15.553z"/>
        </svg>
      </div>
      <div>
        <div class="synth-name">Synth</div>
        <div class="synth-sub">For live music lovers</div>
      </div>
    </div>

    <div class="badge">${esc(badge)}</div>
    <div class="headline">${esc(headline)}</div>
    ${rating ? `<div class="rating">${starRating(rating)}</div>` : ''}
    ${sublines.map(s => `<div class="subline">${esc(s)}</div>`).join('')}

    <div class="divider"></div>

    <div class="cta">
      <a href="${esc(spaUrl)}" class="btn-primary">Open in Synth</a>
      <a href="${appStoreLink}" class="btn-ghost">Get the app on the App Store</a>
    </div>

    <div class="foot">Synth · Discover live music with friends</div>
  </div>
</div>
</body>
</html>`;
}

// ─── Data fetchers ───────────────────────────────────────────────────────────

type SB = SupabaseClient<any, any, any>;

async function fetchEvent(supabase: SB, id: string): Promise<EventRow | null> {
  const { data } = await supabase
    .from('events')
    .select(`
      id, title, event_date, image_url, poster_image_url, images, genres,
      artists ( name ),
      venues ( name, city, state )
    `)
    .eq('id', id)
    .maybeSingle();
  return data as EventRow | null;
}

async function fetchReview(supabase: SB, id: string): Promise<ReviewRow | null> {
  const { data } = await supabase
    .from('reviews')
    .select(`
      id, overall_rating, created_at,
      events ( title, event_date, image_url, poster_image_url, images,
        artists ( name ),
        venues ( name, city, state )
      ),
      profiles ( display_name, username )
    `)
    .eq('id', id)
    .maybeSingle();
  return data as ReviewRow | null;
}

async function fetchArtist(supabase: SB, id: string): Promise<ArtistRow | null> {
  const { data } = await supabase
    .from('artists')
    .select('id, name, image_url, genres')
    .eq('id', id)
    .maybeSingle();
  return data as ArtistRow | null;
}

async function fetchVenue(supabase: SB, id: string): Promise<VenueRow | null> {
  const { data } = await supabase
    .from('venues')
    .select('id, name, city, state, image_url')
    .eq('id', id)
    .maybeSingle();
  return data as VenueRow | null;
}

// ─── Handler ────────────────────────────────────────────────────────────────

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const supabaseConfig = getSupabaseServerConfig();
  if (!supabaseConfig) {
    return res.status(500).send('Server configuration error');
  }

  const { event, review, artist, venue, referrerId } = readShareQuery(req);

  // Security: Validate entity IDs are UUIDs to reduce junk DB queries and open redirects.
  if (event && !isValidShareUuid(event)) {
    return res.status(400).send('Invalid event id');
  }
  if (review && !isValidShareUuid(review)) {
    return res.status(400).send('Invalid review id');
  }
  if (artist && !isValidShareUuid(artist)) {
    return res.status(400).send('Invalid artist id');
  }
  if (venue && !isValidShareUuid(venue)) {
    return res.status(400).send('Invalid venue id');
  }
  if (referrerId && !isValidShareUuid(referrerId)) {
    return res.status(400).send('Invalid referrer id');
  }

  const userAgent = req.headers['user-agent'] as string | undefined;

  // Real users opening a share link: skip OG landing page, go directly to event/review in the app.
  if (!isSocialPreviewCrawler(userAgent)) {
    if (event) {
      return res.redirect(302, spaRedirectForQuery(BASE_URL, 'event', event, referrerId));
    }
    if (review) {
      return res.redirect(302, spaRedirectForQuery(BASE_URL, 'review', review, referrerId));
    }
    if (artist) {
      return res.redirect(302, spaRedirectForQuery(BASE_URL, 'artist', artist, referrerId));
    }
    if (venue) {
      return res.redirect(302, spaRedirectForQuery(BASE_URL, 'venue', venue, referrerId));
    }
  }

  const supabase = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey);

  // Cache 5 min, stale up to 1 hour — safe since content rarely changes
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  try {
    // ── Event ──────────────────────────────────────────────────────────────
    if (event) {
      const data = await fetchEvent(supabase, event);
      if (!data) {
        return res.redirect(302, spaRedirectForQuery(BASE_URL, 'event', event, referrerId));
      }

      const artistRef  = Array.isArray(data.artists) ? data.artists[0] : data.artists;
      const venueRef   = Array.isArray(data.venues)  ? data.venues[0]  : data.venues;
      const artistName = artistRef?.name ?? '';
      const venueName  = venueRef?.name  ?? '';
      const venueCity  = venueRef?.city  ?? '';
      const venueState = venueRef?.state ?? '';
      const date       = formatDate(data.event_date);
      const image      = pickImage(data as Record<string, any>);

      const location = [venueName, venueCity, venueState].filter(Boolean).join(', ');
      const ogTitle  = artistName ? `${artistName} at ${venueName}` : (data.title ?? 'Event on Synth');
      const ogDesc   = [data.title, date ? `📅 ${date}` : '', location ? `📍 ${location}` : '']
        .filter(Boolean).join(' · ');

      return res.send(renderPage({
        ogTitle,
        ogDescription: ogDesc,
        ogImage: image,
        canonicalUrl: `${BASE_URL}/share?event=${event}`,
        badge: 'Live Event',
        headline: artistName || data.title || 'Event',
        sublines: [
          data.title && artistName ? data.title : '',
          location ? `📍 ${location}` : '',
          date     ? `📅 ${date}`     : '',
        ].filter(Boolean),
        heroImage: image,
        referrerId,
      }));
    }

    // ── Review ─────────────────────────────────────────────────────────────
    if (review) {
      const data = await fetchReview(supabase, review);
      if (!data) {
        return res.redirect(302, spaRedirectForQuery(BASE_URL, 'review', review, referrerId));
      }

      const ev          = data.events ?? {} as NonNullable<ReviewRow['events']>;
      const profile     = data.profiles;
      const evArtistRef = ev.artists ? (Array.isArray(ev.artists) ? ev.artists[0] : ev.artists) : null;
      const evVenueRef  = ev.venues  ? (Array.isArray(ev.venues)  ? ev.venues[0]  : ev.venues)  : null;
      const artistName  = evArtistRef?.name ?? '';
      const venueName   = evVenueRef?.name  ?? '';
      const date        = formatDate(ev.event_date);
      const image       = pickImage(ev as Record<string, any>);
      const reviewer    = profile?.display_name || (profile?.username ? `@${profile.username}` : 'Someone');
      const rating      = typeof data.overall_rating === 'number' ? data.overall_rating : undefined;

      const ogTitle = rating
        ? `${reviewer} rated ${artistName || ev.title} ${starRating(rating)}`
        : `${reviewer}'s review of ${artistName || ev.title}`;
      const ogDesc  = [venueName, date].filter(Boolean).join(' · ');

      return res.send(renderPage({
        ogTitle,
        ogDescription: ogDesc,
        ogImage: image,
        canonicalUrl: `${BASE_URL}/share?review=${review}`,
        badge: 'Review',
        headline: artistName || ev.title || 'Concert Review',
        sublines: [
          `by ${reviewer}`,
          venueName ? `📍 ${venueName}` : '',
          date      ? `📅 ${date}`      : '',
        ].filter(Boolean),
        heroImage: image,
        rating,
        referrerId,
      }));
    }

    // ── Artist ─────────────────────────────────────────────────────────────
    if (artist) {
      const data = await fetchArtist(supabase, artist);
      if (!data) {
        return res.redirect(302, spaRedirectForQuery(BASE_URL, 'artist', artist, referrerId));
      }

      const genres  = Array.isArray(data.genres) ? (data.genres as string[]).slice(0, 3).join(', ') : '';
      const ogTitle = `${data.name} on Synth`;
      const ogDesc  = genres ? `${genres} · Discover upcoming shows` : 'Discover upcoming shows on Synth';

      return res.send(renderPage({
        ogTitle,
        ogDescription: ogDesc,
        ogImage: data.image_url ?? '',
        canonicalUrl: `${BASE_URL}/share?artist=${artist}`,
        badge: 'Artist',
        headline: data.name,
        sublines: [genres || 'Live music'].filter(Boolean),
        heroImage: data.image_url ?? '',
        referrerId,
      }));
    }

    // ── Venue ──────────────────────────────────────────────────────────────
    if (venue) {
      const data = await fetchVenue(supabase, venue);
      if (!data) {
        return res.redirect(302, spaRedirectForQuery(BASE_URL, 'venue', venue, referrerId));
      }

      const location = [data.city, data.state].filter(Boolean).join(', ');
      const ogTitle  = `${data.name} on Synth`;
      const ogDesc   = location
        ? `${location} · See upcoming events at ${data.name}`
        : `See upcoming events at ${data.name}`;

      return res.send(renderPage({
        ogTitle,
        ogDescription: ogDesc,
        ogImage: data.image_url ?? '',
        canonicalUrl: `${BASE_URL}/share?venue=${venue}`,
        badge: 'Venue',
        headline: data.name,
        sublines: [location ? `📍 ${location}` : ''].filter(Boolean),
        heroImage: data.image_url ?? '',
        referrerId,
      }));
    }

    // No recognised param — send to app
    return res.redirect(302, BASE_URL);

  } catch (err) {
    console.error('[share] Error:', err);
    if (event) return res.redirect(302, spaRedirectForQuery(BASE_URL, 'event', event, referrerId));
    if (review) return res.redirect(302, spaRedirectForQuery(BASE_URL, 'review', review, referrerId));
    if (artist) return res.redirect(302, spaRedirectForQuery(BASE_URL, 'artist', artist, referrerId));
    if (venue) return res.redirect(302, spaRedirectForQuery(BASE_URL, 'venue', venue, referrerId));
    return res.redirect(302, BASE_URL);
  }
}
