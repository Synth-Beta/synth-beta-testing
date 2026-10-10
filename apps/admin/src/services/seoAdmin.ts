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

export async function fetchCrawlerSummary(): Promise<CrawlerSummary[]> {
  const since30 = new Date(Date.now() - 30 * 86_400_000);
  const since7 = Date.now() - 7 * 86_400_000;
  // shortcut: client-side grouping of up to 10k rows; move to an RPC if crawl volume grows past that.
  const { data, error } = await db
    .from('seo_crawler_hits')
    .select('bot_name,bot_category,ts')
    .gte('ts', since30.toISOString())
    .order('ts', { ascending: false })
    .limit(10_000);
  if (error) throw new Error(error.message);

  const byBot = new Map<string, CrawlerSummary>();
  for (const row of (data ?? []) as Array<{ bot_name: string; bot_category: string; ts: string }>) {
    const entry = byBot.get(row.bot_name) ?? { bot_name: row.bot_name, bot_category: row.bot_category, last7: 0, last30: 0 };
    entry.last30 += 1;
    if (new Date(row.ts).getTime() >= since7) entry.last7 += 1;
    byBot.set(row.bot_name, entry);
  }
  return [...byBot.values()].sort((a, b) => b.last30 - a.last30);
}

export type GenreCount = { genre_slug: string; upcoming_events: number };

export async function fetchGenreCounts(): Promise<GenreCount[]> {
  const { data, error } = await db.rpc('seo_genre_counts');
  if (error) throw new Error(error.message);
  return ((data ?? []) as GenreCount[]).sort((a, b) => b.upcoming_events - a.upcoming_events);
}
