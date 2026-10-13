/**
 * POST /api/share?collect=1 — first-party pageview and conversion events from the
 * tracker (api/_lib/seo/tracker.ts). Writes seo_page_views with the service role.
 * Never stores IPs; geo comes from Vercel's edge headers. Bots are dropped.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import type { SupabaseClient } from '@supabase/supabase-js';
import { classifyBot } from './bots.js';
import { seoServiceClient } from './jobAuth.js';
import { classifySource, deviceFromUserAgent, looksAutomated } from './traffic.js';

const EVENTS = new Set(['pageview', 'cta_click', 'app_store_click', 'ticket_click', 'signup']);
const ID_RE = /^[a-f0-9]{8,64}$/;
const HOST_RE = /(^|\.)getsynth\.app$/;

function str(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
}

function header(req: VercelRequest, name: string): string | null {
  const raw = req.headers[name];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;
  try {
    return decodeURIComponent(value).slice(0, 100);
  } catch {
    return value.slice(0, 100);
  }
}

function readBody(req: VercelRequest): Record<string, unknown> | null {
  const raw = req.body;
  if (raw && typeof raw === 'object' && !Buffer.isBuffer(raw)) return raw as Record<string, unknown>;
  const text = Buffer.isBuffer(raw) ? raw.toString('utf8') : typeof raw === 'string' ? raw : '';
  if (!text || text.length > 8000) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

/** First non-internal pageview for this visitor: who gets credit for a conversion. */
async function firstTouch(db: SupabaseClient, visitorId: string) {
  const { data } = await db
    .from('seo_page_views')
    .select('source_category,source_name,path')
    .eq('visitor_id', visitorId)
    .eq('event_name', 'pageview')
    .neq('source_category', 'internal')
    .order('ts', { ascending: true })
    .limit(1)
    .maybeSingle();
  return data as { source_category: string; source_name: string | null; path: string } | null;
}

export async function handleCollect(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const userAgent = (req.headers['user-agent'] as string | undefined) ?? null;
  if (looksAutomated(userAgent) || classifyBot(userAgent)) return res.status(204).end();

  const body = readBody(req);
  const eventName = str(body?.e, 30);
  const host = str(body?.h, 100)?.toLowerCase() ?? null;
  const path = str(body?.p, 500);
  if (!body || !eventName || !EVENTS.has(eventName) || !host || !HOST_RE.test(host) || !path?.startsWith('/')) {
    return res.status(204).end();
  }
  const visitorId = str(body.v, 64);
  const sessionId = str(body.s, 64);
  const utm = body.u && typeof body.u === 'object' ? (body.u as Record<string, unknown>) : {};

  const db = seoServiceClient();
  if (!db) return res.status(204).end();

  const source = classifySource({
    referrer: str(body.r, 1000),
    utmSource: str(utm.utm_source, 200),
    utmMedium: str(utm.utm_medium, 200),
  });

  let ft: { source_category: string; source_name: string | null; path: string } | null = null;
  if (eventName !== 'pageview' && visitorId && ID_RE.test(visitorId)) {
    ft = await firstTouch(db, visitorId).catch(() => null);
  }

  const { error } = await db.from('seo_page_views').insert({
    event_name: eventName,
    host,
    path,
    page_type: str(body.t, 40),
    referrer_host: source.referrerHost,
    referrer_path: source.referrerPath,
    utm_source: str(utm.utm_source, 200),
    utm_medium: str(utm.utm_medium, 200),
    utm_campaign: str(utm.utm_campaign, 200),
    utm_term: str(utm.utm_term, 200),
    utm_content: str(utm.utm_content, 200),
    source_category: source.category,
    source_name: source.name,
    ft_source_category: ft?.source_category ?? (eventName === 'pageview' ? null : source.category),
    ft_source_name: ft?.source_name ?? (eventName === 'pageview' ? null : source.name),
    ft_landing_path: ft?.path ?? null,
    country: header(req, 'x-vercel-ip-country'),
    region: header(req, 'x-vercel-ip-country-region'),
    city: header(req, 'x-vercel-ip-city'),
    device: deviceFromUserAgent(userAgent),
    visitor_id: visitorId && ID_RE.test(visitorId) ? visitorId : null,
    session_id: sessionId && ID_RE.test(sessionId) ? sessionId : null,
  });
  if (error) console.warn('[seo/collect] insert failed', error.message);
  return res.status(204).end();
}
