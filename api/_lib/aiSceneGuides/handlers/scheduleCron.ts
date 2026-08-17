/**
 * Vercel Cron — build today's randomized AI Scene Guide post schedule.
 * Does not post immediately; publish tick handles due rows.
 *
 * Schedule: daily ~06:00 UTC (see vercel.json)
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import {
  buildDailyRandomSchedule,
  getServiceSupabase,
  loadScheduleSettings,
} from '../cronScheduler.js';

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export const config = { maxDuration: 60 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'Cron not configured' });
  const auth = (req.headers.authorization as string) ?? '';
  if (!secureEquals(auth, `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const supabase = getServiceSupabase();
    const settings = await loadScheduleSettings(supabase);

    if (!settings.cron_enabled) {
      return res.status(200).json({
        ok: true,
        skipped: true,
        reason: 'cron_enabled=false — enable in Admin → AI Scene Guides',
      });
    }

    const result = await buildDailyRandomSchedule(supabase, settings);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/ai-scene-guides-schedule]', err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'schedule failed',
    });
  }
}
