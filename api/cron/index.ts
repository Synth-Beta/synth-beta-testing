/**
 * Single Hobby-plan entry for every Vercel cron job.
 *
 * The three cron handlers used to be three separate functions (api/cron/sync-events.ts,
 * seed-bot-messages.ts, slack-pm-digest.ts). Vercel's Hobby plan caps a deployment at 12
 * Serverless Functions and the repo had reached 14, which failed the whole deploy — so the
 * bodies moved to api/_lib/cron/ (files under _lib are not counted as functions) and this
 * file dispatches to them, exactly like api/ai-scene-guides.ts does for its nine jobs.
 *
 * Reached three ways, all equivalent:
 *   - vercel.json crons  -> /api/cron/index?job=<job>
 *   - the original paths -> /api/cron/sync-events etc, rewritten here (see vercel.json)
 *   - manual trigger     -> POST with Authorization: Bearer <CRON_SECRET>
 *
 * Auth is unchanged: each handler still verifies CRON_SECRET itself.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// The digest handler is the slowest of the three; the others finish well inside 10s.
export const config = { maxDuration: 60 };

type Job = 'sync-events' | 'seed-bot-messages' | 'slack-pm-digest' | 'engagement-notifications';

const JOBS: Job[] = ['sync-events', 'seed-bot-messages', 'slack-pm-digest', 'engagement-notifications'];

function queryJob(req: VercelRequest): string {
  const raw = req.query.job;
  return String(Array.isArray(raw) ? raw[0] : raw || '').trim();
}

function pathOf(req: VercelRequest): string {
  const url = String(req.url || '');
  try {
    return new URL(url, 'http://localhost').pathname;
  } catch {
    return url.split('?')[0] || '';
  }
}

/**
 * Falls back to the UTC hour so a cron that somehow arrives without ?job still runs the
 * right thing: sync-events at 09:30, seed-bot-messages at 10:00, digests at 13/17/21.
 */
function jobFromHour(now = new Date()): Job {
  const hour = now.getUTCHours();
  if (hour === 9) return 'sync-events';
  if (hour === 10) return 'seed-bot-messages';
  return 'slack-pm-digest';
}

function resolveJob(req: VercelRequest): Job {
  const q = queryJob(req);
  if ((JOBS as string[]).includes(q)) return q as Job;

  const path = pathOf(req);
  if (path.includes('sync-events')) return 'sync-events';
  if (path.includes('seed-bot-messages')) return 'seed-bot-messages';
  if (path.includes('slack-pm-digest')) return 'slack-pm-digest';
  if (path.includes('engagement-notifications')) return 'engagement-notifications';

  return jobFromHour();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const job = resolveJob(req);

  if (job === 'sync-events') {
    const { default: syncEvents } = await import('../_lib/cron/syncEvents.js');
    return syncEvents(req, res);
  }
  if (job === 'seed-bot-messages') {
    const { default: seedBotMessages } = await import('../_lib/cron/seedBotMessages.js');
    return seedBotMessages(req, res);
  }
  if (job === 'engagement-notifications') {
    const { default: engagementNotifications } = await import('../_lib/cron/engagementNotifications.js');
    return engagementNotifications(req, res);
  }

  const { default: slackPmDigest } = await import('../_lib/cron/slackPmDigest.js');
  return slackPmDigest(req, res);
}
