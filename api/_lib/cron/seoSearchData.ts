/**
 * Daily Search Console + Bing Webmaster ingest into seo_search_daily, then seo_prune().
 *
 * Rows with query = '' are page totals (Google: [date, page]; Bing: GetPageStats). Rows
 * with page = '' are Bing query totals. Google [date, page, query] rows carry both, minus
 * the queries Google anonymizes, so page totals are the accurate click counts.
 *
 * Env:
 *   GSC_SERVICE_ACCOUNT_JSON  — Google Cloud service account key (JSON). Add its
 *                               client_email as a user on the Search Console property.
 *   GSC_SITES                 — comma-separated properties, default "sc-domain:getsynth.app"
 *   BING_WEBMASTER_API_KEY    — Bing Webmaster Tools > Settings > API access
 *   BING_SITES                — default "https://getsynth.app/,https://join.getsynth.app/"
 */
import { createSign } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { authorizeSeoJob, seoServiceClient } from '../seo/jobAuth.js';

type SearchRow = {
  date: string;
  engine: 'google' | 'bing';
  site: string;
  page: string;
  query: string;
  clicks: number;
  impressions: number;
  ctr: number | null;
  position: number | null;
};

const DAY = 86_400_000;
const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const base64url = (value: Buffer | string) => Buffer.from(value).toString('base64url');

function list(value: string | undefined, fallback: string): string[] {
  return (value?.trim() || fallback).split(',').map((s) => s.trim()).filter(Boolean);
}

async function googleAccessToken(rawKey: string): Promise<string> {
  const key = JSON.parse(rawKey) as { client_email: string; private_key: string };
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${base64url(
    JSON.stringify({
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )}`;
  const signature = createSign('RSA-SHA256').update(unsigned).sign(key.private_key.replace(/\\n/g, '\n'));
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${unsigned}.${base64url(signature)}`,
    }),
  });
  const json = (await response.json()) as { access_token?: string; error_description?: string };
  if (!json.access_token) throw new Error(`Google token: ${json.error_description ?? response.status}`);
  return json.access_token;
}

async function gscQuery(token: string, site: string, dimensions: string[], startDate: string, endDate: string) {
  const rows: Array<{ keys: string[]; clicks: number; impressions: number; ctr: number; position: number }> = [];
  for (let startRow = 0; startRow < 100_000; startRow += 25_000) {
    const response = await fetch(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ startDate, endDate, dimensions, rowLimit: 25_000, startRow, dataState: 'all' }),
    });
    if (!response.ok) throw new Error(`${response.status}`);
    const page = ((await response.json()) as { rows?: typeof rows }).rows ?? [];
    rows.push(...page);
    if (page.length < 25_000) break;
  }
  return rows;
}

async function lastDate(db: SupabaseClient, engine: 'google' | 'bing', site: string): Promise<string | null> {
  const { data } = await db.from('seo_search_daily').select('date').eq('engine', engine).eq('site', site).order('date', { ascending: false }).limit(1).maybeSingle();
  return (data?.date as string | undefined) ?? null;
}

const DEFAULT_GSC_SITES = 'sc-domain:getsynth.app,https://getsynth.app/,https://www.getsynth.app/,https://join.getsynth.app/';

/** Properties the key can access, plus the configured list. A denied property must not drop the others. */
async function googleSites(token: string): Promise<string[]> {
  const discovered: string[] = [];
  try {
    const response = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (response.ok) {
      const json = (await response.json()) as { siteEntry?: Array<{ siteUrl?: string }> };
      for (const site of json.siteEntry ?? []) if (site.siteUrl) discovered.push(site.siteUrl);
    }
  } catch {
    // Fall back to the configured list.
  }
  return [...new Set([...discovered, ...list(process.env.GSC_SITES, DEFAULT_GSC_SITES)])];
}

