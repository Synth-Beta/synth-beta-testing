/**
 * Homebrew error alerts for #alerts (SLACK_ADMIN_BOT_ALERTS_CHANNEL).
 * Posts as the admin bot. The old incoming webhook is only a fallback.
 */
import { createHash, timingSafeEqual } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const DEFAULT_ALERTS_CHANNEL = 'C0BL95CSDMF';
const DEFAULT_SEO_CHANNEL = 'C0C8WJK3L78';
const DEDUPE_MS = 30 * 60 * 1000;
const RATE_WINDOW_MS = 10 * 60 * 1000;
const RATE_CAP = 40;

export type ClientSurface = 'web' | 'app' | 'admin';
export type ClientSeverity = 'bug' | 'down' | 'failed_index';

export interface ClientIssueInput {
  surface: ClientSurface;
  severity?: ClientSeverity | null;
  message?: string | null;
  stack?: string | null;
  context?: string | null;
  url?: string | null;
  platform?: string | null;
  appVersion?: string | null;
  userId?: string | null;
}

function clip(value: unknown, max: number): string {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length > max ? text.slice(0, max) : text;
}

function escapeSlack(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function alertsChannel(): string {
  return process.env.SLACK_ADMIN_BOT_ALERTS_CHANNEL?.trim() || DEFAULT_ALERTS_CHANNEL;
}

/** #seo. SLACK_ADMIN_BOT_CHANNEL is already this channel. */
export function seoRecapChannel(): string {
  return (
    process.env.SLACK_ADMIN_BOT_SEO_CHANNEL?.trim() ||
    process.env.SLACK_ADMIN_BOT_CHANNEL?.trim() ||
    DEFAULT_SEO_CHANNEL
  );
}

async function postBotMessage(
  channel: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number } | null> {
  const token = process.env.SLACK_ADMIN_BOT_TOKEN?.trim();
  if (!token) return null;
  const slackRes = await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify({ channel, text, unfurl_links: false, unfurl_media: false }),
  });
  const body = (await slackRes.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
  if (slackRes.ok && body?.ok) return { ok: true };
  console.error('[admin-alerts] bot post failed', body?.error || slackRes.status);
  return { ok: false, error: body?.error || `Slack ${slackRes.status}`, status: slackRes.status };
}

