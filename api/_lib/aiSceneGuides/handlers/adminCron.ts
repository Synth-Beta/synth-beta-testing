/**
 * Admin-triggered AI Scene Guides cron actions (schedule rebuild / publish due).
 * Auth: logged-in admin via Supabase JWT is enforced loosely via service role +
 * caller must be admin in the admin app; this route expects CRON_SECRET or
 * Vercel deployment protection in production. For local admin, use service path
 * through supabase directly from the panel when possible.
 *
 * Prefer: admin UI writes schedule via supabase service… For simplicity the
 * panel calls supabase directly for reads and uses this endpoint with
 * x-cron-secret when available, else rebuilds client-side preview only.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import {
  buildDailyRandomSchedule,
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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cronSecret = process.env.CRON_SECRET;
  const provided =
    (req.headers['x-cron-secret'] as string) ||
    ((req.headers.authorization as string) || '').replace(/^Bearer\s+/i, '');

  // Allow when CRON_SECRET matches OR when ADMIN_CRON_BYPASS is set for local
  const okSecret =
    (cronSecret && provided && secureEquals(provided, cronSecret)) ||
    process.env.AI_SCENE_GUIDES_ADMIN_CRON_KEY === provided;

  if (!okSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const action = (req.body?.action || req.query.action || 'schedule') as string;

  try {
    const supabase = getServiceSupabase();
    const settings = await loadScheduleSettings(supabase);

    if (action === 'publish') {
      const result = await publishDueScheduledPosts(supabase, {
        ...settings,
        // Admin manual publish still respects kill switch unless force
        cron_enabled: settings.cron_enabled || Boolean(req.body?.force),
      });
      return res.status(200).json({ ok: true, action, ...result });
    }

    if (action === 'enable_cron') {
      await supabase
        .from('ai_scene_guides_settings')
        .update({
          cron_enabled: true,
          enabled: true,
          mode: 'production',
          dry_run: Boolean(req.body?.dry_run),
          updated_at: new Date().toISOString(),
        })
        .eq('id', 'global');
      return res.status(200).json({ ok: true, action, cron_enabled: true });
    }

    const result = await buildDailyRandomSchedule(supabase, {
      ...settings,
      cron_enabled: true,
    });
    return res.status(200).json({ ok: true, action: 'schedule', ...result });
  } catch (err) {
    console.error('[api/admin/ai-scene-guides-cron]', err);
    return res.status(500).json({
      ok: false,
      error: err instanceof Error ? err.message : 'failed',
    });
  }
}
