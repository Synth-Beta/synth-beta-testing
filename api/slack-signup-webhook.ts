/**
 * Slack Signup Webhook
 *
 * Paths:
 *   1) Supabase Database Webhook on public.users INSERT
 *      Header x-webhook-secret = SLACK_SIGNUP_WEBHOOK_SECRET
 *   2) Signed-in client (web/mobile) after profile ensure
 *      Authorization: Bearer <user access token>
 *
 * Env: SLACK_SIGNUP_WEBHOOK_URL, SLACK_SIGNUP_WEBHOOK_SECRET,
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import {
  alertSignupIfNeeded,
  extractInsertRecord,
  getSlackSignupWebhookSecret,
  getSupabaseService,
  loadUserSignupRecord,
} from './_lib/slackSignup.js';

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function bearerToken(req: VercelRequest): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    return token.length > 0 ? token : null;
  }
  return null;
}

function headerSecret(req: VercelRequest): string | null {
  const value = req.headers['x-webhook-secret'];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

async function handleDatabaseWebhook(req: VercelRequest, res: VercelResponse) {
  const record = extractInsertRecord(req.body);
  if (!record) {
    const reason = 'not an INSERT on users';
    console.log(`[slack-signup] skipped: ${reason}`);
    return res.status(200).json({ ok: true, skipped: reason });
  }

  const result = await alertSignupIfNeeded(record);
  if (result.skipped === 'slack_failed') {
    return res.status(502).json({ error: 'Failed to post to Slack' });
  }
  return res.status(200).json({ ok: true, posted: result.posted, skipped: result.skipped ?? null });
}

async function handleUserNotify(token: string, res: VercelResponse) {
  const supabase = getSupabaseService();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  const { data, error } = await supabase.auth.getUser(token);
  const userId = data.user?.id;
  if (error || !userId) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const createdAt = data.user?.created_at;
  if (createdAt) {
    const ageMs = Date.now() - new Date(createdAt).getTime();
    if (ageMs > 7 * 24 * 60 * 60 * 1000) {
      return res.status(200).json({ ok: true, skipped: 'not_recent' });
    }
  }

  const record = await loadUserSignupRecord(userId);
  if (!record) {
    return res.status(200).json({ ok: true, skipped: 'no_public_user' });
  }

  const result = await alertSignupIfNeeded(record);
  if (result.skipped === 'slack_failed') {
    return res.status(502).json({ error: 'Failed to post to Slack' });
  }
  return res.status(200).json({ ok: true, posted: result.posted, skipped: result.skipped ?? null });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const webhookSecret = getSlackSignupWebhookSecret();
    const providedSecret = headerSecret(req);
    const token = bearerToken(req);

    if (webhookSecret && providedSecret && secureEquals(providedSecret, webhookSecret)) {
      return handleDatabaseWebhook(req, res);
    }

    // Legacy: some hooks sent the shared secret as Bearer
    if (webhookSecret && token && secureEquals(token, webhookSecret)) {
      return handleDatabaseWebhook(req, res);
    }

    if (token && token.split('.').length === 3) {
      return handleUserNotify(token, res);
    }

    console.warn('[slack-signup] Unauthorized webhook attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  } catch (err) {
    console.error('[slack-signup] unhandled error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
