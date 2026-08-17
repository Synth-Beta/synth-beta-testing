/**
 * App Home + URL verification for AI Scene Guides shadow app.
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac, timingSafeEqual } from 'crypto';
import type { IncomingMessage } from 'http';

export const config = {
  api: { bodyParser: false },
  maxDuration: 20,
};

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

async function bufferIncomingMessage(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawBody = await bufferIncomingMessage(req);
  const signingSecret = process.env.AI_SHADOW_SLACK_SIGNING_SECRET;
  if (!signingSecret) return res.status(500).send('Not configured');

  const signature = (req.headers['x-slack-signature'] as string) || '';
  const timestamp = (req.headers['x-slack-request-timestamp'] as string) || '';
  const digest = createHmac('sha256', signingSecret)
    .update(`v0:${timestamp}:${rawBody}`, 'utf8')
    .digest('hex');
  if (!secureEquals(`v0=${digest}`, signature)) {
    return res.status(401).send('Unauthorized');
  }

  const body = JSON.parse(rawBody) as {
    type?: string;
    challenge?: string;
    event?: { type?: string; user?: string };
  };

  if (body.type === 'url_verification') {
    return res.status(200).json({ challenge: body.challenge });
  }

  if (body.event?.type === 'app_home_opened' && body.event.user) {
    const { buildAppHomeView, getPilotState } = await import(
      '../../../ai-scene-guides/src/slack/commands.js'
    );
    const { publishAppHome } = await import('../../../ai-scene-guides/src/slack/client.js');
    const token = process.env.AI_SHADOW_SLACK_BOT_TOKEN;
    if (token) {
      await publishAppHome({
        token,
        userId: body.event.user,
        view: buildAppHomeView(getPilotState()),
      });
    }
  }

  return res.status(200).send('');
}
