/**
 * Admin SEO tab data (via user JWT + RLS). Tables come from
 * supabase/migrations/20261010120000_seo_engine_mvp.sql.
 */

import { supabase } from '@/integrations/supabase/client';

// seo_* tables are not in the generated Database types yet.
const db = supabase as any;

export type SeoSettings = { mode: 'shadow' | 'live'; min_venue_events: number };

export type SeoCandidate = {
  entity_type: 'venue' | 'artist';
  entity_id: string;
  name: string;
  slug: string | null;
  upcoming_events: number;
};

export type CrawlerSummary = { bot_name: string; bot_category: string; last7: number; last30: number };

export async function fetchSeoSettings(): Promise<SeoSettings> {
  const { data, error } = await db.from('seo_settings').select('mode,min_venue_events').maybeSingle();
  if (error) throw new Error(error.message);
  return { mode: data?.mode === 'live' ? 'live' : 'shadow', min_venue_events: data?.min_venue_events ?? 3 };
}

export async function saveSeoSettings(settings: SeoSettings): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await db
    .from('seo_settings')
    .update({ ...settings, updated_at: new Date().toISOString(), updated_by: auth.user?.id ?? null })
    .eq('id', true);
  if (error) throw new Error(error.message);
}

export async function fetchSeoCandidates(): Promise<SeoCandidate[]> {
  const { data, error } = await db.rpc('seo_page_candidates');
  if (error) throw new Error(error.message);
  return (data ?? []) as SeoCandidate[];
}

type CrawlerRow = { ts: string; host: string; path: string; bot_name: string; bot_category: 'search' | 'ai' };

async function fetchCrawlerRows(sinceIso: string): Promise<CrawlerRow[]> {
  const pageSize = 1000;
  const rows: CrawlerRow[] = [];
  for (let from = 0; from < 20_000; from += pageSize) {
    const { data, error } = await db
      .from('seo_crawler_hits')
      .select('ts,host,path,bot_name,bot_category')
      .gte('ts', sinceIso)
      .order('ts', { ascending: false })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as CrawlerRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }
  return rows;
}

export async function fetchCrawlerSummary(): Promise<CrawlerSummary[]> {
  const since30 = Date.now() - 30 * 86_400_000;
  const since7 = Date.now() - 7 * 86_400_000;
  const rows = await fetchCrawlerRows(new Date(since30).toISOString());
  const byBot = new Map<string, CrawlerSummary>();
  for (const row of rows) {
    const entry = byBot.get(row.bot_name) ?? { bot_name: row.bot_name, bot_category: row.bot_category, last7: 0, last30: 0 };
    entry.last30 += 1;
    if (new Date(row.ts).getTime() >= since7) entry.last7 += 1;
    byBot.set(row.bot_name, entry);
  }
  return [...byBot.values()].sort((a, b) => b.last30 - a.last30);
}

export type CrawlerTraffic = {
  days: number;
  hits: number;
  hitsPrev: number;
  search: number;
  searchPrev: number;
  ai: number;
  aiPrev: number;
  pages: number;
  pagesPrev: number;
  bots: number;
  truncated: boolean;
  daily: Array<{ day: string; hits: number; search: number; ai: number }>;
  topBots: Array<{ bot_name: string; bot_category: string; hits: number }>;
  topPages: Array<{ host: string; path: string; hits: number; ai: number }>;
};

const dayKey = (ts: string) => ts.slice(0, 10);
const pageKey = (row: CrawlerRow) => `${row.host}${row.path}`;

