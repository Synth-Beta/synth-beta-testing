/**
 * Supabase reads for share links, used by the crawler page (api/share.ts) and
 * the poster image (api/og.ts). Imports only supabase-js: the @synth/shared
 * barrel crashes Vercel bundling (see api/share.ts).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

type SB = SupabaseClient<any, any, any>;

export function getShareSupabase(): SB | null {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Security: reject malformed UUID query params before hitting the database. */
export function isValidShareUuid(value: string | undefined | null): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

// events store their image in event_media_url; artists and venues use image_url.
export function pickEventImage(row: Record<string, any>): string {
  return row.event_media_url || row.image_url || row.images?.portrait_url || row.images?.square_url || '';
}

export type ShareEvent = {
  id: string;
  title: string | null;
  date: string | null;
  image: string;
  artist: string;
  venue: string;
  city: string;
  state: string;
};

export type ShareReview = {
  id: string;
  rating: number | null;
  text: string;
  reviewer: string;
  event: ShareEvent | null;
};

const EVENT_FIELDS = `id, title, event_date, event_media_url, images,
  artists ( name ),
  venues ( name, city, state )`;

const one = <T>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null);

function toShareEvent(row: Record<string, any>): ShareEvent {
  const artist = one<{ name?: string }>(row.artists);
  const venue = one<{ name?: string; city?: string; state?: string }>(row.venues);
  return {
    id: row.id,
    title: row.title ?? null,
    date: row.event_date ?? null,
    image: pickEventImage(row),
    artist: artist?.name ?? '',
    venue: venue?.name ?? '',
    city: venue?.city ?? '',
    state: venue?.state ?? '',
  };
}

export async function fetchShareEvent(sb: SB, id: string): Promise<ShareEvent | null> {
  const { data } = await sb.from('events').select(EVENT_FIELDS).eq('id', id).maybeSingle();
  return data ? toShareEvent(data) : null;
}

export async function fetchShareReview(sb: SB, id: string): Promise<ShareReview | null> {
  const { data } = await sb
    .from('reviews')
    .select(`id, rating, review_text, user_id, is_draft, is_public, events ( ${EVENT_FIELDS} )`)
    .eq('id', id)
    .maybeSingle();
  // Service role bypasses RLS: only published, public reviews get a public preview
  // (NULL is_draft / is_public count as published / public, as in the app).
  if (!data || data.is_draft === true || data.is_public === false) return null;
  const { data: user } = data.user_id
    ? await sb.from('users').select('name').eq('user_id', data.user_id).maybeSingle()
    : { data: null };
  const ev = one<Record<string, any>>(data.events);
  const text = typeof data.review_text === 'string' && data.review_text !== 'ATTENDANCE_ONLY' ? data.review_text : '';
  const rating = data.rating == null ? NaN : Number(data.rating);
  return {
    id: data.id,
    rating: Number.isFinite(rating) ? rating : null,
    text,
    reviewer: user?.name || 'Someone',
    event: ev ? toShareEvent(ev) : null,
  };
}

export interface ArtistRow { id: string; name: string; image_url: string | null; genres: string[] | null }
export interface VenueRow { id: string; name: string; city: string | null; state: string | null; image_url: string | null }

export async function fetchArtist(sb: SB, id: string): Promise<ArtistRow | null> {
  const { data } = await sb.from('artists').select('id, name, image_url, genres').eq('id', id).maybeSingle();
  return data as ArtistRow | null;
}

export async function fetchVenue(sb: SB, id: string): Promise<VenueRow | null> {
  const { data } = await sb.from('venues').select('id, name, city, state, image_url').eq('id', id).maybeSingle();
  return data as VenueRow | null;
}

/** /api/og is rewritten to /api/share?og=1; Vercel can leave req.query empty on rewrites. */
export function isOgRequest(query: Record<string, unknown>, url: string | undefined): boolean {
  return Boolean(query.og) || /^\/api\/og(?:[/?]|$)/.test(url ?? '');
}

/** Poster cache: a fallback (blip, bad id) must not stick for a day. */
export function posterCacheControl(isFallback: boolean): string {
  return isFallback ? 'public, s-maxage=300' : 'public, s-maxage=86400, stale-while-revalidate=604800';
}

/**
 * Fetch a poster photo with a hard timeout, as a data URL. '' on timeout,
 * non-OK, or non-image, so the poster renders without a photo instead of
 * hanging the function (share.ts maxDuration is 10s).
 */
export async function loadImageAsDataUrl(
  url: string,
  timeoutMs = 3000,
  fetchImpl: typeof fetch = fetch
): Promise<string> {
  if (!url) return '';
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: ctrl.signal });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('image/')) return '';
    const b64 = Buffer.from(await res.arrayBuffer()).toString('base64');
    return `data:${type.split(';')[0]};base64,${b64}`;
  } catch {
    return '';
  } finally {
    clearTimeout(timer);
  }
}

export function ogImageUrl(base: string, kind: 'event' | 'review', id: string): string {
  return `${base.replace(/\/+$/, '')}/api/og?${kind}=${encodeURIComponent(id)}`;
}
