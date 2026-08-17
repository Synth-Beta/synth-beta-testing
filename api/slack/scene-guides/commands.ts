/**
 * /synth-shadow slash command
 * Request URL: https://join.getsynth.app/api/slack/scene-guides/commands
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

  if (!signingSecret) {
    return res.status(500).send('AI shadow Slack not configured');
  }

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
  if (form.command !== '/synth-shadow') {
    return res.status(200).json({ response_type: 'ephemeral', text: 'Unknown command' });
  }

  const userId = form.user_id || '';
  if (!allowlist.includes(userId)) {
    return res.status(200).json({
      response_type: 'ephemeral',
      text: 'Unauthorized: not on the AI shadow reviewer allowlist.',
    });
  }

  // Lazy-load package handlers (keeps cold start lighter when unused)
  const { handleShadowCommand } = await import('../../../ai-scene-guides/src/slack/commands.js');
  const result = await handleShadowCommand({
    text: form.text || '',
    userId,
    allowlist,
  });

  return res.status(200).json({
    response_type: 'ephemeral',
    text: result.response,
  });
}
