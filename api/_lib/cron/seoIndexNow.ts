/**
 * Daily IndexNow ping for the public SEO pages (runs after the events sync).
 * IndexNow feeds Bing, which grounds Copilot and ChatGPT search.
 *
 * Env:
 *   CRON_SECRET   — shared secret; Vercel sends it as a Bearer token
 *   INDEXNOW_KEY  — any 8-128 char [a-zA-Z0-9-] string; served at /indexnow-key.txt
 *
 * Does nothing while seo_settings.mode is 'shadow' or INDEXNOW_KEY is unset.
 */
import { timingSafeEqual } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { collectSeoUrls, loadSettings, seoClient } from '../seo/handler.js';

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const SITES = [
  { site: 'getsynth', host: 'getsynth.app' },
  { site: 'join', host: 'join.getsynth.app' },
] as const;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'Cron not configured' });
  if (!secureEquals((req.headers.authorization as string) ?? '', `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const key = process.env.INDEXNOW_KEY?.trim();
  if (!key) return res.status(200).json({ ok: true, skipped: 'INDEXNOW_KEY not set' });

  const db = seoClient();
  if (!db) return res.status(500).json({ error: 'Supabase not configured' });
  const settings = await loadSettings(db);
  if (!settings.live) return res.status(200).json({ ok: true, skipped: 'SEO is in shadow mode' });

  // shortcut: submits every indexable URL daily rather than only changed ones; the lists
  // change daily as shows are added and pass. Track lastmod if Bing starts throttling.
  const results: Record<string, number | string> = {};
  for (const { site, host } of SITES) {
    const urlList = (await collectSeoUrls(db, site, settings)).slice(0, 10_000);
    if (urlList.length === 0) {
      results[host] = 'no urls';
      continue;
    }
    const response = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host, key, keyLocation: `https://${host}/indexnow-key.txt`, urlList }),
    });
    results[host] = response.status;
  }
  console.log('[cron/seo-indexnow]', results);
  return res.status(200).json({ ok: true, results });
}
