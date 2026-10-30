import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import { createClient } from '@supabase/supabase-js';

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

function getSupabaseServerConfig(): { url: string; serviceRoleKey: string } | null {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey };
}

function getBrevoWebhookSecret(): string | null {
  return process.env.BREVO_WEBHOOK_SECRET?.trim() || null;
}

function normalizeEventType(raw: unknown): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const key = raw.trim();
  const map: Record<string, string> = {
    sent: 'sent',
    request: 'request',
    delivered: 'delivered',
    opened: 'opened',
    uniqueOpened: 'unique_opened',
    unique_opened: 'unique_opened',
    click: 'click',
    clicked: 'click',
    softBounce: 'soft_bounce',
    soft_bounce: 'soft_bounce',
    hardBounce: 'hard_bounce',
    hard_bounce: 'hard_bounce',
    blocked: 'blocked',
    spam: 'spam',
    invalid: 'invalid',
    deferred: 'deferred',
    unsubscribed: 'unsubscribed',
    error: 'error',
  };
  return map[key] ?? key.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

function asString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) return value.trim();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
}

function asTags(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((t) => (typeof t === 'string' ? t.trim() : ''))
    .filter(Boolean);
}

function eventAtFromPayload(payload: Record<string, unknown>): string {
  const epochMs = payload.ts_epoch;
  if (typeof epochMs === 'number' && Number.isFinite(epochMs) && epochMs > 0) {
    return new Date(epochMs).toISOString();
  }
  const tsEvent = payload.ts_event ?? payload.ts;
  if (typeof tsEvent === 'number' && Number.isFinite(tsEvent) && tsEvent > 0) {
    const ms = tsEvent > 1e12 ? tsEvent : tsEvent * 1000;
    return new Date(ms).toISOString();
  }
  return new Date().toISOString();
}

type NormalizedEvent = {
  event_type: string;
  email: string | null;
  brevo_message_id: string | null;
  event_at: string;
  subject: string | null;
  tags: string[];
  link: string | null;
  reason: string | null;
  custom_delivery_key: string | null;
  raw: Record<string, unknown>;
};

function normalizeEvent(payload: Record<string, unknown>): NormalizedEvent | null {
  const eventType = normalizeEventType(payload.event);
  if (!eventType) return null;

  const messageId =
    asString(payload['message-id']) ||
    asString(payload.messageId) ||
    asString(payload.message_id);

  const custom =
    asString(payload['X-Mailin-custom']) ||
    asString(payload['x-mailin-custom']) ||
    asString(payload.X_Mailin_custom);

  return {
    event_type: eventType,
    email: asString(payload.email)?.toLowerCase() ?? null,
    brevo_message_id: messageId,
    event_at: eventAtFromPayload(payload),
    subject: asString(payload.subject),
    tags: asTags(payload.tags),
    link: asString(payload.link),
    reason: asString(payload.reason),
    custom_delivery_key: custom,
    raw: payload,
  };
}

function extractPayloads(body: unknown): Record<string, unknown>[] {
  if (Array.isArray(body)) {
    return body.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
  }
  if (!body || typeof body !== 'object') return [];

  const obj = body as Record<string, unknown>;
  for (const key of ['events', 'items', 'data']) {
    const nested = obj[key];
    if (Array.isArray(nested)) {
      return nested.filter((item): item is Record<string, unknown> => !!item && typeof item === 'object');
    }
  }
  if (typeof obj.event === 'string') return [obj];
  return [];
}

export function isBrevoWebhookRequest(req: VercelRequest): boolean {
  const url = `${req.url ?? ''}`;
  if (url.includes('/api/brevo-webhook')) return true;

  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  const obj = body as Record<string, unknown>;
  if (obj.type === 'INSERT' || obj.table || obj.record) return false;
  return typeof obj.event === 'string';
}

export async function handleBrevoWebhook(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const webhookSecret = getBrevoWebhookSecret();
  if (!webhookSecret) {
    console.error('[brevo-webhook] BREVO_WEBHOOK_SECRET not configured');
    res.status(500).json({ error: 'Webhook not configured' });
    return;
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
    console.warn('[brevo-webhook] Unauthorized webhook attempt');
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const supabaseConfig = getSupabaseServerConfig();
  if (!supabaseConfig) {
    console.error('[brevo-webhook] Missing Supabase server config');
    res.status(500).json({ error: 'Server configuration error' });
    return;
  }

  const payloads = extractPayloads(req.body);
  if (payloads.length === 0) {
    res.status(200).json({ ok: true, inserted: 0, skipped: 'no events in body' });
    return;
  }

  const rows = payloads
    .map(normalizeEvent)
    .filter((row): row is NormalizedEvent => row !== null)
    .map((row) => {
      const link = row.link ?? '';
      const email = row.email ?? '';
      const messageId = row.brevo_message_id ?? '';
      return {
        event_type: row.event_type,
        email: row.email,
        brevo_message_id: row.brevo_message_id,
        event_at: row.event_at,
        subject: row.subject,
        tags: row.tags,
        link: link || null,
        reason: row.reason,
        custom_delivery_key: row.custom_delivery_key,
        raw: row.raw,
        idempotency_key: [messageId, row.event_type, row.event_at, email, link].join('|'),
      };
    });

  if (rows.length === 0) {
    res.status(200).json({ ok: true, inserted: 0, skipped: 'no recognizable events' });
    return;
  }

  const supabase = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey);
  const { error, count } = await supabase
    .from('brevo_email_events')
    .upsert(rows, {
      onConflict: 'idempotency_key',
      ignoreDuplicates: true,
      count: 'exact',
    });

  if (error) {
    console.error('[brevo-webhook] insert failed:', error.message);
    res.status(500).json({ error: 'Failed to store events' });
    return;
  }

  res.status(200).json({ ok: true, received: rows.length, inserted: count ?? rows.length });
}
