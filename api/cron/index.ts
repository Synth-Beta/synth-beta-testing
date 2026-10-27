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
 * Auth is unchanged: each handler still verifies CRON_SECRET itself. The seo-content,
 * seo-search-data and seo-ai-visibility jobs also accept an admin's Supabase access token
 * so the admin SEO tab can run them on demand.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

// The digest handler is the slowest of the three; the others finish well inside 10s.
export const config = { maxDuration: 300 };

type Job =
  | 'sync-events'
  | 'seed-bot-messages'
  | 'slack-pm-digest'
  | 'engagement-notifications'
  | 'newsletter-generate'
  | 'newsletter-send'
  | 'seo-indexnow'
  | 'seo-content'
  | 'seo-search-data'
  | 'seo-ai-visibility'
  | 'seo-recap'
  | 'jambase-ingest-report';

const JOBS: Job[] = [
  'sync-events',
  'seed-bot-messages',
  'slack-pm-digest',
  'engagement-notifications',
  'newsletter-generate',
  'newsletter-send',
  'seo-indexnow',
  'seo-content',
  'seo-search-data',
  'seo-ai-visibility',
  'seo-recap',
  'jambase-ingest-report',
];

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
 * right thing: sync-events at 09:30, seed-bot-messages at 10:00, digests at 13/17/21,
 * jambase-ingest-report at 18:30.
 */
function jobFromHour(now = new Date()): Job {
  const hour = now.getUTCHours();
  if (hour === 9) return 'sync-events';
  if (hour === 10) return 'seed-bot-messages';
  if (hour === 12) return 'seo-recap';
  if (hour === 18) return 'jambase-ingest-report';
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
  if (path.includes('newsletter-generate')) return 'newsletter-generate';
  if (path.includes('newsletter-send')) return 'newsletter-send';
  if (path.includes('seo-indexnow')) return 'seo-indexnow';
  if (path.includes('seo-content')) return 'seo-content';
  if (path.includes('seo-search-data')) return 'seo-search-data';
  if (path.includes('seo-ai-visibility')) return 'seo-ai-visibility';
  if (path.includes('seo-recap')) return 'seo-recap';
  if (path.includes('jambase-ingest-report')) return 'jambase-ingest-report';

  return jobFromHour();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const job = resolveJob(req);

  try {
    const { isCronAuthorized, probeUptime } = await import('../_lib/adminAlerts.js');
    if (isCronAuthorized(req.headers.authorization)) {
      await probeUptime();
    }
  } catch (err) {
    console.warn('[cron] uptime probe failed', (err as Error).message);
  }

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
  if (job === 'newsletter-generate') {
    const { default: newsletterGenerate } = await import('../_lib/cron/newsletterGenerate.js');
    return newsletterGenerate(req, res);
  }
  if (job === 'newsletter-send') {
    const { default: newsletterSend } = await import('../_lib/cron/newsletterSend.js');
    return newsletterSend(req, res);
  }
  if (job === 'seo-indexnow') {
    const { default: seoIndexNow } = await import('../_lib/cron/seoIndexNow.js');
    return seoIndexNow(req, res);
  }
  if (job === 'seo-content') {
    const { default: seoContent } = await import('../_lib/cron/seoContent.js');
    return seoContent(req, res);
  }
  if (job === 'seo-search-data') {
    const { default: seoSearchData } = await import('../_lib/cron/seoSearchData.js');
    return seoSearchData(req, res);
  }
  if (job === 'seo-ai-visibility') {
    const { default: seoAiVisibility } = await import('../_lib/cron/seoAiVisibility.js');
    return seoAiVisibility(req, res);
  }
  if (job === 'seo-recap') {
    const { default: seoRecap } = await import('../_lib/cron/seoRecap.js');
    return seoRecap(req, res);
  }
  if (job === 'jambase-ingest-report') {
    const { default: jambaseIngestReport } = await import('../_lib/cron/jambaseIngestReport.js');
    return jambaseIngestReport(req, res);
  }

  const { default: slackPmDigest } = await import('../_lib/cron/slackPmDigest.js');
  return slackPmDigest(req, res);
}
