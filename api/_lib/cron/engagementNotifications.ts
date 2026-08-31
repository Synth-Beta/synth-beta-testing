/**
 * Vercel Cron — friends "going out" digest
 *
 * Inserts `friends_event_interest_summary` rows telling each user which shows their
 * friends are interested in or going to over the next 30 days. Push delivery is
 * already handled by backend/push-notification-worker.js, which polls unread
 * notifications — nothing to change there.
 *
 * Lives under api/_lib/ on purpose: the Vercel Hobby plan caps a deployment at 12
 * Serverless Functions and this repo is at the cap. Files under _lib are not counted;
 * api/cron/index.ts dispatches to this one. Adding a new api/*.ts file would fail the
 * whole deploy.
 *
 * The digest logic itself lives in scripts/send-engagement-notifications.mjs and is
 * imported rather than spawned — a static import is what makes Vercel trace the file
 * into the serverless bundle, and it keeps one copy of the logic for both the cron and
 * manual `node scripts/send-engagement-notifications.mjs` runs.
 *
 * Required env vars:
 *   CRON_SECRET                — shared secret; Vercel sends it as a Bearer token
 *   SUPABASE_URL               — project URL
 *   SUPABASE_SERVICE_ROLE_KEY  — needed to read across all users
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';

// Constant-time comparison so response timing can't leak secret prefixes.
// Same helper and check shape as api/_lib/cron/syncEvents.ts.
function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Vercel cron uses GET; POST is for manual triggers.
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[cron/engagement-notifications] CRON_SECRET not configured');
    return res.status(500).json({ error: 'Cron not configured' });
  }

  const authHeader = (req.headers.authorization as string) ?? '';
  if (!secureEquals(authHeader, `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const { getSupabaseClient, sendFriendInterestDigest } = await import(
      '../../../scripts/send-engagement-notifications.mjs'
    );

    const supabase = getSupabaseClient();
    const result = await sendFriendInterestDigest(supabase);

    console.log(`[cron/engagement-notifications] digests sent: ${result.sent}`);
    return res.status(200).json({ ok: true, digestsSent: result.sent });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[cron/engagement-notifications] failed:', message);
    return res.status(500).json({ ok: false, error: message });
  }
}
