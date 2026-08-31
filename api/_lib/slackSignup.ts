import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const SLACK_SIGNUP_ALERT_META_KEY = 'slack_signup_alerted_at';
export const SLACK_SIGNUP_LOOKBACK_DAYS = 7;

export interface UsersSignupRecord {
  id?: string;
  user_id?: string;
  name?: string | null;
  username?: string | null;
  email?: string | null;
  contact_email?: string | null;
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
  permissions_metadata?: Record<string, unknown> | null;
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

export function getSlackSignupWebhookUrl(): string | null {
  return process.env.SLACK_SIGNUP_WEBHOOK_URL?.trim() || null;
}

export function getSlackSignupWebhookSecret(): string | null {
  return process.env.SLACK_SIGNUP_WEBHOOK_SECRET?.trim() || null;
}

export function getSupabaseService(): SupabaseClient | null {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function selectSignupFields(
  raw: Record<string, unknown> | UsersSignupRecord | null | undefined,
): UsersSignupRecord {
  const r = (raw || {}) as Record<string, unknown>;
  const meta =
    r.permissions_metadata && typeof r.permissions_metadata === 'object'
      ? (r.permissions_metadata as Record<string, unknown>)
      : null;
  return {
    id: asTrimmedString(r.id) ?? undefined,
    user_id: asTrimmedString(r.user_id) ?? undefined,
    name: asTrimmedString(r.name),
    username: asTrimmedString(r.username),
    email: asTrimmedString(r.email),
    contact_email: asTrimmedString(r.contact_email),
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
    permissions_metadata: meta,
  };
}

function escapeSlackMrkdwn(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function formatLocation(city: string | null | undefined, state: string | null | undefined): string | null {
  if (city && state) return `${city}, ${state}`;
  return city || state || null;
}

export function formatSignupMessage(record: UsersSignupRecord): string {
  const title = record.is_bot ? '*New Synth signup (bot)*' : '*New Synth signup*';
  const lines: string[] = [title];

  if (record.name) lines.push(`Name: ${escapeSlackMrkdwn(record.name)}`);
  if (record.username) lines.push(`Username: \`${escapeSlackMrkdwn(record.username)}\``);
  if (record.email) lines.push(`Email: ${escapeSlackMrkdwn(record.email)}`);
  // Apple Hide-My-Email users sign in with a relay address, so `email` alone is not
  // reachable. The real address they typed lives in contact_email and stays separate
  // from the auth identity - surface both rather than picking one.
  if (record.contact_email) {
    lines.push(`Contact email: ${escapeSlackMrkdwn(record.contact_email)}`);
  }

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

export function alreadyAlerted(record: UsersSignupRecord): boolean {
  const stamped = record.permissions_metadata?.[SLACK_SIGNUP_ALERT_META_KEY];
  return typeof stamped === 'string' && stamped.length > 0;
}

export async function markSignupAlerted(record: UsersSignupRecord): Promise<void> {
  const supabase = getSupabaseService();
  const userId = record.user_id || record.id;
  if (!supabase || !userId) return;

  const meta = { ...(record.permissions_metadata || {}) };
  meta[SLACK_SIGNUP_ALERT_META_KEY] = new Date().toISOString();
  const { error } = await supabase
    .from('users')
    .update({ permissions_metadata: meta })
    .eq('user_id', userId);
  if (error) {
    console.warn('[slack-signup] failed to stamp alert flag', error.message);
  }
}

export async function postSignupToSlack(
  record: UsersSignupRecord,
): Promise<{ ok: true } | { ok: false; error: string; status?: number }> {
  const slackUrl = getSlackSignupWebhookUrl();
  if (!slackUrl) return { ok: false, error: 'Slack webhook URL not configured' };

  const slackRes = await fetch(slackUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: formatSignupMessage(record) }),
  });

  if (!slackRes.ok) {
    const body = await slackRes.text().catch(() => '');
    return { ok: false, error: body.slice(0, 500), status: slackRes.status };
  }
  return { ok: true };
}

export async function alertSignupIfNeeded(
  raw: Record<string, unknown> | UsersSignupRecord,
): Promise<{ posted: boolean; skipped?: string }> {
  const record = selectSignupFields(raw);
  if (alreadyAlerted(record)) return { posted: false, skipped: 'already_alerted' };

  const result = await postSignupToSlack(record);
  if (result.ok === false) {
    console.error('[slack-signup] Slack post failed', result.status, result.error);
    return { posted: false, skipped: 'slack_failed' };
  }

  await markSignupAlerted(record);
  console.log('[slack-signup] posted', {
    user_id: record.user_id || record.id,
    username: record.username,
    is_bot: record.is_bot === true,
  });
  return { posted: true };
}

const SIGNUP_SELECT =
  'user_id,name,username,email,contact_email,account_type,account_status,acquisition_source,other_acquisition_source,referral_code,location_city,location_state,music_streaming_service,onboarding_completed,waitlist_signup_at,is_bot,created_at,permissions_metadata';

export async function loadUserSignupRecord(userId: string): Promise<UsersSignupRecord | null> {
  const supabase = getSupabaseService();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('users')
    .select(SIGNUP_SELECT)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) {
    console.error('[slack-signup] load user failed', error.message);
    return null;
  }
  return data ? selectSignupFields(data as Record<string, unknown>) : null;
}

export async function catchUpMissedSignups(): Promise<{ posted: number; skipped: number }> {
  const supabase = getSupabaseService();
  if (!supabase) return { posted: 0, skipped: 0 };

  const since = new Date(Date.now() - SLACK_SIGNUP_LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('users')
    .select(SIGNUP_SELECT)
    .gte('created_at', since)
    .or('is_bot.is.null,is_bot.eq.false')
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) {
    console.error('[slack-signup] catch-up query failed', error.message);
    return { posted: 0, skipped: 0 };
  }

  let posted = 0;
  let skipped = 0;
  for (const row of data || []) {
    const result = await alertSignupIfNeeded(row as Record<string, unknown>);
    if (result.posted) posted += 1;
    else skipped += 1;
  }
  return { posted, skipped };
}

export function parseJsonBody(body: unknown): Record<string, unknown> | null {
  let raw: unknown = body;
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (obj.payload && typeof obj.payload === 'object') {
    return parseJsonBody(obj.payload);
  }
  return obj;
}

export function extractInsertRecord(body: unknown): Record<string, unknown> | null {
  const obj = parseJsonBody(body);
  if (!obj) return null;

  const type = typeof obj.type === 'string' ? obj.type.toUpperCase() : null;
  const table = typeof obj.table === 'string' ? obj.table.toLowerCase() : null;
  const record = obj.record && typeof obj.record === 'object' ? (obj.record as Record<string, unknown>) : null;

  if (record && (!type || type === 'INSERT') && (!table || table === 'users')) {
    return record;
  }
  if (!type && (obj.user_id || obj.id) && (obj.username || obj.email || obj.name || obj.created_at)) {
    return obj;
  }
  return null;
}
