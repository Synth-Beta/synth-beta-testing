/**
 * Event Analytics tab. Counts come from public.events (source = jambase),
 * not the empty legacy jambase_events table.
 */

import { supabase } from '@/integrations/supabase/client';

const db = supabase as any;

export type IngestMissing = Record<string, number>;

export type IngestEntityStats = {
  total: number;
  clean: number;
  clean_pct: number | null;
  created_26h: number;
  updated_26h: number;
  latest_updated_at: string | null;
  missing: IngestMissing;
};

export type EventIngestStats = IngestEntityStats & {
  upcoming: number;
  hygiene_upcoming: number;
  festivals_excluded: number;
  latest_modified_at: string | null;
};

export type IngestHealth = {
  generated_at: string;
  cron_start: string;
  fresh: boolean;
  stale: boolean;
  failed_pages: number;
  events: EventIngestStats;
  artists: IngestEntityStats;
  venues: IngestEntityStats;
};

export type HygieneSample = {
  id: string;
  title: string | null;
  event_date: string | null;
  artist_name: string | null;
  venue_name: string | null;
  city: string | null;
  issues: string[];
};

export type TrendingRow = {
  id: string;
  name: string | null;
  title: string | null;
  event_date: string | null;
  artist_name: string | null;
  venue_name: string | null;
  city: string | null;
  feeds: number;
  reviews: number;
  review_views: number;
  emails: number;
  searches: number;
  shares: number;
  interested: number;
  going: number;
  score: number;
  issues: string[] | null;
};

export type TrendingBundle = {
  events: TrendingRow[];
  artists: TrendingRow[];
  venues: TrendingRow[];
};

const emptyTrending = (): TrendingBundle => ({ events: [], artists: [], venues: [] });

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function asStats(raw: any, withUpcoming = false): IngestEntityStats & { upcoming?: number; latest_modified_at?: string | null } {
  const missing: IngestMissing = {};
  for (const [key, value] of Object.entries(raw?.missing || {})) {
    missing[key] = asNumber(value);
  }
  return {
    total: asNumber(raw?.total),
    upcoming: withUpcoming ? asNumber(raw?.upcoming) : undefined,
    hygiene_upcoming: withUpcoming ? asNumber(raw?.hygiene_upcoming ?? raw?.upcoming) : undefined,
    festivals_excluded: withUpcoming ? asNumber(raw?.festivals_excluded) : undefined,
    clean: asNumber(raw?.clean),
    clean_pct: raw?.clean_pct == null ? null : asNumber(raw.clean_pct),
    created_26h: asNumber(raw?.created_26h),
    updated_26h: asNumber(raw?.updated_26h),
    latest_updated_at: raw?.latest_updated_at ?? null,
    latest_modified_at: raw?.latest_modified_at ?? null,
    missing,
  };
}

export type IngestSnapshot = {
  snapshot_missing: boolean;
  refreshed_at: string | null;
  health: IngestHealth | null;
  samples: HygieneSample[];
  trending7: TrendingBundle;
  trending30: TrendingBundle;
};

function asTrendingRows(data: unknown): TrendingRow[] {
  if (!Array.isArray(data)) return [];
  return data.map((row) => {
    const record = row as Record<string, any>;
    return {
    ...record,
    name: record.name ?? record.title ?? null,
    title: record.title ?? record.name ?? null,
    feeds: asNumber(record.feeds),
    reviews: asNumber(record.reviews),
    review_views: asNumber(record.review_views),
    emails: asNumber(record.emails),
    searches: asNumber(record.searches),
    shares: asNumber(record.shares),
    interested: asNumber(record.interested),
    going: asNumber(record.going),
    score: asNumber(record.score),
    issues: Array.isArray(record.issues) ? record.issues : record.issues ?? null,
  };
  });
}

function asTrending(data: unknown): TrendingBundle {
  if (Array.isArray(data)) return { events: asTrendingRows(data), artists: [], venues: [] };
  if (!data || typeof data !== 'object') return emptyTrending();
  const bundle = data as { events?: unknown; artists?: unknown; venues?: unknown };
  return {
    events: asTrendingRows(bundle.events),
    artists: asTrendingRows(bundle.artists),
    venues: asTrendingRows(bundle.venues),
  };
}

function asHealth(data: any): IngestHealth | null {
  if (!data || data.snapshot_missing || !data.events) return null;
  return {
    generated_at: data.generated_at,
    cron_start: data.cron_start,
    fresh: Boolean(data.fresh),
    stale: Boolean(data.stale),
    failed_pages: asNumber(data.failed_pages),
    events: asStats(data.events, true) as EventIngestStats,
    artists: asStats(data.artists) as IngestEntityStats,
    venues: asStats(data.venues) as IngestEntityStats,
  };
}

export function parseIngestSnapshot(data: any): IngestSnapshot {
  const health = asHealth(data?.health);
  if (!data || data.snapshot_missing || !health) {
    return {
      snapshot_missing: true,
      refreshed_at: null,
      health: null,
      samples: [],
      trending7: emptyTrending(),
      trending30: emptyTrending(),
    };
  }
  return {
    snapshot_missing: false,
    refreshed_at: data.refreshed_at ?? null,
    health,
    samples: Array.isArray(data.samples) ? data.samples : [],
    trending7: asTrending(data.trending_7),
    trending30: asTrending(data.trending_30),
  };
}

let memoryCache: IngestSnapshot | null = null;

export function peekEventIngestSnapshot(): IngestSnapshot | null {
  return memoryCache && !memoryCache.snapshot_missing ? memoryCache : null;
}

export async function fetchEventIngestSnapshot(force = false): Promise<IngestSnapshot> {
  if (!force && memoryCache && !memoryCache.snapshot_missing) return memoryCache;
  const { data, error } = await db.rpc('admin_event_ingest_snapshot');
  if (error) throw new Error(error.message);
  const parsed = parseIngestSnapshot(data);
  if (!parsed.snapshot_missing) memoryCache = parsed;
  return parsed;
}

export async function rebuildEventIngestSnapshot(): Promise<IngestSnapshot> {
  const { data, error } = await db.rpc('refresh_jambase_ingest_snapshot');
  if (error) throw new Error(error.message);
  const parsed = parseIngestSnapshot(data);
  if (!parsed.snapshot_missing) memoryCache = parsed;
  else memoryCache = null;
  return parsed;
}

export async function fetchEventIngestHealth(): Promise<IngestHealth> {
  const snapshot = await fetchEventIngestSnapshot();
  if (!snapshot.health) throw new Error('No stored ingest snapshot yet');
  return snapshot.health;
}

export async function fetchHygieneSamples(): Promise<HygieneSample[]> {
  const { data, error } = await db.rpc('admin_event_hygiene_samples', { p_limit: 25 });
  if (error) throw new Error(error.message);
  return Array.isArray(data) ? data : [];
}

export async function fetchTrendingEvents(days: number): Promise<TrendingBundle> {
  const { data, error } = await db.rpc('admin_trending_events', { p_days: days });
  if (error) throw new Error(error.message);
  return asTrending(data);
}
