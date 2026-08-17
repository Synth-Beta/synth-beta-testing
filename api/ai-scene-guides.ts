/**
 * Single Hobby-plan entry for AI Scene Guides HTTP + cron.
 * Extra /api/cron|admin|slack/scene-guides paths rewrite here (see vercel.json).
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = {
  api: { bodyParser: false },
  maxDuration: 120,
};

type Job =
  | 'schedule'
  | 'publish'
  | 'shadow'
  | 'admin'
  | 'quality-seed'
  | 'slack-commands'
  | 'slack-events'
  | 'slack-interactions';

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

function jobFromHour(now = new Date()): Job {
  const hour = now.getUTCHours();
  if (hour === 6) return 'schedule';
  if (hour === 14) return 'shadow';
  return 'publish';
}

function resolveJob(req: VercelRequest): Job {
  const q = queryJob(req);
  const allowed: Job[] = [
    'schedule',
    'publish',
    'shadow',
    'admin',
    'quality-seed',
    'slack-commands',
    'slack-events',
    'slack-interactions',
  ];
  if ((allowed as string[]).includes(q)) return q as Job;

  const path = pathOf(req);
  if (path.includes('quality-seed')) return 'quality-seed';
  if (path.includes('ai-scene-guides-cron') || path.endsWith('/admin/ai-scene-guides')) return 'admin';
  if (path.includes('ai-scene-guides-schedule')) return 'schedule';
  if (path.includes('ai-scene-guides-shadow')) return 'shadow';
  if (path.includes('ai-scene-guides-publish')) return 'publish';
  if (path.includes('scene-guides/commands')) return 'slack-commands';
  if (path.includes('scene-guides/events')) return 'slack-events';
  if (path.includes('scene-guides/interactions')) return 'slack-interactions';

  return jobFromHour();
}

async function readRawBody(req: VercelRequest): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const job = resolveJob(req);

  if (job === 'slack-commands') {
    const { default: slackCommands } = await import('./_lib/aiSceneGuides/handlers/slackCommands.js');
    return slackCommands(req, res);
  }
  if (job === 'slack-events') {
    const { default: slackEvents } = await import('./_lib/aiSceneGuides/handlers/slackEvents.js');
    return slackEvents(req, res);
  }
  if (job === 'slack-interactions') {
    const { default: slackInteractions } = await import('./_lib/aiSceneGuides/handlers/slackInteractions.js');
    return slackInteractions(req, res);
  }

  const raw = await readRawBody(req);
  const contentType = String(req.headers['content-type'] || '');
  if (raw && contentType.includes('json')) {
    try {
      req.body = JSON.parse(raw);
    } catch {
      req.body = {};
    }
  } else if (req.body == null) {
    req.body = {};
  }

  if (job === 'schedule') {
    const { default: scheduleCron } = await import('./_lib/aiSceneGuides/handlers/scheduleCron.js');
    return scheduleCron(req, res);
  }
  if (job === 'shadow') {
    const { default: shadowCron } = await import('./_lib/aiSceneGuides/handlers/shadowCron.js');
    return shadowCron(req, res);
  }
  if (job === 'admin') {
    const { default: adminCron } = await import('./_lib/aiSceneGuides/handlers/adminCron.js');
    return adminCron(req, res);
  }
  if (job === 'quality-seed') {
    const { default: qualitySeed } = await import('./_lib/aiSceneGuides/handlers/qualitySeed.js');
    return qualitySeed(req, res);
  }

  const { default: publishCron } = await import('./_lib/aiSceneGuides/handlers/publishCron.js');
  return publishCron(req, res);
}
