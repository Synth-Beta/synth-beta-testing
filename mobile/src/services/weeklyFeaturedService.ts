/**
 * Expo weekly featured SoT reader (LOI-646).
 * Same public contract as web: GET /api/featured/week?weekId=2026-W35
 * Falls back to Supabase RPC when HTTP is unavailable.
 */
import {
  DEMO_FEATURED_WEEK_ID,
  FEATURED_METRO_DC,
  featuredShowChatKey,
  type FeaturedSetStatus,
} from '@synth/shared';
import { supabase } from '../integrations/supabase/client';
import { getExpoSiteUrl } from '../utils/siteUrl';

export type WeeklyFeaturedShow = {
  eventId: string;
  position: number;
  genre: string | null;
  curatorNote: string | null;
  chatProvisionKey: string;
  title: string | null;
  artistName: string | null;
  venueName: string | null;
  venueCity: string | null;
  eventDate: string | null;
  imageUrl: string | null;
  eventGenres: string[] | null;
};

export type WeeklyFeaturedSet = {
  setId: string;
  weekId: string;
  weekStartDate: string;
  metro: string;
  status: FeaturedSetStatus;
  targetCount: number;
  publishedAt: string | null;
  updatedAt: string | null;
  shows: WeeklyFeaturedShow[];
};

function sortShowsByPosition(shows: WeeklyFeaturedShow[]): WeeklyFeaturedShow[] {
  return [...shows].sort((a, b) => a.position - b.position);
}

function acceptForWeek(
  set: WeeklyFeaturedSet | null,
  requestedWeekId: string | null | undefined
): WeeklyFeaturedSet | null {
  if (!set) return null;
  if (requestedWeekId && set.weekId !== requestedWeekId) return null;
  if (set.status && set.status !== 'published') return null;
  return { ...set, shows: sortShowsByPosition(set.shows ?? []) };
}

async function fetchViaHttp(opts: {
  weekId?: string | null;
  metro: string;
}): Promise<WeeklyFeaturedSet | null> {
  const params = new URLSearchParams({ metro: opts.metro });
  if (opts.weekId) params.set('weekId', opts.weekId);
  const url = `${getExpoSiteUrl()}/api/featured/week?${params.toString()}`;
  const res = await fetch(url, { method: 'GET', headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`GET /api/featured/week failed (${res.status})`);
  const body = await res.json();
  if (body.empty || !body.set || !body.shows?.length) return null;
  const weekId = body.weekId || opts.weekId || '';
  return {
    setId: body.set.setId,
    weekId,
    weekStartDate: body.set.weekStartDate,
    metro: body.metro || opts.metro,
    status: body.set.status,
    targetCount: body.set.targetCount,
    publishedAt: body.set.publishedAt,
    updatedAt: body.set.updatedAt,
    shows: sortShowsByPosition(
      body.shows.map((s: WeeklyFeaturedShow) => ({
        ...s,
        chatProvisionKey: s.chatProvisionKey || featuredShowChatKey(weekId, s.eventId),
      }))
    ),
  };
}

async function fetchViaRpc(opts: {
  weekId?: string | null;
  metro: string;
}): Promise<WeeklyFeaturedSet | null> {
  const { data, error } = await supabase.rpc('get_weekly_featured_set', {
    p_metro: opts.metro,
    p_week_id: opts.weekId ?? null,
  });
  if (error) throw error;
  const rows = (data || []) as Array<Record<string, unknown>>;
  if (!rows.length) return null;
  const head = rows[0];
  return {
    setId: String(head.set_id),
    weekId: String(head.week_id),
    weekStartDate: String(head.week_start_date),
    metro: String(head.metro),
    status: head.status as FeaturedSetStatus,
    targetCount: Number(head.target_count),
    publishedAt: (head.published_at as string | null) ?? null,
    updatedAt: (head.updated_at as string | null) ?? null,
    shows: sortShowsByPosition(
      rows.map((r) => ({
        eventId: String(r.event_id),
        position: Number(r.position),
        genre: (r.genre as string | null) ?? null,
        curatorNote: (r.curator_note as string | null) ?? null,
        chatProvisionKey:
          (r.chat_provision_key as string) ||
          featuredShowChatKey(String(r.week_id), String(r.event_id)),
        title: (r.event_title as string | null) ?? null,
        artistName: (r.artist_name as string | null) ?? null,
        venueName: (r.venue_name as string | null) ?? null,
        venueCity: (r.venue_city as string | null) ?? null,
        eventDate: (r.event_date as string | null) ?? null,
        imageUrl: (r.image_url as string | null) ?? null,
        eventGenres: (r.event_genres as string[] | null) ?? null,
      }))
    ),
  };
}

export async function fetchWeeklyFeaturedSet(opts?: {
  weekId?: string | null;
  metro?: string;
}): Promise<WeeklyFeaturedSet | null> {
  const metro = opts?.metro ?? FEATURED_METRO_DC;
  const weekId = opts?.weekId ?? null;
  try {
    return acceptForWeek(await fetchViaHttp({ weekId, metro }), weekId);
  } catch (err) {
    console.warn('[mobile weeklyFeatured] HTTP failed; trying RPC', err);
  }
  return acceptForWeek(await fetchViaRpc({ weekId, metro }), weekId);
}

export function fetchDemoWeeklyFeaturedSet(): Promise<WeeklyFeaturedSet | null> {
  return fetchWeeklyFeaturedSet({ weekId: DEMO_FEATURED_WEEK_ID });
}
