/**
 * Vercel Cron — JamBase ingest missed-run check.
 *
 * Runs at 18:30 UTC (see vercel.json). Posts to Synth Admin Bot only when no
 * JamBase event was updated after that day's 09:30 UTC sync window.
 *
 * Required env vars:
 *   CRON_SECRET
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *   SLACK_ADMIN_BOT_TOKEN
 *   SLACK_ADMIN_BOT_EVENT_HYGIENE_CHANNEL (optional, default C0CBGCHC325)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import { postMissedIngestIfStale } from '../eventIngestReport.mjs';

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/jambase-ingest-report] CRON_SECRET not configured');
    return res.status(500).json({ error: 'Cron not configured' });
  }

  const authHeader = (req.headers.authorization as string) ?? '';
  if (!secureEquals(authHeader, `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const result = await postMissedIngestIfStale();
    if (result.ok === false && !result.skipped) {
      return res.status(502).json({ ok: false, error: result.error });
    }
    return res.status(200).json({ ok: true, ...result });
  } catch (err: any) {
    console.error('[cron/jambase-ingest-report]', err.message);
    return res.status(500).json({ error: err.message });
  }
}