function service(): SupabaseClient | null {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function isNoise(message: string): boolean {
  return /ResizeObserver loop|Script error\.?$|chrome-extension:|moz-extension:|safari-extension:|AbortError|The user aborted a request|Non-Error promise rejection captured/i.test(
    message,
  );
}

function fingerprintOf(surface: string, severity: string, message: string, context: string): string {
  return createHash('sha256')
    .update(`${surface}|${severity}|${context}|${message.split('\n')[0].slice(0, 180)}`)
    .digest('hex')
    .slice(0, 24);
}

function titleFor(severity: ClientSeverity, surface: ClientSurface): string {
  if (severity === 'down') return `*Synth DOWN · ${surface}*`;
  if (severity === 'failed_index') return `*Synth failed index · ${surface}*`;
  return `*Synth bug · ${surface}*`;
}

export function formatClientIssue(input: {
  surface: ClientSurface;
  severity: ClientSeverity;
  message: string;
  stack: string;
  context: string;
  url: string;
  platform: string;
  appVersion: string;
  userId: string | null;
}): string {
  const lines = [titleFor(input.severity, input.surface)];
  if (input.userId) lines.push(`*User:* \`${input.userId}\``);
  else lines.push('*User:* signed out');
  if (input.context) lines.push(`*Where:* ${escapeSlack(input.context)}`);
  if (input.url) lines.push(`*URL:* ${escapeSlack(input.url)}`);
  if (input.platform) lines.push(`*Platform:* ${escapeSlack(input.platform)}`);
  if (input.appVersion) lines.push(`*Version:* ${escapeSlack(input.appVersion)}`);
  lines.push(`*Error:* ${escapeSlack(input.message)}`);
  if (input.stack) {
    const stack = input.stack.split('\n').slice(0, 8).join('\n');
    lines.push(`*Stack:*\n\`\`\`${stack.slice(0, 700)}\`\`\``);
  }
  return lines.join('\n');
}

/** SEO recap only. No alerts-webhook fallback, so this never lands in #alerts. */
export async function postAdminChannel(
  channel: string,
  text: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const posted = await postBotMessage(channel, text);
  if (posted) return posted;
  return { ok: false, error: 'SLACK_ADMIN_BOT_TOKEN is not set' };
}

export async function postAdminAlert(
  text: string,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const posted = await postBotMessage(alertsChannel(), text);
  if (posted?.ok) return posted;

  const webhook =
    process.env.SLACK_ALERTS_WEBHOOK_URL?.trim() || process.env.SLACK_OPS_WEBHOOK_URL?.trim();
  if (!webhook) return { ok: false, error: 'Admin bot and alerts webhook are not configured' };

  const slackRes = await fetch(webhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  if (!slackRes.ok) {
    const errText = await slackRes.text().catch(() => '');
    return { ok: false, error: errText.slice(0, 200), status: slackRes.status };
  }
  return { ok: true };
}

export async function recordClientIssue(
  raw: ClientIssueInput,
): Promise<{ posted: boolean; skipped?: string }> {
  const surface: ClientSurface =
    raw.surface === 'app' || raw.surface === 'admin' ? raw.surface : 'web';
  const severity: ClientSeverity =
    raw.severity === 'down' || raw.severity === 'failed_index' ? raw.severity : 'bug';
  const message = clip(raw.message, 500);
  if (message.length < 3) return { posted: false, skipped: 'empty' };
  if (isNoise(message)) return { posted: false, skipped: 'noise' };

  const url = clip(raw.url, 300);
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(url)) {
    return { posted: false, skipped: 'local' };
  }

  const context = clip(raw.context, 300);
  const stack = clip(raw.stack, 1200);
  const platform = clip(raw.platform, 40);
  const appVersion = clip(raw.appVersion, 40);
  const userId = clip(raw.userId, 80) || null;
  const fingerprint = fingerprintOf(surface, severity, message, context);
  const supabase = service();
  const since = new Date(Date.now() - DEDUPE_MS).toISOString();

  if (supabase) {
    const { data: existing } = await supabase
      .from('client_error_log')
      .select('id')
      .gte('created_at', since)
      .filter('error_details->>fingerprint', 'eq', fingerprint)
      .limit(1);
    if (existing && existing.length > 0) return { posted: false, skipped: 'duplicate' };

    if (severity === 'bug') {
      const { count } = await supabase
        .from('client_error_log')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - RATE_WINDOW_MS).toISOString());
      if ((count ?? 0) >= RATE_CAP) {
        await supabase.from('client_error_log').insert({
          user_id: userId,
          context: `${surface}:${severity}`,
          error_message: message,
          error_details: { fingerprint, url, context, stack, dropped: 'rate_cap' },
          platform: platform || null,
          app_version: appVersion || null,
        });
        return { posted: false, skipped: 'rate_limited' };
      }
    }

    const { error } = await supabase.from('client_error_log').insert({
      user_id: userId,
      context: `${surface}:${severity}`,
      error_message: message,
      error_details: { fingerprint, url, context, stack },
      platform: platform || null,
      app_version: appVersion || null,
    });
    if (error) console.warn('[admin-alerts] log insert failed', error.message);
  }

  const posted = await postAdminAlert(
    formatClientIssue({
      surface,
      severity,
      message,
      stack,
      context,
      url,
      platform,
      appVersion,
      userId,
    }),
  );
  if (posted.ok === false) {
    console.error('[admin-alerts] slack failed', posted.error);
    return { posted: false, skipped: 'slack_failed' };
  }
  return { posted: true };
}

const UPTIME_TARGETS = ['https://join.getsynth.app/', 'https://getsynth.app/'];

export async function probeUptime(): Promise<{ down: string[] }> {
  const down: string[] = [];
  for (const target of UPTIME_TARGETS) {
    let status = 0;
    let detail = '';
    try {
      const res = await fetch(target, { method: 'GET', redirect: 'follow', signal: AbortSignal.timeout(8000) });
      status = res.status;
      if (res.ok) continue;
      detail = `HTTP ${status}`;
    } catch (err) {
      detail = err instanceof Error ? err.message : 'request failed';
    }
    down.push(target);
    await recordClientIssue({
      surface: 'web',
      severity: 'down',
      message: `${target} is down (${detail || status})`,
      context: target,
      url: target,
      platform: 'uptime',
    });
  }
  return { down };
}

export function isCronAuthorized(authorization: string | undefined): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  const header = authorization ?? '';
  const expected = `Bearer ${secret || ''}`;
  if (!secret || header.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(header), Buffer.from(expected));
}