export async function fetchCrawlerTraffic(days: number): Promise<CrawlerTraffic> {
  const windowMs = days * 86_400_000;
  const now = Date.now();
  const rows = await fetchCrawlerRows(new Date(now - 2 * windowMs).toISOString());
  const cutoff = now - windowMs;
  const current = rows.filter((r) => new Date(r.ts).getTime() >= cutoff);
  const previous = rows.filter((r) => new Date(r.ts).getTime() < cutoff);

  const dailyMap = new Map<string, { day: string; hits: number; search: number; ai: number }>();
  const bots = new Map<string, { bot_name: string; bot_category: string; hits: number }>();
  const pages = new Map<string, { host: string; path: string; hits: number; ai: number }>();

  for (const row of current) {
    const day = dayKey(row.ts);
    const d = dailyMap.get(day) ?? { day, hits: 0, search: 0, ai: 0 };
    d.hits += 1;
    if (row.bot_category === 'ai') d.ai += 1;
    else d.search += 1;
    dailyMap.set(day, d);

    const bot = bots.get(row.bot_name) ?? { bot_name: row.bot_name, bot_category: row.bot_category, hits: 0 };
    bot.hits += 1;
    bots.set(row.bot_name, bot);

    const key = pageKey(row);
    const page = pages.get(key) ?? { host: row.host, path: row.path, hits: 0, ai: 0 };
    page.hits += 1;
    if (row.bot_category === 'ai') page.ai += 1;
    pages.set(key, page);
  }

  const count = (list: CrawlerRow[], category?: 'search' | 'ai') =>
    category ? list.filter((r) => r.bot_category === category).length : list.length;
  const uniquePages = (list: CrawlerRow[]) => new Set(list.map(pageKey)).size;

  return {
    days,
    hits: current.length,
    hitsPrev: previous.length,
    search: count(current, 'search'),
    searchPrev: count(previous, 'search'),
    ai: count(current, 'ai'),
    aiPrev: count(previous, 'ai'),
    pages: uniquePages(current),
    pagesPrev: uniquePages(previous),
    bots: bots.size,
    truncated: rows.length >= 20_000,
    daily: [...dailyMap.values()].sort((a, b) => a.day.localeCompare(b.day)),
    topBots: [...bots.values()].sort((a, b) => b.hits - a.hits).slice(0, 12),
    topPages: [...pages.values()].sort((a, b) => b.hits - a.hits).slice(0, 15),
  };
}

export type GenreCount = { genre_slug: string; upcoming_events: number };

export async function fetchGenreCounts(): Promise<GenreCount[]> {
  const { data, error } = await db.rpc('seo_genre_counts');
  if (error) throw new Error(error.message);
  return ((data ?? []) as GenreCount[]).sort((a, b) => b.upcoming_events - a.upcoming_events);
}

// ── Growth dashboard (supabase/migrations/20261012120000_seo_growth_engine.sql) ──

export type SourceCategory = 'ai_assistant' | 'organic_search' | 'social' | 'email' | 'paid' | 'referral' | 'internal' | 'direct';

export type SeoDashboard = {
  days: number;
  kpis: Record<
    | 'pageviews'
    | 'pageviews_prev'
    | 'visits'
    | 'visits_prev'
    | 'visitors'
    | 'organic_visits'
    | 'organic_visits_prev'
    | 'ai_visits'
    | 'ai_visits_prev'
    | 'signups'
    | 'signups_prev'
    | 'app_store_clicks'
    | 'cta_clicks'
    | 'ticket_clicks',
    number
  >;
  daily: Array<{ day: string; visits: number; organic_search: number; ai_assistant: number; social: number; referral: number; direct: number; other: number }>;
  sources: Array<{ source_category: SourceCategory; source_name: string; visits: number; signups: number }>;
  ai_platforms: Array<{ platform: string; visits: number }>;
  landing_pages: Array<{ host: string; path: string; visits: number; organic: number; ai: number }>;
  countries: Array<{ country: string; visits: number }>;
  regions: Array<{ country: string; region: string; city: string; visits: number }>;
  devices: Array<{ device: string; visits: number }>;
  conversions: Array<{ event_name: string; first_touch: string; total: number }>;
  search_daily: Array<{ day: string; google_clicks: number | null; google_impressions: number | null; bing_clicks: number | null; bing_impressions: number | null }>;
  top_queries: Array<{ query: string; clicks: number; impressions: number; position: number | null; engines: string }>;
  top_search_pages: Array<{ page: string; clicks: number; impressions: number; position: number | null }>;
  opportunities: Array<{ query: string; clicks: number; impressions: number; position: number | null }>;
  ai_visibility: Array<{ platform: string; runs: number; mentioned: number; cited: number }>;
  ai_weekly: Array<{ week: string; platform: string; mention_rate: number | null }>;
  ai_latest: Array<{
    prompt: string;
    platform: string;
    run_at: string;
    mentioned: boolean;
    synth_cited: boolean;
    synth_rank: number | null;
    brands_mentioned: string[];
    cited_urls: string[];
    answer_excerpt: string | null;
    error: string | null;
  }>;
  competitors: Array<{ brand: string; mentions: number }>;
  crawlers_daily: Array<{ day: string; search: number; ai: number }>;
  crawler_bots: Array<{ bot_name: string; bot_category: string; hits: number; last_seen: string }>;
  crawler_paths: Array<{ host: string; path: string; hits: number; ai_hits: number }>;
};

