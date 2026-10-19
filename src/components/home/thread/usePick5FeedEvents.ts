import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LocationService } from '@/services/locationService';
import { PICK5_BANDS, type Pick5Band } from './pick5';

const MAX_SHOWS = 6;
const MAX_PER_BAND = 2;
const LOOKAHEAD_DAYS = 120;

export interface Pick5FeedEvent {
  event_id: string;
  title: string;
  artist_id: string;
  artist_name: string;
  venue_id?: string;
  venue_name?: string;
  venue_city?: string;
  venue_state?: string;
  event_date: string;
  event_media_url?: string;
  images?: unknown;
  band: Pick5Band;
  distance_miles: number | null;
  lat?: number;
  lng?: number;
}

async function fetchPick5Events(): Promise<Pick5FeedEvent[]> {
  const { data: artists, error: artistError } = await supabase
    .from('artists')
    .select('id, name')
    .in('name', PICK5_BANDS.map((b) => b.name));
  if (artistError) throw artistError;

  const bandByArtistId = new Map<string, Pick5Band>();
  for (const a of artists ?? []) {
    const band = PICK5_BANDS.find((b) => b.name.toLowerCase() === String(a.name).toLowerCase());
    if (band) bandByArtistId.set(a.id, band);
  }
  if (bandByArtistId.size === 0) return [];

  const now = new Date();
  const until = new Date(now.getTime() + LOOKAHEAD_DAYS * 86_400_000);
  const { data: events, error } = await supabase
    .from('events')
    .select('id, title, artist_id, venue_id, event_date, venue_city, venue_state, latitude, longitude, event_media_url, images, venues(name)')
    .in('artist_id', [...bandByArtistId.keys()])
    .gte('event_date', now.toISOString())
    .lte('event_date', until.toISOString())
    .order('event_date', { ascending: true })
    .limit(150);
  if (error) throw error;

  return (events ?? []).map((e: any) => {
    const band = bandByArtistId.get(e.artist_id)!;
    return {
      event_id: String(e.id),
      title: e.title || band.name,
      artist_id: e.artist_id,
      artist_name: band.name,
      venue_id: e.venue_id ?? undefined,
      venue_name: e.venues?.name ?? undefined,
      venue_city: e.venue_city ?? undefined,
      venue_state: e.venue_state ?? undefined,
      event_date: e.event_date,
      event_media_url: e.event_media_url ?? undefined,
      images: e.images,
      band,
      distance_miles: null,
      lat: e.latitude != null ? Number(e.latitude) : undefined,
      lng: e.longitude != null ? Number(e.longitude) : undefined,
    };
  });
}

/** Upcoming Pick5-band shows: nearest first, round-robin so every band appears before any repeats. */
export function usePick5FeedEvents(coords: { lat: number; lng: number } | null): Pick5FeedEvent[] {
  const { data: rows = [] } = useQuery({
    queryKey: ['home', 'pick5-feed-events'],
    queryFn: fetchPick5Events,
    staleTime: 30 * 60 * 1000,
  });

  return useMemo(() => {
    const withDistance = rows.map((r) => ({
      ...r,
      distance_miles: coords && r.lat != null && r.lng != null ? LocationService.calculateDistance(coords.lat, coords.lng, r.lat, r.lng) : null,
    }));
    withDistance.sort((a, b) =>
      a.distance_miles != null && b.distance_miles != null
        ? a.distance_miles - b.distance_miles || a.event_date.localeCompare(b.event_date)
        : a.event_date.localeCompare(b.event_date)
    );

    const perBand = new Map<string, Pick5FeedEvent[]>();
    for (const show of withDistance) {
      const list = perBand.get(show.band.slug) ?? [];
      if (list.length < MAX_PER_BAND) list.push(show);
      perBand.set(show.band.slug, list);
    }
    const queues = [...perBand.values()];
    const picked: Pick5FeedEvent[] = [];
    for (let round = 0; round < MAX_PER_BAND; round++) {
      for (const q of queues) if (q[round] && picked.length < MAX_SHOWS) picked.push(q[round]);
    }
    return picked;
  }, [rows, coords?.lat, coords?.lng]);
}
