/**
 * Shared weekly featured curation SoT (LOI-566).
 * Home and Discover both read via fetchWeeklyFeaturedSet.
 * Editorial writes via replaceWeeklyFeaturedPins / publishWeeklyFeaturedSet
 * (or the admin HTTP API) without an app release.
 */
import { supabase } from '@/integrations/supabase/client';
import {
  FEATURED_METRO_DC,
  FEATURED_TARGET,
  dcWeekId,
  dcWeekStartDate,
  featuredShowChatKey,
  validateFeaturedPins,
  type FeaturedPinInput,
  type FeaturedSetStatus,
} from '@synth/shared';

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

type RpcRow = {
  set_id: string;
  week_id: string;
  week_start_date: string;
  metro: string;
  status: FeaturedSetStatus;
  target_count: number;
  published_at: string | null;
  updated_at: string | null;
  item_id: string;
  event_id: string;
  position: number;
  genre: string | null;
  curator_note: string | null;
  chat_provision_key: string;
  event_title: string | null;
  artist_name: string | null;
  venue_name: string | null;
  venue_city: string | null;
  event_date: string | null;
  image_url: string | null;
  event_genres: string[] | null;
};

function rowsToSet(rows: RpcRow[]): WeeklyFeaturedSet | null {
  if (!rows.length) return null;
  const head = rows[0];
  return {
    setId: head.set_id,
    weekId: head.week_id,
    weekStartDate: head.week_start_date,
    metro: head.metro,
    status: head.status,
    targetCount: head.target_count,
    publishedAt: head.published_at,
    updatedAt: head.updated_at,
    shows: rows.map((r) => ({
      eventId: r.event_id,
      position: r.position,
      genre: r.genre,
      curatorNote: r.curator_note,
      chatProvisionKey: r.chat_provision_key || featuredShowChatKey(r.week_id, r.event_id),
      title: r.event_title,
      artistName: r.artist_name,
      venueName: r.venue_name,
      venueCity: r.venue_city,
      eventDate: r.event_date,
      imageUrl: r.image_url,
      eventGenres: r.event_genres,
    })),
  };
}

/** Public read: current (or specified) published weekly featured set for Home + Discover. */
export async function fetchWeeklyFeaturedSet(opts?: {
  weekId?: string | null;
  metro?: string;
}): Promise<WeeklyFeaturedSet | null> {
  const metro = opts?.metro ?? FEATURED_METRO_DC;
  const weekId = opts?.weekId ?? null;

  const { data, error } = await supabase.rpc('get_weekly_featured_set', {
    p_metro: metro,
    p_week_id: weekId,
  });

  if (error) {
    console.error('[weeklyFeaturedService] get_weekly_featured_set', error);
    throw error;
  }

  return rowsToSet((data || []) as RpcRow[]);
}

/** Admin/editorial: upsert draft set + replace ordered pins (no app release). */
export async function replaceWeeklyFeaturedPins(input: {
  weekId?: string;
  weekStartDate?: string;
  pins: FeaturedPinInput[];
  notes?: string | null;
  targetCount?: number;
  status?: 'draft' | 'published';
}): Promise<WeeklyFeaturedSet> {
  const forPublish = input.status === 'published';
  const validation = validateFeaturedPins(input.pins, { forPublish });
  if (!validation.ok) {
    throw new Error(validation.error);
  }

  const weekStart = input.weekStartDate || dcWeekStartDate();
  const weekId = input.weekId || dcWeekId();
  const targetCount = input.targetCount ?? FEATURED_TARGET;
  const status = input.status ?? 'draft';

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: setRow, error: upsertErr } = await supabase
    .from('weekly_featured_sets')
    .upsert(
      {
        metro: FEATURED_METRO_DC,
        week_id: weekId,
        week_start_date: weekStart,
        status: 'draft',
        target_count: targetCount,
        notes: input.notes ?? null,
        updated_by: user?.id ?? null,
      },
      { onConflict: 'metro,week_id' }
    )
    .select('id, week_id, week_start_date, metro, status, target_count, published_at, updated_at')
    .single();

  if (upsertErr || !setRow) {
    console.error('[weeklyFeaturedService] upsert set', upsertErr);
    throw upsertErr || new Error('Failed to upsert weekly featured set');
  }

  const { error: delErr } = await supabase
    .from('weekly_featured_items')
    .delete()
    .eq('set_id', setRow.id);
  if (delErr) {
    console.error('[weeklyFeaturedService] clear items', delErr);
    throw delErr;
  }

  if (input.pins.length > 0) {
    const rows = input.pins.map((pin, index) => ({
      set_id: setRow.id,
      event_id: pin.eventId,
      position: pin.position ?? index + 1,
      genre: pin.genre ?? null,
      curator_note: pin.curatorNote ?? null,
    }));
    const { error: insErr } = await supabase.from('weekly_featured_items').insert(rows);
    if (insErr) {
      console.error('[weeklyFeaturedService] insert items', insErr);
      throw insErr;
    }
  }

  if (status === 'published') {
    const { error: pubErr } = await supabase
      .from('weekly_featured_sets')
      .update({ status: 'published', published_at: new Date().toISOString() })
      .eq('id', setRow.id);
    if (pubErr) {
      console.error('[weeklyFeaturedService] publish', pubErr);
      throw pubErr;
    }
  }

  const published = await fetchWeeklyFeaturedSet({ weekId });
  if (published) return published;

  // Draft may not appear in public RPC; return a constructed shape from pins.
  return {
    setId: setRow.id,
    weekId,
    weekStartDate: weekStart,
    metro: FEATURED_METRO_DC,
    status,
    targetCount,
    publishedAt: null,
    updatedAt: setRow.updated_at,
    shows: input.pins.map((pin, index) => ({
      eventId: pin.eventId,
      position: pin.position ?? index + 1,
      genre: pin.genre ?? null,
      curatorNote: pin.curatorNote ?? null,
      chatProvisionKey: featuredShowChatKey(weekId, pin.eventId),
      title: null,
      artistName: null,
      venueName: null,
      venueCity: null,
      eventDate: null,
      imageUrl: null,
      eventGenres: null,
    })),
  };
}

export async function publishWeeklyFeaturedSet(weekId: string): Promise<void> {
  const { data: setRow, error } = await supabase
    .from('weekly_featured_sets')
    .select('id')
    .eq('metro', FEATURED_METRO_DC)
    .eq('week_id', weekId)
    .maybeSingle();

  if (error || !setRow) {
    throw error || new Error(`No featured set for week ${weekId}`);
  }

  const { data: items, error: itemsErr } = await supabase
    .from('weekly_featured_items')
    .select('event_id, genre')
    .eq('set_id', setRow.id);

  if (itemsErr) throw itemsErr;

  const validation = validateFeaturedPins(
    (items || []).map((i) => ({ eventId: i.event_id, genre: i.genre })),
    { forPublish: true }
  );
  if (!validation.ok) throw new Error(validation.error);

  const { error: pubErr } = await supabase
    .from('weekly_featured_sets')
    .update({ status: 'published', published_at: new Date().toISOString() })
    .eq('id', setRow.id);

  if (pubErr) throw pubErr;
}
