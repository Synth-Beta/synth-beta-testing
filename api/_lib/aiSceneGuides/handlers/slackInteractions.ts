/**
 * Slack interactivity for AI Scene Guides shadow review buttons/modals.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'crypto';
import type { IncomingMessage } from 'http';

export const config = {
  api: { bodyParser: false },
  maxDuration: 30,
};

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function verifySlackSignature(params: {
  signingSecret: string;
  signature: string | undefined | null;
  timestamp: string | undefined | null;
  rawBody: string;
}): boolean {
  const { signingSecret, signature, timestamp, rawBody } = params;
  if (!signature || !timestamp || !rawBody) return false;
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 60 * 5) return false;
  const digest = createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:${rawBody}`, 'utf8')
    .digest('hex');
  return secureEquals(`v0=${digest}`, signature);
}

async function bufferIncomingMessage(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseFormBody(raw: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of raw.split('&')) {
    if (!part) continue;
    const eq = part.indexOf('=');
    const k = eq === -1 ? part : part.slice(0, eq);
    const v = eq === -1 ? '' : part.slice(eq + 1);
    out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(v) ? v[0] : v;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const signingSecret = process.env.AI_SHADOW_SLACK_SIGNING_SECRET;
  const allowlist = (process.env.AI_SHADOW_REVIEWER_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!signingSecret) return res.status(500).send('Not configured');

  const rawBody = await bufferIncomingMessage(req);
  const ok = verifySlackSignature({
    signingSecret,
    signature: headerValue(req.headers as Record<string, string | string[] | undefined>, 'x-slack-signature'),
    timestamp: headerValue(
      req.headers as Record<string, string | string[] | undefined>,
      'x-slack-request-timestamp',
    ),
    rawBody,
  });
  if (!ok) return res.status(401).send('Unauthorized');

  const form = parseFormBody(rawBody);
  const payload = JSON.parse(form.payload || '{}') as {
    type?: string;
    user?: { id?: string };
    actions?: Array<{ action_id?: string; value?: string }>;
    view?: { callback_id?: string; private_metadata?: string; state?: { values?: Record<string, Record<string, { selected_option?: { value?: string }; value?: string }>> } };
    trigger_id?: string;
  };

  const userId = payload.user?.id || '';
  if (!allowlist.includes(userId)) {
    return res.status(200).json({ text: 'Unauthorized' });
  }

  const { recordReview, buildFailReasonModal } = await import(
    '../../../../ai-scene-guides/src/slack/commands.js'
  ).then(async (mod) => {
    const blocks = await import('../../../../ai-scene-guides/src/slack/blocks.js');
    return { ...mod, buildFailReasonModal: blocks.buildFailReasonModal };
  });

  if (payload.type === 'block_actions') {
    const action = payload.actions?.[0];
    const actionId = action?.action_id || '';
    let value: { planId?: string; candidateId?: string } = {};
    try {
      value = JSON.parse(action?.value || '{}');
    } catch {
      value = { planId: action?.value };
    }

    if (actionId === 'shadow_pass') {
      recordReview({
        planId: value.planId || '',
        candidateMessageId: value.candidateId,
        reviewerSlackUserId: userId,
        label: 'pass',
        createdAt: new Date().toISOString(),
      });
      return res.status(200).json({ text: 'Recorded PASS' });
    }

    if (actionId === 'shadow_fail' || actionId === 'shadow_flag') {
      const token = process.env.AI_SHADOW_SLACK_BOT_TOKEN;
      if (token && payload.trigger_id) {
        await fetch('https://slack.com/api/views.open', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            trigger_id: payload.trigger_id,
            view: buildFailReasonModal({
              planId: value.planId || '',
              candidateId: value.candidateId,
              action: actionId === 'shadow_fail' ? 'fail' : 'flag',
            }),
          }),
        });
      }
      return res.status(200).send('');
    }

    if (actionId === 'shadow_simulate_human') {
      return res.status(200).json({
        text: 'SIMULATE HUMAN MESSAGE noted — pending bot-to-bot candidates should show SUPPRESSED: HUMAN ENTERED ROOM on next publish check.',
      });
    }

    if (actionId === 'shadow_fail_plan') {
      recordReview({
        planId: value.planId || action?.value || '',
        reviewerSlackUserId: userId,
        label: 'fail',
        reason: 'fail_plan',
        createdAt: new Date().toISOString(),
      });
      return res.status(200).json({ text: 'FAIL PLAN recorded' });
    }

    if (actionId === 'shadow_add_note') {
      return res.status(200).json({ text: 'Use FLAG with a note for structured feedback.' });
    }
  }

  if (payload.type === 'view_submission') {
    const meta = JSON.parse(payload.view?.private_metadata || '{}') as {
      planId?: string;
      candidateId?: string;
      action?: string;
    };
    const values = payload.view?.state?.values || {};
    const reason = values.reason?.reason_select?.selected_option?.value;
    const note = values.note?.note_input?.value;
    recordReview({
      planId: meta.planId || '',
      candidateMessageId: meta.candidateId,
      reviewerSlackUserId: userId,
      label: meta.action === 'flag' ? 'flag' : 'fail',
      reason,
      note,
      createdAt: new Date().toISOString(),
    });
    return res.status(200).send('');
  }

  return res.status(200).send('');
}