export async function fetchSeoDashboard(days: number): Promise<SeoDashboard> {
  const { data, error } = await db.rpc('seo_dashboard', { p_days: days });
  if (error) throw new Error(error.message);
  return data as SeoDashboard;
}

export const TRACKED_HOSTS = ['getsynth.app', 'join.getsynth.app'] as const;

export type SiteStat = {
  host: string;
  visits: number;
  visitsPrev: number;
  pageviews: number;
  pageviewsPrev: number;
  visitors: number;
  organic: number;
  ai: number;
};

export type SiteTraffic = {
  sites: SiteStat[];
  daily: Array<{ day: string; visits: Record<string, number> }>;
  truncated: boolean;
};

type PageViewRow = {
  ts: string;
  host: string;
  session_id: string | null;
  visitor_id: string | null;
  source_category: string | null;
};

async function fetchPageViewRows(since: string): Promise<{ rows: PageViewRow[]; truncated: boolean }> {
  const rows: PageViewRow[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await db
      .from('seo_page_views')
      .select('ts,host,session_id,visitor_id,source_category')
      .eq('event_name', 'pageview')
      .gte('ts', since)
      .order('ts', { ascending: true })
      .range(from, from + 999);
    if (error) throw new Error(error.message);
    const page = (data ?? []) as PageViewRow[];
    rows.push(...page);
    if (page.length < 1000) return { rows, truncated: false };
  }
  return { rows, truncated: true };
}

function viewSession(row: PageViewRow): string {
  return row.session_id || row.visitor_id || row.ts;
}

function siteStat(host: string, current: PageViewRow[], previous: PageViewRow[]): SiteStat {
  const cur = current.filter((row) => row.host === host);
  const prev = previous.filter((row) => row.host === host);
  const first = new Map<string, string>();
  for (const row of cur) {
    const id = viewSession(row);
    if (!first.has(id)) first.set(id, row.source_category || '');
  }
  let organic = 0;
  let ai = 0;
  for (const category of first.values()) {
    if (category === 'organic_search') organic += 1;
    if (category === 'ai_assistant') ai += 1;
  }
  return {
    host,
    visits: new Set(cur.map(viewSession)).size,
    visitsPrev: new Set(prev.map(viewSession)).size,
    pageviews: cur.length,
    pageviewsPrev: prev.length,
    visitors: new Set(cur.map((row) => row.visitor_id).filter(Boolean)).size,
    organic,
    ai,
  };
}

/** Visits split by site. A session counts on each host it actually opened. */
export async function fetchSiteTraffic(days: number): Promise<SiteTraffic> {
  const span = days * 86_400_000;
  const now = Date.now();
  const { rows, truncated } = await fetchPageViewRows(new Date(now - 2 * span).toISOString());
  const cutoff = now - span;
  const current = rows.filter((row) => new Date(row.ts).getTime() >= cutoff);
  const previous = rows.filter((row) => new Date(row.ts).getTime() < cutoff);
  const extra = [...new Set(current.map((row) => row.host))].filter((host) => !TRACKED_HOSTS.includes(host as (typeof TRACKED_HOSTS)[number]));
  const hosts = [...TRACKED_HOSTS, ...extra];
  const dailyMap = new Map<string, Record<string, Set<string>>>();
  for (const row of current) {
    const day = row.ts.slice(0, 10);
    const byHost = dailyMap.get(day) ?? {};
    const sessions = byHost[row.host] ?? new Set<string>();
    sessions.add(viewSession(row));
    byHost[row.host] = sessions;
    dailyMap.set(day, byHost);
  }
  return {
    sites: hosts.map((host) => siteStat(host, current, previous)).sort((a, b) => {
      const ai = TRACKED_HOSTS.indexOf(a.host as (typeof TRACKED_HOSTS)[number]);
      const bi = TRACKED_HOSTS.indexOf(b.host as (typeof TRACKED_HOSTS)[number]);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return b.visits - a.visits;
    }),
    daily: [...dailyMap.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, byHost]) => ({
        day,
        visits: Object.fromEntries(Object.entries(byHost).map(([host, sessions]) => [host, sessions.size])),
      })),
    truncated,
  };
}

export type ContentType = 'guide' | 'brand' | 'comparison';
export type ContentStatus = 'review' | 'published' | 'rejected' | 'archived';