async function fetchGoogle(db: SupabaseClient, rawKey: string): Promise<{ rows: SearchRow[]; notes: string[] }> {
  const token = await googleAccessToken(rawKey);
  const out: SearchRow[] = [];
  const notes: string[] = [];
  const end = isoDay(Date.now() - DAY);
  for (const site of await googleSites(token)) {
    try {
      const last = await lastDate(db, 'google', site);
      // Recent days keep updating for ~3 days, so always re-pull a short overlap.
      // First sync covers the 16 months Search Console keeps.
      const start = last ? isoDay(Math.min(Date.parse(last) - 3 * DAY, Date.now() - 4 * DAY)) : isoDay(Date.now() - 480 * DAY);
      const [byPage, byQuery] = await Promise.all([
        gscQuery(token, site, ['date', 'page'], start, end),
        gscQuery(token, site, ['date', 'page', 'query'], start, end),
      ]);
      for (const r of byPage) {
        out.push({ date: r.keys[0], engine: 'google', site, page: r.keys[1], query: '', clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
      }
      for (const r of byQuery) {
        out.push({ date: r.keys[0], engine: 'google', site, page: r.keys[1], query: r.keys[2].slice(0, 500), clicks: r.clicks, impressions: r.impressions, ctr: r.ctr, position: r.position });
      }
      notes.push(`${site}: ${byPage.length + byQuery.length} rows`);
    } catch (err) {
      notes.push(`${site}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return { rows: out, notes };
}

/** Bing returns WCF dates: "/Date(1712300400000-0700)/". */
function bingDate(value: string): string | null {
  const ms = /\/Date\((-?\d+)/.exec(value)?.[1];
  return ms ? isoDay(Number(ms)) : null;
}

async function fetchBing(apiKey: string): Promise<SearchRow[]> {
  const out: SearchRow[] = [];
  for (const site of list(process.env.BING_SITES, 'https://getsynth.app/,https://join.getsynth.app/')) {
    for (const method of ['GetQueryStats', 'GetPageStats'] as const) {
      const url = `https://ssl.bing.com/webmaster/api.svc/json/${method}?siteUrl=${encodeURIComponent(site)}&apikey=${encodeURIComponent(apiKey)}`;
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Bing ${method} ${site}: ${response.status}`);
      const rows = ((await response.json()) as { d?: Array<Record<string, any>> }).d ?? [];
      for (const r of rows) {
        const date = bingDate(String(r.Date ?? ''));
        const key = String(r.Query ?? '').slice(0, 500);
        if (!date || !key) continue;
        const clicks = Number(r.Clicks) || 0;
        const impressions = Number(r.Impressions) || 0;
        const position = Number(r.AvgImpressionPosition);
        out.push({
          date,
          engine: 'bing',
          site,
          page: method === 'GetPageStats' ? key : '',
          query: method === 'GetQueryStats' ? key : '',
          clicks,
          impressions,
          ctr: impressions ? clicks / impressions : null,
          position: position > 0 ? position : null,
        });
      }
    }
  }
  return out;
}

async function upsert(db: SupabaseClient, rows: SearchRow[]): Promise<void> {
  // Postgres rejects an upsert batch that contains the same key twice.
  const unique = [...new Map(rows.map((r) => [`${r.date}|${r.engine}|${r.site}|${r.page}|${r.query}`, r])).values()];
  for (let i = 0; i < unique.length; i += 1000) {
    const { error } = await db.from('seo_search_daily').upsert(unique.slice(i, i + 1000), { onConflict: 'date,engine,site,page,query' });
    if (error) throw new Error(`seo_search_daily: ${error.message}`);
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await authorizeSeoJob(req);
  if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
  const db = seoServiceClient();
  if (!db) return res.status(500).json({ error: 'Supabase service role not configured' });

  const results: Record<string, number | string> = {};
  const gscKey = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim();
  if (gscKey) {
    try {
      const google = await fetchGoogle(db, gscKey);
      await upsert(db, google.rows);
      results.google = google.notes.join('; ') || String(google.rows.length);
    } catch (err) {
      results.google = err instanceof Error ? err.message : String(err);
    }
  } else results.google = 'GSC_SERVICE_ACCOUNT_JSON not set';

  const bingKey = process.env.BING_WEBMASTER_API_KEY?.trim();
  if (bingKey) {
    try {
      const rows = await fetchBing(bingKey);
      await upsert(db, rows);
      results.bing = rows.length;
    } catch (err) {
      results.bing = err instanceof Error ? err.message : String(err);
    }
  } else results.bing = 'BING_WEBMASTER_API_KEY not set';

  const { error: pruneError } = await db.rpc('seo_prune');
  results.prune = pruneError ? pruneError.message : 'ok';

  console.log('[cron/seo-search-data]', results);
  return res.status(200).json({ ok: true, results });
}
