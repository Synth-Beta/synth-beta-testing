/**
 * Vercel Cron — publish due AI Scene Guide scheduled posts.
 * Runs on several once-a-day ticks (Hobby-safe; not a 15-minute expression).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import {
  getServiceSupabase,
  loadScheduleSettings,
  publishDueScheduledPosts,
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
        reason: 'cron_enabled=false',
      });
    }

    const result = await publishDueScheduledPosts(supabase, settings);
    return res.status(200).json({ ok: true, ...result });
  } catch (err) {
    console.error('[cron/ai-scene-guides-publish]', err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'publish failed',
    });
  }
}