export type SeoContent = {
  id: string;
  target_query_id: string | null;
  page_type: ContentType;
  slug: string;
  title: string;
  meta_description: string;
  summary: string;
  body_md: string;
  faq: Array<{ q: string; a: string }>;
  keywords: string[];
  status: ContentStatus;
  review_notes: string | null;
  model: string | null;
  grounding: unknown;
  created_at: string;
  updated_at: string;
  published_at: string | null;
};

const CONTENT_PREFIX: Record<ContentType, string> = { guide: 'guides', brand: 'learn', comparison: 'compare' };
export const contentPageUrl = (c: Pick<SeoContent, 'page_type' | 'slug'>) => `https://getsynth.app/${CONTENT_PREFIX[c.page_type]}/${c.slug}`;

export async function fetchSeoContent(): Promise<SeoContent[]> {
  const { data, error } = await db.from('seo_content').select('*').order('updated_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as SeoContent[];
}

export type ContentEdit = Pick<SeoContent, 'slug' | 'title' | 'meta_description' | 'summary' | 'body_md' | 'faq' | 'keywords'>;

export async function saveSeoContent(id: string, edit: ContentEdit): Promise<void> {
  const { error } = await db.from('seo_content').update({ ...edit, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setSeoContentStatus(item: SeoContent, status: ContentStatus, reviewNotes?: string | null): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: now, reviewed_at: now, reviewed_by: auth.user?.id ?? null };
  if (status === 'published' && !item.published_at) patch.published_at = now;
  if (reviewNotes !== undefined) patch.review_notes = reviewNotes;
  const { error } = await db.from('seo_content').update(patch).eq('id', item.id);
  if (error) throw new Error(error.message);
}

export type SeoTarget = {
  id: string;
  query: string;
  cluster: string;
  page_type: ContentType;
  priority: number;
  genre_slug: string | null;
  notes: string | null;
  active: boolean;
  created_at: string;
};

export async function fetchSeoTargets(): Promise<SeoTarget[]> {
  const { data, error } = await db
    .from('seo_target_queries')
    .select('id,query,cluster,page_type,priority,genre_slug,notes,active,created_at')
    .order('priority', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SeoTarget[];
}

export async function createSeoTarget(target: Pick<SeoTarget, 'query' | 'cluster' | 'page_type' | 'priority'> & { notes?: string | null }): Promise<void> {
  const { error } = await db.from('seo_target_queries').insert(target);
  if (error) throw new Error(error.message);
}

export async function updateSeoTarget(id: string, patch: Partial<Omit<SeoTarget, 'id' | 'created_at'>>): Promise<void> {
  const { error } = await db.from('seo_target_queries').update({ ...patch, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSeoTarget(id: string): Promise<void> {
  const { error } = await db.from('seo_target_queries').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export type SeoAiPrompt = { id: string; prompt: string; cluster: string; active: boolean };

export async function fetchSeoAiPrompts(): Promise<SeoAiPrompt[]> {
  const { data, error } = await db.from('seo_ai_prompts').select('id,prompt,cluster,active').order('created_at', { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as SeoAiPrompt[];
}

export async function createSeoAiPrompt(prompt: string, cluster: string): Promise<void> {
  const { error } = await db.from('seo_ai_prompts').insert({ prompt, cluster });
  if (error) throw new Error(error.message);
}

export async function updateSeoAiPrompt(id: string, patch: Partial<Pick<SeoAiPrompt, 'prompt' | 'cluster' | 'active'>>): Promise<void> {
  const { error } = await db.from('seo_ai_prompts').update(patch).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteSeoAiPrompt(id: string): Promise<void> {
  const { error } = await db.from('seo_ai_prompts').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export type SeoJob = 'seo-content' | 'seo-search-data' | 'seo-ai-visibility';

/** Runs an SEO job now via api/cron (the job checks that the caller is an admin). */
/** Generate (and optionally publish) pages for target searches missing a live page. */
export async function runSeoTargetBatch(options: { publish?: boolean; limit?: number } = {}): Promise<Record<string, unknown>> {
  const params: Record<string, string> = { batch: '1' };
  if (options.publish) params.publish = '1';
  if (options.limit) params.limit = String(options.limit);
  return runSeoJob('seo-content', params);
}

export async function runSeoJob(job: SeoJob, params: Record<string, string> = {}): Promise<Record<string, unknown>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not signed in');
  const query = new URLSearchParams({ job, ...params });
  const response = await fetch(`/api/cron?${query}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    const results = body.results as Array<{ error?: string }> | undefined;
    throw new Error(String(results?.[0]?.error ?? body.error ?? `Request failed (${response.status})`));
  }
  return body;
}
