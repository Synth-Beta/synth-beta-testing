/**
 * Push Notification Webhook
 * Triggered by Supabase Database Webhook when a row is inserted into notifications.
 * Sends push notifications to APNs - no worker required.
 *
 * Configure in Supabase Dashboard: Database > Webhooks
 * - Table: notifications
 * - Events: INSERT
 * - URL: https://YOUR_VERCEL_URL/api/push-notification-webhook
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

interface WebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: {
    id: string;
    user_id: string;
    title: string;
    message: string;
    data?: Record<string, unknown>;
    is_read?: boolean;
  };
  old_record: unknown;
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

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('[push-webhook] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

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

  // Fetch active iOS device tokens
  const { data: devices, error: devicesError } = await supabase
    .from('device_tokens')
    .select('device_token')
    .eq('user_id', record.user_id)
    .eq('platform', 'ios')
    .eq('is_active', true);

  if (devicesError) {
    const reason = 'error fetching device tokens';
    console.error('[push-webhook] skipped:', reason, devicesError);
    return res.status(200).json({ ok: true, skipped: reason, sent: 0 });
  }

  if (!devices?.length) {
    const reason = 'no active iOS device tokens';
    console.log(`[push-webhook] skipped: ${reason}`, { user_id: record.user_id });
    return res.status(200).json({
      ok: true,
      skipped: reason,
      sent: 0,
    });
  }

  const apnResult = await getApnProvider();
  if (!apnResult) {
    console.error('[push-webhook] APNs not configured (APNS_KEY_CONTENT/APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID)');
    return res.status(500).json({ error: 'APNs not configured' });
  }
  const { provider, Notification } = apnResult;

  const bundleId = (process.env.APNS_BUNDLE_ID ?? '').trim() || 'com.tejpatel.synth';
  const apnNotification = new Notification();
  apnNotification.alert = { title: record.title, body: record.message };
  apnNotification.badge = 1;
  apnNotification.sound = 'default';
  apnNotification.topic = bundleId;
  apnNotification.payload = record.data || {};
  apnNotification.expiry = Math.floor(Date.now() / 1000) + 3600;
  apnNotification.priority = 10;

  let sent = 0;
  const errors: string[] = [];
  for (const { device_token } of devices) {
    try {
      const result = await provider.send(apnNotification, device_token);
      if (result.sent?.length) sent++;
      if (result.failed?.length) {
        const err = result.failed[0];
        errors.push(`${err.response?.reason || err.error || 'unknown'}`);
      }
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  provider.shutdown();

  if (sent > 0) {
    console.log(`[push-webhook] sent ${sent}/${devices.length}`, {
      user_id: record.user_id,
      notification_id: record.id,
      errors: errors.length ? errors : undefined,
    });
  } else if (errors.length > 0) {
    console.error('[push-webhook] send failed', {
      user_id: record.user_id,
      notification_id: record.id,
      errors,
    });
  }

  return res.status(200).json({
    ok: true,
    sent,
    total: devices.length,
    errors: errors.length ? errors : undefined,
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    console.error('[push-webhook] Unhandled error:', message, stack);
    return res.status(500).json({
      error: 'Function invocation failed',
      message,
      hint: 'Check Vercel logs for full stack trace',
    });
  }
}
