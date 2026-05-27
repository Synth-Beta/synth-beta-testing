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
  const spaUrl = canonicalUrl.replace('/share?', '/?');
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
      <a href="${appStoreLink}" class="btn-primary">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79
            -1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45
            4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78
            0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15
            3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13
            3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85
            -1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
        </svg>
        Get Synth — Free on App Store
      </a>
      <a href="${esc(spaUrl)}" class="btn-ghost">Open in browser instead</a>
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
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).send('Server configuration error');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const { event, review, artist, venue, ref: referrerId } = req.query as Record<string, string | undefined>;

  // Cache 5 min, stale up to 1 hour — safe since content rarely changes
  res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=3600');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  try {
    // ── Event ──────────────────────────────────────────────────────────────
    if (event) {
      const data = await fetchEvent(supabase, event);
      if (!data) return res.redirect(302, BASE_URL);

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
      if (!data) return res.redirect(302, BASE_URL);

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
      if (!data) return res.redirect(302, BASE_URL);

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
      if (!data) return res.redirect(302, BASE_URL);

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
    return res.redirect(302, BASE_URL);
  }
}
