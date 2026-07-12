/**
 * Push Notification Webhook
 * Triggered by Supabase Database Webhook when a row is inserted into notifications.
 * Sends push via Expo Push API (ExponentPushToken) or raw APNs tokens.
 *
 * Setup: npm run push:setup-webhook
 * Test:  npm run push:test-webhook (after Vercel env + redeploy)
 *
 * Vercel env (Production):
 *   PUSH_WEBHOOK_SECRET, EXPO_ACCESS_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Supabase Dashboard → Database → Webhooks:
 *   Table notifications, INSERT → POST https://join.getsynth.app/api/push-notification-webhook
 *   Header x-webhook-secret = same PUSH_WEBHOOK_SECRET as Vercel
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { timingSafeEqual } from 'crypto';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Constant-time comparison so response timing can't leak secret prefixes
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

function getPushWebhookSecret(): string | null {
  return process.env.PUSH_WEBHOOK_SECRET?.trim() || null;
}

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: {
    id: string;
    user_id: string;
    type?: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    is_read?: boolean;
  };
  old_record: unknown;
}

function isExpoPushToken(deviceToken: unknown): deviceToken is string {
  if (typeof deviceToken !== 'string') return false;
  const t = deviceToken.trim();
  return (
    t.startsWith('ExponentPushToken[') ||
    t.startsWith('ExpoPushToken[') ||
    t.startsWith('ExponentPushToken') ||
    t.startsWith('ExpoPushToken')
  );
}

async function sendExpoPushNotification(params: {
  expoPushToken: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}): Promise<{ ok: true } | { ok: false; error: string; deactivate?: boolean }> {
  const accessToken = process.env.EXPO_ACCESS_TOKEN?.trim();

  const isPermanentExpoError = (message: string): boolean => {
    const m = message.toLowerCase();
    return (
      m.includes('devicenotregistered') ||
      m.includes('invalidcredentials') ||
      m.includes('messagetoobig')
    );
  };

  try {
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Accept-Encoding': 'gzip, deflate',
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify({
        to: params.expoPushToken,
        title: params.title,
        body: params.body,
        data: params.data ?? {},
        sound: 'default',
        priority: 'high',
        badge: 1,
        channelId: 'default',
      }),
    });

    const json = (await res.json().catch(() => ({}))) as any;
    if (!res.ok) {
      const message = json?.errors?.[0]?.message || res.statusText;
      return { ok: false, error: message, deactivate: isPermanentExpoError(message) };
    }

    // Expo may return `data` as an object or array of tickets depending on batching.
    const ticket = json?.data;
    const status = Array.isArray(ticket) ? ticket[0]?.status : ticket?.status;
    if (status === 'error') {
      const message = Array.isArray(ticket) ? ticket[0]?.message : ticket?.message;
      const errText = message || 'Expo push error';
      return { ok: false, error: errText, deactivate: isPermanentExpoError(errText) };
    }

    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: message };
  }
}

async function deactivateDeviceToken(
  supabase: SupabaseClient,
  deviceToken: string,
): Promise<void> {
  const { error } = await supabase
    .from('device_tokens')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('device_token', deviceToken);
  if (error) {
    console.warn('[push-webhook] failed to deactivate token:', error.message);
  }
}

function isPermanentApnsFailure(reason: string | undefined, status: string | number | undefined): boolean {
  const r = (reason ?? '').toLowerCase();
  return (
    status === '410' ||
    status === 410 ||
    r === 'baddevicetoken' ||
    r === 'unregistered' ||
    r === 'devicetokennotfortopic'
  );
}

async function getApnProvider(): Promise<{ provider: InstanceType<typeof import('apn').Provider>; Notification: typeof import('apn').Notification } | null> {
  let apnModule: typeof import('apn');
  try {
    apnModule = await import('apn');
  } catch (e) {
    console.error('[push-webhook] Failed to load apn module:', e);
    return null;
  }
  const { Provider, Notification } = apnModule;
  // Read and normalize env vars (trim whitespace from copy-paste)
  const keyContent = process.env.APNS_KEY_CONTENT?.trim().replace(/\s/g, '');
  const keyPath = process.env.APNS_KEY_PATH?.trim();
  const keyId = process.env.APNS_KEY_ID?.trim();
  const teamId = process.env.APNS_TEAM_ID?.trim();

  let keyBuffer: Buffer | null = null;
  if (keyContent) {
    try {
      keyBuffer = Buffer.from(keyContent, 'base64');
      if (!keyBuffer.length) throw new Error('Decoded key is empty');
    } catch (e) {
      console.error('[push-webhook] APNS_KEY_CONTENT decode failed:', e instanceof Error ? e.message : e);
      return null;
    }
  } else if (keyPath) {
    try {
      const fs = require('fs');
      if (fs.existsSync(keyPath)) {
        keyBuffer = fs.readFileSync(keyPath);
      }
    } catch {
      return null;
    }
  }

  if (!keyBuffer) {
    console.error('[push-webhook] APNS key missing: set APNS_KEY_CONTENT (base64) or APNS_KEY_PATH');
    return null;
  }
  if (!keyId) {
    console.error('[push-webhook] APNS_KEY_ID not set');
    return null;
  }
  if (!teamId) {
    console.error('[push-webhook] APNS_TEAM_ID not set');
    return null;
  }

  const prodEnv = (process.env.APNS_PRODUCTION ?? '').toString().trim().toLowerCase();
  const production =
    prodEnv !== '' ? prodEnv === 'true' || prodEnv === '1' : process.env.NODE_ENV === 'production';

  const provider = new Provider({
    token: { key: keyBuffer, keyId, teamId },
    production,
  });
  return { provider, Notification };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const webhookSecret = getPushWebhookSecret();
  if (!webhookSecret) {
    console.error('[push-webhook] PUSH_WEBHOOK_SECRET not configured on Vercel');
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
    console.warn('[push-webhook] Unauthorized webhook attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const payload = req.body as WebhookPayload;
  if (!payload || payload.type !== 'INSERT' || payload.table !== 'notifications') {
    const reason = 'not an INSERT on notifications';
    console.log(`[push-webhook] skipped: ${reason}`);
    return res.status(200).json({ ok: true, skipped: reason });
  }

  const record = payload.record;
  if (!record?.user_id || !record?.title || !record?.message) {
    const reason = 'missing required fields';
    console.log(`[push-webhook] skipped: ${reason}`, { user_id: record?.user_id });
    return res.status(200).json({ ok: true, skipped: reason });
  }

  if (record.is_read === true) {
    const reason = 'notification already read';
    console.log(`[push-webhook] skipped: ${reason}`, { notification_id: record?.id });
    return res.status(200).json({ ok: true, skipped: reason });
  }

  // Skip friend_accepted - no push for this type
  if (record.type === 'friend_accepted') {
    const reason = 'friend_accepted (push disabled)';
    console.log(`[push-webhook] skipped: ${reason}`, { user_id: record.user_id });
    return res.status(200).json({ ok: true, skipped: reason });
  }

  const supabaseConfig = getSupabaseServerConfig();
  if (!supabaseConfig) {
    console.error(
      '[push-webhook] Missing Supabase server config (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)',
    );
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey);

  // Check user push preference
  const { data: prefs } = await supabase
    .from('user_settings_preferences')
    .select('enable_push_notifications')
    .eq('user_id', record.user_id)
    .single();

  if (prefs?.enable_push_notifications === false) {
    const reason = 'push disabled by user';
    console.log(`[push-webhook] skipped: ${reason}`, { user_id: record.user_id });
    return res.status(200).json({ ok: true, skipped: reason });
  }

  // Fetch active device tokens (Expo tokens can represent iOS or Android).
  const { data: devices, error: devicesError } = await supabase
    .from('device_tokens')
    .select('device_token, platform')
    .eq('user_id', record.user_id)
    .eq('is_active', true)
    .in('platform', ['ios', 'android']);

  if (devicesError) {
    const reason = 'error fetching device tokens';
    console.error('[push-webhook] skipped:', reason, devicesError);
    return res.status(200).json({ ok: true, skipped: reason, sent: 0 });
  }

  if (!devices?.length) {
    const reason = 'no active device tokens';
    console.log(`[push-webhook] skipped: ${reason}`, { user_id: record.user_id });
    return res.status(200).json({
      ok: true,
      skipped: reason,
      sent: 0,
    });
  }

  const dataPayload = { ...(record.data || {}), type: record.type } as Record<string, unknown>;

  // Initialize APNs once before the loop (only if raw iOS tokens exist).
  const hasApnsDevices = devices.some(
    (d: { device_token: string; platform: string }) => !isExpoPushToken(d.device_token) && d.platform === 'ios'
  );
  let apnProvider: InstanceType<typeof import('apn').Provider> | null = null;
  let ApnNotification: typeof import('apn').Notification | null = null;
  if (hasApnsDevices) {
    const apnResult = await getApnProvider();
    if (apnResult) {
      apnProvider = apnResult.provider;
      ApnNotification = apnResult.Notification;
    }
  }

  let expoSent = 0;
  let apnsSent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const row of devices) {
    const deviceToken = typeof row.device_token === 'string' ? row.device_token.trim() : row.device_token;
    const platform = row.platform;

    if (isExpoPushToken(deviceToken)) {
      const expoRes = await sendExpoPushNotification({
        expoPushToken: deviceToken,
        title: record.title,
        body: record.message,
        data: dataPayload,
      });
      if (expoRes.ok) {
        expoSent++;
      } else {
        const failed = expoRes;
        errors.push(`expo:${failed.error}`);
        if (failed.deactivate) {
          await deactivateDeviceToken(supabase, deviceToken);
        }
      }
      continue;
    }

    // Non-Expo tokens: only iOS APNs is supported here.
    if (platform !== 'ios') {
      skipped++;
      errors.push('android:non-expo-token-unsupported');
      continue;
    }

    if (!apnProvider || !ApnNotification) {
      // Treat missing APNs credentials as "skipped" (nothing was attempted for this device).
      skipped++;
      errors.push('apns:not-configured');
      continue;
    }

    try {
      const bundleId = (process.env.APNS_BUNDLE_ID ?? '').trim() || 'com.tejpatel.synth';
      const apnNotification = new ApnNotification();
      apnNotification.alert = { title: record.title, body: record.message };
      apnNotification.badge = 1;
      apnNotification.sound = 'default';
      apnNotification.topic = bundleId;
      apnNotification.payload = dataPayload;
      apnNotification.expiry = Math.floor(Date.now() / 1000) + 3600;
      apnNotification.priority = 10;

      const result = await apnProvider.send(apnNotification, deviceToken);
      if (result.sent?.length) apnsSent++;
      if (result.failed?.length) {
        const err = result.failed[0];
        const reason = err.response?.reason || String(err.error || 'unknown');
        errors.push(`apns:${reason}`);
        if (isPermanentApnsFailure(err.response?.reason, err.status)) {
          await deactivateDeviceToken(supabase, deviceToken);
        }
      }
    } catch (err) {
      errors.push(`apns:${err instanceof Error ? err.message : String(err)}`);
    }
  }

  if (apnProvider) {
    apnProvider.shutdown();
  }

  const total = devices.length;
  const sent = expoSent + apnsSent;

  if (sent > 0) {
    console.log(`[push-webhook] sent ${sent}/${total}`, {
      user_id: record.user_id,
      notification_id: record.id,
      expoSent,
      apnsSent,
      skipped,
      errors: errors.length ? errors.slice(0, 10) : undefined,
    });
  } else if (errors.length > 0) {
    console.error('[push-webhook] send failed', {
      user_id: record.user_id,
      notification_id: record.id,
      expoSent,
      apnsSent,
      skipped,
      errors: errors.slice(0, 10),
    });
  }

  return res.status(200).json({
    ok: true,
    sent,
    total,
    expoSent,
    apnsSent,
    skipped,
    errors: errors.length ? errors.slice(0, 10) : undefined,
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[push-webhook] Unhandled error:', message, stack);
    // Security: Do not expose internal error details to webhook callers.
    return res.status(500).json({
      error: 'Something went wrong',
    });
  }
}
