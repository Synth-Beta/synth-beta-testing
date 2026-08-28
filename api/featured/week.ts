/**
 * GET /api/featured/week
 * Stable public read contract for Home, Discover, and featured-show chat provisioning.
 *
 * Query:
 *   weekId?  - optional DC week id (YYYY-Www). Defaults to current DC week.
 *   metro?   - defaults to "dc"
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  FEATURED_METRO_DC,
  FEATURED_MAX,
  FEATURED_MIN,
  FEATURED_TARGET,
  dcWeekId,
  featuredShowChatKey,
} from '../_lib/weeklyFeatured';

type RpcRow = {
  set_id: string;
  week_id: string;
  week_start_date: string;
  metro: string;
  status: string;
  target_count: number;
  published_at: string | null;
  updated_at: string | null;
  event_id: string;
  position: number;
  genre: string | null;
  curator_note: string | null;
  chat_provision_key: string | null;
  event_title: string | null;
  artist_name: string | null;
  venue_name: string | null;
  venue_city: string | null;
  event_date: string | null;
  image_url: string | null;
  event_genres: string[] | null;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const metro =
    typeof req.query.metro === 'string' && req.query.metro.trim()
      ? req.query.metro.trim()
      : FEATURED_METRO_DC;
  const weekId =
    typeof req.query.weekId === 'string' && req.query.weekId.trim()
      ? req.query.weekId.trim()
      : null;

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase.rpc('get_weekly_featured_set', {
    p_metro: metro,
    p_week_id: weekId,
  });

  if (error) {
    console.error('[featured/week]', error);
    return res.status(500).json({ error: 'Failed to load featured set', detail: error.message });
  }

  const rows = (data || []) as RpcRow[];
  const resolvedWeekId = weekId || (rows[0]?.week_id ?? dcWeekId());

  if (!rows.length) {
    return res.status(200).json({
      contractVersion: 1,
      metro,
      weekId: resolvedWeekId,
      empty: true,
      density: { min: FEATURED_MIN, max: FEATURED_MAX, target: FEATURED_TARGET },
      set: null,
      shows: [],
    });
  }

  const head = rows[0];
  const shows = rows.map((r) => ({
    eventId: r.event_id,
    position: r.position,
    genre: r.genre,
    curatorNote: r.curator_note,
    chatProvisionKey:
      r.chat_provision_key || featuredShowChatKey(r.week_id, r.event_id),
    title: r.event_title,
    artistName: r.artist_name,
    venueName: r.venue_name,
    venueCity: r.venue_city,
    eventDate: r.event_date,
    imageUrl: r.image_url,
    eventGenres: r.event_genres,
  }));

  return res.status(200).json({
    contractVersion: 1,
    metro: head.metro,
    weekId: head.week_id,
    empty: false,
    density: { min: FEATURED_MIN, max: FEATURED_MAX, target: FEATURED_TARGET },
    set: {
      setId: head.set_id,
      weekStartDate: head.week_start_date,
      status: head.status,
      targetCount: head.target_count,
      publishedAt: head.published_at,
      updatedAt: head.updated_at,
      showCount: shows.length,
    },
    shows,
  });
}
