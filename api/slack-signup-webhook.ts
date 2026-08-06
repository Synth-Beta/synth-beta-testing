/**
 * Slack Signup Webhook
 * Triggered by Supabase Database Webhook on ANY INSERT into public.users.
 * Posts a hygiene-filtered summary to Slack (no geo coords, Apple IDs, admin logs, etc.).
 *
 * Setup: npm run slack:setup-webhook / ./scripts/push-slack-signup-env.sh
 * Env (Vercel):
 *   SLACK_SIGNUP_WEBHOOK_URL, SLACK_SIGNUP_WEBHOOK_SECRET
 *
 * Supabase → Database → Webhooks:
 *   Table public.users, INSERT → POST https://join.getsynth.app/api/slack-signup-webhook
 *   Header x-webhook-secret = SLACK_SIGNUP_WEBHOOK_SECRET
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function getSlackWebhookUrl(): string | null {
  return process.env.SLACK_SIGNUP_WEBHOOK_URL?.trim() || null;
}

function getSlackWebhookSecret(): string | null {
  return process.env.SLACK_SIGNUP_WEBHOOK_SECRET?.trim() || null;
}

/** Subset of public.users — only fields safe/useful for team signup alerts. */
interface UsersSignupRecord {
  id?: string;
  user_id?: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  account_type?: string | null;
  account_status?: string | null;
  acquisition_source?: string | null;
  other_acquisition_source?: string | null;
  referral_code?: string | null;
  location_city?: string | null;
  location_state?: string | null;
  music_streaming_service?: string | null;
  onboarding_completed?: boolean | null;
  waitlist_signup_at?: string | null;
  is_bot?: boolean | null;
  created_at?: string | null;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: UsersSignupRecord;
  old_record: unknown;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

function asBool(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  return null;
}

/** Pick only allowlisted fields from the raw INSERT record (hygiene). */
function selectSignupFields(raw: Record<string, unknown> | UsersSignupRecord | null | undefined): UsersSignupRecord {
  const r = (raw || {}) as Record<string, unknown>;
  return {
    id: asTrimmedString(r.id) ?? undefined,
    user_id: asTrimmedString(r.user_id) ?? undefined,
    name: asTrimmedString(r.name),
    username: asTrimmedString(r.username),
    email: asTrimmedString(r.email),
    account_type: asTrimmedString(r.account_type),
    account_status: asTrimmedString(r.account_status),
    acquisition_source: asTrimmedString(r.acquisition_source),
    other_acquisition_source: asTrimmedString(r.other_acquisition_source),
    referral_code: asTrimmedString(r.referral_code),
    location_city: asTrimmedString(r.location_city),
    location_state: asTrimmedString(r.location_state),
    music_streaming_service: asTrimmedString(r.music_streaming_service),
    onboarding_completed: asBool(r.onboarding_completed),
    waitlist_signup_at: asTrimmedString(r.waitlist_signup_at),
    is_bot: asBool(r.is_bot),
    created_at: asTrimmedString(r.created_at),
  };
}

function escapeSlackMrkdwn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatLocation(city: string | null | undefined, state: string | null | undefined): string | null {
  if (city && state) return `${city}, ${state}`;
  return city || state || null;
}

function formatSignupMessage(record: UsersSignupRecord): string {
  const title = record.is_bot ? '*New Synth signup (bot)*' : '*New Synth signup*';
  const lines: string[] = [title];

  if (record.name) lines.push(`Name: ${escapeSlackMrkdwn(record.name)}`);
  if (record.username) lines.push(`Username: \`${escapeSlackMrkdwn(record.username)}\``);
  if (record.email) lines.push(`Email: ${escapeSlackMrkdwn(record.email)}`);

  const userId = record.user_id || record.id;
  if (userId) lines.push(`Auth user ID: \`${userId}\``);

  if (record.account_type) lines.push(`Account type: ${escapeSlackMrkdwn(record.account_type)}`);
  if (record.account_status) lines.push(`Status: ${escapeSlackMrkdwn(record.account_status)}`);

  const location = formatLocation(record.location_city, record.location_state);
  if (location) lines.push(`Location: ${escapeSlackMrkdwn(location)}`);

  if (record.music_streaming_service) {
    lines.push(`Streaming: ${escapeSlackMrkdwn(record.music_streaming_service)}`);
  }

  const acquisition =
    record.acquisition_source ||
    (record.other_acquisition_source ? `other: ${record.other_acquisition_source}` : null);
  if (acquisition) lines.push(`Acquisition: ${escapeSlackMrkdwn(acquisition)}`);
  if (record.referral_code) lines.push(`Referral: \`${escapeSlackMrkdwn(record.referral_code)}\``);

  if (record.onboarding_completed != null) {
    lines.push(`Onboarding: ${record.onboarding_completed ? 'completed' : 'not completed'}`);
  }
  if (record.waitlist_signup_at) {
    lines.push(`Waitlist: ${escapeSlackMrkdwn(record.waitlist_signup_at)}`);
  }
  if (record.created_at) lines.push(`Created: ${escapeSlackMrkdwn(record.created_at)}`);

  return lines.join('\n');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    const webhookSecret = getSlackWebhookSecret();
    if (!webhookSecret) {
      console.error('[slack-signup] SLACK_SIGNUP_WEBHOOK_SECRET not configured');
      return res.status(500).json({ error: 'Webhook not configured' });
    }

    const headerSecret = req.headers['x-webhook-secret'];
    const authHeader = req.headers.authorization;
    const bearerSecret =
      typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
        ? authHeader.slice('Bearer '.length).trim()
        : null;
    const providedSecret =
      typeof headerSecret === 'string' && headerSecret.length > 0 ? headerSecret : bearerSecret;

    if (!providedSecret || !secureEquals(providedSecret, webhookSecret)) {
      console.warn('[slack-signup] Unauthorized webhook attempt');
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const payload = req.body as WebhookPayload;
    if (!payload || payload.type !== 'INSERT' || payload.table !== 'users') {
      const reason = 'not an INSERT on users';
      console.log(`[slack-signup] skipped: ${reason}`);
      return res.status(200).json({ ok: true, skipped: reason });
    }

    const slackUrl = getSlackWebhookUrl();
    if (!slackUrl) {
      console.error('[slack-signup] SLACK_SIGNUP_WEBHOOK_URL not configured');
      return res.status(500).json({ error: 'Slack webhook URL not configured' });
    }

    const record = selectSignupFields(payload.record as Record<string, unknown>);
    const text = formatSignupMessage(record);

    const slackRes = await fetch(slackUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });

    if (!slackRes.ok) {
      const body = await slackRes.text().catch(() => '');
      console.error('[slack-signup] Slack post failed', slackRes.status, body.slice(0, 500));
      return res.status(502).json({ error: 'Failed to post to Slack', status: slackRes.status });
    }

    console.log('[slack-signup] posted', {
      user_id: record.user_id,
      username: record.username,
      is_bot: record.is_bot === true,
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[slack-signup] unhandled error', err);
    return res.status(500).json({ error: 'Internal error' });
  }
}
