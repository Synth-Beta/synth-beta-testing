/**
 * Home density helpers for LOI-571 / AC-1 (LOI-574).
 * Featured band clamp, collision ordering, people-going proof, warm-chat T3 hides.
 */
import { FEATURED_MAX, FEATURED_MIN, FEATURED_TARGET } from '@synth/shared';
import { supabase } from '@/integrations/supabase/client';
import { UserEventService } from '@/services/userEventService';
import type { WeeklyFeaturedShow } from '@/services/weeklyFeaturedService';
import { SYNTH_20_HOME } from '@/config/synth20Demo';

export type FeaturedBandClampResult<T> = {
  shows: T[];
  rawCount: number;
  clamped: boolean;
  /** Outside 10–15 band (or empty when a set was expected). */
  outsideBand: boolean;
  reason: string | null;
};

export type PeopleGoingProof = {
  eventId: string;
  count: number;
  faces: Array<{ userId: string; name: string; avatarUrl?: string | null }>;
};

const WARM_HIDE_STORAGE_KEY = 'synth.home.warm.hide.v1';

type WarmHideStore = {
  /** YYYY-MM-DD America/New_York civil date */
  day: string;
  chatIds: string[];
};

function dcCivilDay(at: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Fail closed: clamp display to 10–15. Never invent catalog padding. */
export function clampFeaturedBand<T>(
  shows: T[],
  opts?: { min?: number; max?: number; target?: number }
): FeaturedBandClampResult<T> {
  const min = opts?.min ?? FEATURED_MIN;
  const max = opts?.max ?? FEATURED_MAX;
  const target = opts?.target ?? FEATURED_TARGET;
  const rawCount = shows.length;

  if (rawCount === 0) {
    return {
      shows: [],
      rawCount: 0,
      clamped: false,
      outsideBand: true,
      reason: `featured set empty (target ${target}; band ${min}–${max})`,
    };
  }

  if (rawCount > max) {
    return {
      shows: shows.slice(0, max),
      rawCount,
      clamped: true,
      outsideBand: true,
      reason: `featured set over band (${rawCount} > ${max}); clamped to ${max}`,
    };
  }

  if (rawCount < min) {
    return {
      shows,
      rawCount,
      clamped: false,
      outsideBand: true,
      reason: `featured set under band (${rawCount} < ${min}); showing ${rawCount} without padding`,
    };
  }

  return {
    shows,
    rawCount,
    clamped: false,
    outsideBand: false,
    reason: null,
  };
}

/**
 * Order by collision potential: seeded interest boost, curator position,
 * sooner doors, then stronger people-going proof.
 * Never alphabetical / proximity dump.
 */
export function orderFeaturedByCollisionPotential(
  shows: WeeklyFeaturedShow[],
  opts?: {
    interestBoostIds?: Set<string>;
    goingCounts?: Map<string, number>;
  }
): WeeklyFeaturedShow[] {
  const boost = opts?.interestBoostIds ?? new Set<string>();
  const going = opts?.goingCounts ?? new Map<string, number>();

  return [...shows].sort((a, b) => {
    const aBoost = boost.has(a.eventId) ? 1 : 0;
    const bBoost = boost.has(b.eventId) ? 1 : 0;
    if (aBoost !== bBoost) return bBoost - aBoost;

    const posA = Number.isFinite(a.position) ? a.position : Number.MAX_SAFE_INTEGER;
    const posB = Number.isFinite(b.position) ? b.position : Number.MAX_SAFE_INTEGER;
    if (posA !== posB) return posA - posB;

    const tA = a.eventDate ? Date.parse(a.eventDate) : Number.MAX_SAFE_INTEGER;
    const tB = b.eventDate ? Date.parse(b.eventDate) : Number.MAX_SAFE_INTEGER;
    if (tA !== tB) return tA - tB;

    const gA = going.get(a.eventId) ?? 0;
    const gB = going.get(b.eventId) ?? 0;
    if (gA !== gB) return gB - gA;

    // Stable fallback: eventId (not title alpha dump as primary key).
    return a.eventId.localeCompare(b.eventId);
  });
}

/** Flag PM when featured display is outside the density band. */
export function flagPmFeaturedBand(payload: {
  rawCount: number;
  shownCount: number;
  reason: string;
  weekId?: string | null;
}): void {
  const detail = {
    source: 'loi-571-home-density',
    at: new Date().toISOString(),
    ...payload,
  };
  console.warn('[home-density] featured band outside AC', detail);
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('synth-home-featured-band', { detail }));
    }
  } catch {
    // ignore
  }
}

/**
 * T3: same-day hide of empty-room offenders from Home warm strip.
 * Under-gate chats stay joinable from show detail; this only affects Home.
 */
