/**
 * Artist page ordering: upcoming shows nearest to the viewer first, then by date.
 *
 * - `sortEventsNearestFirst` is the pure ordering rule (mirrors the SQL function
 *   get_artist_upcoming_events_nearby): distance rounded to the nearest mile, then date;
 *   events without coordinates last, by date; no viewer location -> date order.
 * - `fetchArtistUpcomingEvents` loads one page of an artist's upcoming events in that
 *   order. It uses the SQL function when it is deployed and otherwise falls back to
 *   loading upcoming events by date and sorting them on the device.
 */
import type { SynthSupabaseClient } from './supabaseClientType';

export type LatLng = { latitude: number; longitude: number };

type EventLike = {
  event_date?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  venue_latitude?: number | string | null;
  venue_longitude?: number | string | null;
  /** PostgREST embed, e.g. select('*, venues:venue_id(latitude, longitude)'). */
  venues?: { latitude?: number | string | null; longitude?: number | string | null } | null;
};

const EARTH_DIAMETER_MILES = 7917.6;

function num(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

export function isUsableLatLng(p: Partial<LatLng> | null | undefined): p is LatLng {
  const lat = num(p?.latitude);
  const lng = num(p?.longitude);
  // (0, 0) is a placeholder in some imported rows, not a real venue.
  return lat != null && lng != null && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
}

/** Great-circle distance in miles. */
export function distanceMiles(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return EARTH_DIAMETER_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function eventLatLng(e: EventLike): LatLng | null {
  const own = { latitude: num(e.latitude) ?? NaN, longitude: num(e.longitude) ?? NaN };
  if (isUsableLatLng(own)) return own;
  const venue = {
    latitude: num(e.venue_latitude ?? e.venues?.latitude) ?? NaN,
    longitude: num(e.venue_longitude ?? e.venues?.longitude) ?? NaN,
  };
  return isUsableLatLng(venue) ? venue : null;
}

function time(e: EventLike): number {
  const t = e.event_date ? Date.parse(e.event_date) : NaN;
  return Number.isFinite(t) ? t : Number.MAX_SAFE_INTEGER;
}

/** Returns a new array: nearest (to the mile) first, then soonest. Stable for equal keys. */
export function sortEventsNearestFirst<T extends EventLike>(events: readonly T[], origin: LatLng | null | undefined): T[] {
  const hasOrigin = isUsableLatLng(origin);
  const keyed = events.map((e, i) => {
    const p = hasOrigin ? eventLatLng(e) : null;
    const miles = hasOrigin && p ? Math.round(distanceMiles(origin as LatLng, p)) : Number.POSITIVE_INFINITY;
    return { e, i, miles, t: time(e) };
  });
  keyed.sort((a, b) => a.miles - b.miles || a.t - b.t || a.i - b.i);
  return keyed.map((k) => k.e);
}

export type FetchArtistUpcomingOptions = {
  artistIds: string[];
  /** ISO timestamp; events on/after this. Pass local midnight so today's shows count. */
  fromIso: string;
  origin?: LatLng | null;
  limit: number;
  offset?: number;
};

/** Upper bound for the device-side fallback (must load everything to sort by distance). */
const FALLBACK_MAX_ROWS = 1000;

export async function fetchArtistUpcomingEvents<T = any>(
  client: SynthSupabaseClient,
  opts: FetchArtistUpcomingOptions,
): Promise<T[]> {
  const { artistIds, fromIso, origin, limit } = opts;
  const offset = Math.max(0, opts.offset ?? 0);
  if (!artistIds.length) return [];

  const byDate = (from: number, to: number, withVenueCoords = false) =>
    client
      .from('events')
      .select(withVenueCoords ? '*, venues:venue_id(latitude, longitude)' : '*')
      .in('artist_id', artistIds)
      .gte('event_date', fromIso)
      .order('event_date', { ascending: true })
      .range(from, to);

  if (!isUsableLatLng(origin)) {
    const { data, error } = await byDate(offset, offset + limit - 1);
    return error || !data ? [] : (data as T[]);
  }

  const rpc = await client.rpc('get_artist_upcoming_events_nearby', {
    p_artist_ids: artistIds,
    p_lat: origin.latitude,
    p_lng: origin.longitude,
    p_from: fromIso,
    p_limit: limit,
    p_offset: offset,
  });
  if (!rpc.error && Array.isArray(rpc.data)) return rpc.data as T[];

  // Function not deployed yet (or failed): sort on the device. Needs every upcoming row
  // so the nearest show isn't on a later page.
  const { data, error } = await byDate(0, FALLBACK_MAX_ROWS - 1, true);
  if (error || !data) return [];
  return sortEventsNearestFirst(data as EventLike[], origin).slice(offset, offset + limit) as T[];
}
