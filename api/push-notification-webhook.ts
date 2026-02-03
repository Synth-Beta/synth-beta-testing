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

// eslint-disable-next-line @typescript-eslint/no-var-requires
const apn = require('apn');

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

function getApnProvider(): apn.Provider | null {
  const keyContent = process.env.APNS_KEY_CONTENT;
  const keyPath = process.env.APNS_KEY_PATH;
  const keyId = process.env.APNS_KEY_ID;
  const teamId = process.env.APNS_TEAM_ID;

  let keyBuffer: Buffer | null = null;
  if (keyContent) {
    try {
      keyBuffer = Buffer.from(keyContent, 'base64');
    } catch {
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

  if (!keyBuffer || !keyId || !teamId) return null;

  const production =
    process.env.APNS_PRODUCTION !== undefined
      ? process.env.APNS_PRODUCTION === 'true' || process.env.APNS_PRODUCTION === '1'
      : process.env.NODE_ENV === 'production';

  return new apn.Provider({
    token: { key: keyBuffer, keyId, teamId },
    production,
  });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const payload = req.body as WebhookPayload;
  if (!payload || payload.type !== 'INSERT' || payload.table !== 'notifications') {
    return res.status(200).json({ ok: true, skipped: 'not an INSERT on notifications' });
  }

  const record = payload.record;
  if (!record?.user_id || !record?.title || !record?.message) {
    return res.status(200).json({ ok: true, skipped: 'missing required fields' });
  }

  if (record.is_read === true) {
    return res.status(200).json({ ok: true, skipped: 'notification already read' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Push webhook: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set');
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
    return res.status(200).json({ ok: true, skipped: 'push disabled by user' });
  }

  // Fetch active iOS device tokens
  const { data: devices, error: devicesError } = await supabase
    .from('device_tokens')
    .select('device_token')
    .eq('user_id', record.user_id)
    .eq('platform', 'ios')
    .eq('is_active', true);

  if (devicesError || !devices?.length) {
    return res.status(200).json({
      ok: true,
      skipped: 'no active iOS device tokens',
      sent: 0,
    });
  }

  const provider = getApnProvider();
  if (!provider) {
    console.error('Push webhook: APNs not configured (APNS_KEY_CONTENT/APNS_KEY_PATH, APNS_KEY_ID, APNS_TEAM_ID)');
    return res.status(500).json({ error: 'APNs not configured' });
  }

  const bundleId = process.env.APNS_BUNDLE_ID || 'com.tejpatel.synth';
  const apnNotification = new apn.Notification();
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

  return res.status(200).json({
    ok: true,
    sent,
    total: devices.length,
    errors: errors.length ? errors : undefined,
  });
}
