/**
 * Morning SEO recap for #seo (C0C8WJK3L78), posted by the admin bot.
 *
 * Yesterday is a complete America/New_York day. Search Console lags, so search
 * numbers are the last 7 days on file. AI answers use the latest run.
 *
 * Scheduled at 12:00 UTC (8:00am ET) via /api/cron?job=seo-recap.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { postAdminChannel, seoRecapChannel } from '../adminAlerts.js';
import { authorizeSeoJob, seoServiceClient } from '../seo/jobAuth.js';

const TZ = 'America/New_York';
const HOSTS = ['getsynth.app', 'join.getsynth.app'];

const SOURCE_LABELS: Record<string, string> = {
  organic_search: 'Search',
  ai_assistant: 'AI',
  social: 'Social',
  referral: 'Referral',
  direct: 'Direct',
  email: 'Email',
  paid: 'Paid',
  internal: 'Internal',
};

type ViewRow = {
  ts: string;
  host: string;
  event_name: string;
  session_id: string | null;
  visitor_id: string | null;
  source_category: string | null;
  source_name: string | null;
};

type SearchRow = { date: string; engine: string; clicks: number; impressions: number };
type AiRow = { platform: string; mentioned: boolean; synth_cited: boolean; error: string | null; run_at: string };
type CrawlerRow = { host: string; bot_category: string };

function zonedParts(date: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') % 24, minute: get('minute'), second: get('second') };
}

function tzOffsetMs(date: Date): number {
  const p = zonedParts(date);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/** Midnight in New York, `daysAgo` calendar days before today. */
function nyMidnight(daysAgo: number, now = new Date()): Date {
  const p = zonedParts(now);
  const utcGuess = new Date(Date.UTC(p.year, p.month - 1, p.day - daysAgo, 0, 0, 0));
  return new Date(utcGuess.getTime() - tzOffsetMs(utcGuess));
}

function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

function sessionId(row: ViewRow): string {
  return row.session_id || row.visitor_id || row.ts;
}

function inRange(ts: string, start: Date, end: Date): boolean {
  const t = new Date(ts).getTime();
  return t >= start.getTime() && t < end.getTime();
}

function siteLines(rows: ViewRow[], start: Date, end: Date, prevStart: Date): string[] {
  const lines: string[] = [];
  const seen = new Set(HOSTS);
  const hosts = [...HOSTS, ...new Set(rows.map((r) => r.host).filter((h) => !seen.has(h)))];
  for (const host of hosts) {
    const cur = rows.filter((r) => r.host === host && r.event_name === 'pageview' && inRange(r.ts, start, end));
    const prev = rows.filter((r) => r.host === host && r.event_name === 'pageview' && inRange(r.ts, prevStart, start));
    const visits = new Set(cur.map(sessionId)).size;
    const visitsPrev = new Set(prev.map(sessionId)).size;
    const visitors = new Set(cur.map((r) => r.visitor_id).filter(Boolean)).size;
    const first = new Map<string, string>();
    for (const row of cur) {
      const id = sessionId(row);
      if (!first.has(id)) first.set(id, row.source_category || 'direct');
    }
    let organic = 0;
    let ai = 0;
    for (const category of first.values()) {
      if (category === 'organic_search') organic += 1;
      if (category === 'ai_assistant') ai += 1;
    }
    const delta = visits - visitsPrev;
    const deltaText = visitsPrev || visits ? ` (${delta > 0 ? '+' : ''}${delta} vs the day before)` : '';
    lines.push(
      `*${host}* — ${fmt(visits)} visits${deltaText} · ${fmt(cur.length)} pageviews · ${fmt(visitors)} visitors · ${fmt(organic)} search · ${fmt(ai)} AI`,
    );
  }
  return lines;
}