export function hideHomeWarmChatSameDay(chatId: string): void {
  const id = String(chatId || '').trim();
  if (!id || typeof localStorage === 'undefined') return;
  const day = dcCivilDay();
  const store = readWarmHideStore();
  const next: WarmHideStore =
    store.day === day
      ? { day, chatIds: Array.from(new Set([...store.chatIds, id])) }
      : { day, chatIds: [id] };
  localStorage.setItem(WARM_HIDE_STORAGE_KEY, JSON.stringify(next));
}

export function getHiddenHomeWarmChatIds(now: Date = new Date()): Set<string> {
  const store = readWarmHideStore();
  if (store.day !== dcCivilDay(now)) return new Set();
  return new Set(store.chatIds);
}

function readWarmHideStore(): WarmHideStore {
  if (typeof localStorage === 'undefined') return { day: dcCivilDay(), chatIds: [] };
  try {
    const raw = localStorage.getItem(WARM_HIDE_STORAGE_KEY);
    if (!raw) return { day: dcCivilDay(), chatIds: [] };
    const parsed = JSON.parse(raw) as WarmHideStore;
    if (!parsed || typeof parsed.day !== 'string' || !Array.isArray(parsed.chatIds)) {
      return { day: dcCivilDay(), chatIds: [] };
    }
    return {
      day: parsed.day,
      chatIds: parsed.chatIds.map(String).filter(Boolean),
    };
  } catch {
    return { day: dcCivilDay(), chatIds: [] };
  }
}

/** People-going proof for featured cards / strip (faces when opted in via profile; else counts). */
export async function loadPeopleGoingProof(
  eventIds: string[],
  opts?: { faceLimitPerEvent?: number }
): Promise<Map<string, PeopleGoingProof>> {
  const out = new Map<string, PeopleGoingProof>();
  const ids = [...new Set(eventIds.map(String).filter(Boolean))];
  for (const id of ids) {
    out.set(id, { eventId: id, count: 0, faces: [] });
  }
  if (ids.length === 0) return out;

  const faceLimit = opts?.faceLimitPerEvent ?? 4;
  const counts = await UserEventService.getInterestedCountsByEventId(ids);

  let relationships: Array<{ event_id: string; user_id: string }> = [];
  try {
    const { data, error } = await supabase
      .from('user_event_relationships')
      .select('event_id, user_id')
      .in('event_id', ids)
      .in('relationship_type', ['interested', 'going', 'maybe'])
      .limit(ids.length * Math.max(faceLimit, 6));
    if (!error && data) {
      relationships = data as Array<{ event_id: string; user_id: string }>;
    }
  } catch {
    // counts alone still satisfy AC when faces unavailable
  }

  const userIds = [...new Set(relationships.map((r) => r.user_id))];
  const profileById = new Map<string, { name: string; avatar_url?: string | null }>();
  if (userIds.length > 0) {
    try {
      const { data } = await supabase
        .from('users')
        .select('user_id, name, avatar_url')
        .in('user_id', userIds);
      for (const row of (data || []) as Array<{
        user_id: string;
        name: string | null;
        avatar_url: string | null;
      }>) {
        profileById.set(row.user_id, {
          name: row.name || 'Someone',
          avatar_url: row.avatar_url,
        });
      }
    } catch {
      // ignore
    }
  }

  const facesByEvent = new Map<string, PeopleGoingProof['faces']>();
  for (const rel of relationships) {
    const list = facesByEvent.get(rel.event_id) ?? [];
    if (list.length >= faceLimit) continue;
    if (list.some((f) => f.userId === rel.user_id)) continue;
    const profile = profileById.get(rel.user_id);
    list.push({
      userId: rel.user_id,
      name: profile?.name || 'Someone',
      avatarUrl: profile?.avatar_url,
    });
    facesByEvent.set(rel.event_id, list);
  }

  for (const id of ids) {
    const count = counts.get(id) ?? facesByEvent.get(id)?.length ?? 0;
    out.set(id, {
      eventId: id,
      count,
      faces: facesByEvent.get(id) ?? [],
    });
  }

  return out;
}

/** Demo seed fixtures when curator set is empty (LOI-574: seed fixtures OK). */
export function getSeedFeaturedShows(weekId: string): WeeklyFeaturedShow[] {
  const base = SYNTH_20_HOME.featuredTarget;
  const seeds: WeeklyFeaturedShow[] = [];
  for (let i = 1; i <= base; i++) {
    const eventId = `seed-dc-featured-${weekId}-${i}`;
    seeds.push({
      eventId,
      position: i,
      genre: i % 3 === 0 ? 'jazz' : i % 2 === 0 ? 'hip-hop' : 'indie',
      curatorNote: 'seed-fixture',
      chatProvisionKey: `featured_show:${weekId}:${eventId}`,
      title: `DC seed show ${i}`,
      artistName: `Seed artist ${i}`,
      venueName: i % 2 === 0 ? '9:30 Club' : 'Union Stage',
      venueCity: 'Washington',
      eventDate: null,
      imageUrl: null,
      eventGenres: null,
    });
  }
  return seeds;
}

export function goingLabel(count: number): string {
  return SYNTH_20_HOME.featured.goingCount(count);
}
