/**
 * Vercel Cron — AI Scene Guides Slack shadow runs.
 * Never writes to Synth messages. Fail-closed without channel allowlist.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';

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
  const authHeader = (req.headers.authorization as string) ?? '';
  if (!secureEquals(authHeader, `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (process.env.AI_SCENE_GUIDES_MODE !== 'shadow_slack') {
    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: 'AI_SCENE_GUIDES_MODE is not shadow_slack',
    });
  }

  if (process.env.AI_SCENE_GUIDES_ENABLED !== 'true') {
    return res.status(200).json({ ok: true, skipped: true, reason: 'kill_switch' });
  }

  const feed = process.env.AI_SHADOW_SLACK_FEED_CHANNEL_ID;
  const alerts = process.env.AI_SHADOW_SLACK_ALERTS_CHANNEL_ID;
  const daily = process.env.AI_SHADOW_SLACK_DAILY_CHANNEL_ID;
  const token = process.env.AI_SHADOW_SLACK_BOT_TOKEN;
  if (!feed || !alerts || !daily || !token) {
    return res.status(500).json({
      ok: false,
      error: 'Shadow Slack channels/token not configured — fail closed',
    });
  }

  const { getPilotState } = await import('../../../../ai-scene-guides/src/slack/commands.js');
  const state = getPilotState();
  if (state.killed || state.paused) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: state.killed ? 'killed' : 'paused',
    });
  }

  const { runFixturePipeline } = await import('../../../../ai-scene-guides/src/pipeline/run.js');
  const { buildPlanParentBlocks, buildCandidateBlocks } = await import(
    '../../../../ai-scene-guides/src/slack/blocks.js'
  );
  const { postSlackMessage } = await import('../../../../ai-scene-guides/src/slack/client.js');

  const scenarios = [
    'upcoming-indie',
    'hiphop-setlist-complete',
    'electronic-no-setlist',
    'metal-humans-active',
    'pop-stale-setlist',
  ];
  const fixture = scenarios[new Date().getUTCDay() % scenarios.length]!;
  const plan = await runFixturePipeline({ fixtureScenario: fixture });

  const wroteToSynthMessages = false;

  const parent = buildPlanParentBlocks(plan);
  const parentRes = await postSlackMessage({
    token,
    channel: feed,
    blocks: parent.blocks,
    text: parent.text,
  });

  let delivered = 0;
  let blocked = 0;
  for (const c of plan.candidates) {
    const card = buildCandidateBlocks(plan, c);
    if (c.publisherDecision === 'rejected' || c.publisherDecision === 'suppressed') {
      blocked += 1;
      await postSlackMessage({
        token,
        channel: alerts,
        text: `BLOCKED — WOULD NOT PUBLISH (${c.publisherDecision}): ${c.suppressionReason ?? ''}`,
        blocks: card.blocks,
      });
    } else {
      await postSlackMessage({
        token,
        channel: feed,
        threadTs: parentRes.ts,
        blocks: card.blocks,
        text: card.text,
      });
      delivered += 1;
    }
  }

  void daily;

  return res.status(200).json({
    ok: true,
    fixture,
    planId: plan.id,
    delivered,
    blocked,
    wroteToSynthMessages,
  });
}