function sourceLine(rows: ViewRow[], start: Date, end: Date): string {
  const counts = new Map<string, number>();
  const seen = new Set<string>();
  for (const row of rows) {
    if (row.event_name !== 'pageview' || !inRange(row.ts, start, end)) continue;
    const id = `${row.host}|${sessionId(row)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const category = row.source_category || '';
    const named = row.source_name && row.source_name !== '(none)' ? row.source_name : '';
    const label = category === 'internal'
      ? (named ? `from ${named}` : 'Internal')
      : named || SOURCE_LABELS[category] || category || 'Direct';
    counts.set(label, (counts.get(label) || 0) + 1);
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (top.length === 0) return '*Sources* — no visits';
  return `*Sources* — ${top.map(([name, n]) => `${name} ${fmt(n)}`).join(' · ')}`;
}

function searchLines(rows: SearchRow[]): string[] {
  if (rows.length === 0) {
    const google = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim() ? 'Google — no rows' : 'Google — service account not connected';
    const bing = process.env.BING_WEBMASTER_API_KEY?.trim() ? 'Bing — no stats yet' : 'Bing — key not set';
    return ['*Search*', google, bing];
  }
  const byEngine = new Map<string, SearchRow[]>();
  for (const row of rows) {
    const list = byEngine.get(row.engine) ?? [];
    list.push(row);
    byEngine.set(row.engine, list);
  }
  const lines = ['*Search* (last 7 days on file)'];
  for (const engine of ['google', 'bing']) {
    const list = byEngine.get(engine) ?? [];
    if (list.length === 0) {
      lines.push(engine === 'google' ? 'Google — not connected yet' : 'Bing — no rows');
      continue;
    }
    const latest = list.reduce((max, row) => (row.date > max ? row.date : max), list[0].date);
    const cutoff = new Date(`${latest}T12:00:00Z`);
    cutoff.setUTCDate(cutoff.getUTCDate() - 6);
    const from = cutoff.toISOString().slice(0, 10);
    const recent = list.filter((row) => row.date >= from && row.date <= latest);
    const clicks = recent.reduce((n, row) => n + (Number(row.clicks) || 0), 0);
    const impressions = recent.reduce((n, row) => n + (Number(row.impressions) || 0), 0);
    const name = engine === 'google' ? 'Google' : 'Bing';
    lines.push(`${name} — ${fmt(clicks)} clicks · ${fmt(impressions)} impressions · through ${latest}`);
  }
  return lines;
}

function aiLines(rows: AiRow[]): string[] {
  if (rows.length === 0) return ['*AI answers* — no runs yet'];
  const latest = rows.reduce((max, row) => (row.run_at > max ? row.run_at : max), rows[0].run_at).slice(0, 10);
  const day = rows.filter((row) => row.run_at.slice(0, 10) === latest);
  const byPlatform = new Map<string, { runs: number; mentioned: number; cited: number; errors: number }>();
  for (const row of day) {
    const entry = byPlatform.get(row.platform) ?? { runs: 0, mentioned: 0, cited: 0, errors: 0 };
    entry.runs += 1;
    if (row.error) entry.errors += 1;
    else {
      if (row.mentioned) entry.mentioned += 1;
      if (row.synth_cited) entry.cited += 1;
    }
    byPlatform.set(row.platform, entry);
  }
  const lines = [`*AI answers* · ${latest}`];
  for (const [platform, stats] of [...byPlatform.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const asked = stats.runs - stats.errors;
    if (asked === 0) {
      lines.push(`${platform} — ${fmt(stats.errors)} errors`);
      continue;
    }
    lines.push(
      `${platform} — mentioned ${fmt(stats.mentioned)} of ${fmt(asked)}${stats.cited ? ` · cited ${fmt(stats.cited)}` : ''}${stats.errors ? ` · ${fmt(stats.errors)} errors` : ''}`,
    );
  }
  return lines;
}

function crawlerLine(rows: CrawlerRow[]): string {
  if (rows.length === 0) return '*Crawlers* — none yesterday';
  const parts = HOSTS.map((host) => {
    const mine = rows.filter((row) => row.host === host);
    const search = mine.filter((row) => row.bot_category === 'search').length;
    const ai = mine.filter((row) => row.bot_category === 'ai').length;
    return `${host} ${fmt(search)} search / ${fmt(ai)} AI`;
  });
  return `*Crawlers* — ${parts.join(' · ')}`;
}

export function buildSeoRecap(input: {
  label: string;
  views: ViewRow[];
  yesterdayStart: Date;
  todayStart: Date;
  dayBeforeStart: Date;
  search: SearchRow[];
  ai: AiRow[];
  crawlers: CrawlerRow[];
  signups: number;
}): string {
  const lines = [
    `*SEO recap · ${input.label}*`,
    ...siteLines(input.views, input.yesterdayStart, input.todayStart, input.dayBeforeStart),
    sourceLine(input.views, input.yesterdayStart, input.todayStart),
  ];
  if (input.signups) lines.push(`*Signups* — ${fmt(input.signups)}`);
  lines.push(...searchLines(input.search), ...aiLines(input.ai), crawlerLine(input.crawlers));
  return lines.join('\n');
}

async function fetchPages<T>(
  db: SupabaseClient,
  table: string,
  columns: string,
  apply: (query: any) => any,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; from < 20_000; from += 1000) {
    const { data, error } = await apply(db.from(table).select(columns)).range(from, from + 999);
    if (error) throw new Error(`${table}: ${error.message}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

export async function collectSeoRecap(db: SupabaseClient): Promise<string> {
  const todayStart = nyMidnight(0);
  const yesterdayStart = nyMidnight(1);
  const dayBeforeStart = nyMidnight(2);
  const label = yesterdayStart.toLocaleDateString('en-US', {
    timeZone: TZ,
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
  const searchSince = new Date(Date.now() - 21 * 86_400_000).toISOString().slice(0, 10);
  const [views, search, ai, crawlers] = await Promise.all([
      fetchPages<ViewRow>(db, 'seo_page_views', 'ts,host,event_name,session_id,visitor_id,source_category,source_name', (q) =>
        q.gte('ts', dayBeforeStart.toISOString()).order('ts', { ascending: true }),
      ),
      fetchPages<SearchRow>(db, 'seo_search_daily', 'date,engine,clicks,impressions', (q) =>
        q.eq('query', '').gte('date', searchSince).order('date', { ascending: true }),
      ),
      fetchPages<AiRow>(db, 'seo_ai_mentions', 'platform,mentioned,synth_cited,error,run_at', (q) =>
        q.gte('run_at', new Date(Date.now() - 14 * 86_400_000).toISOString()).order('run_at', { ascending: false }),
      ),
      fetchPages<CrawlerRow>(db, 'seo_crawler_hits', 'host,bot_category', (q) =>
        q.gte('ts', yesterdayStart.toISOString()).lt('ts', todayStart.toISOString()).order('ts', { ascending: true }),
      ),
    ]);

    const signups = views.filter((row) => row.event_name === 'signup' && inRange(row.ts, yesterdayStart, todayStart)).length;
    return buildSeoRecap({ label, views, yesterdayStart, todayStart, dayBeforeStart, search, ai, crawlers, signups });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await authorizeSeoJob(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const db = seoServiceClient();
  if (!db) return res.status(500).json({ error: 'Supabase service role not configured' });

  try {
    const text = await collectSeoRecap(db);
    const posted = await postAdminChannel(seoRecapChannel(), text);
    if (!posted.ok) return res.status(502).json({ ok: false, error: posted.error });
    console.log('[cron/seo-recap] posted');
    return res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron/seo-recap]', message);
    return res.status(500).json({ ok: false, error: message });
  }
}
