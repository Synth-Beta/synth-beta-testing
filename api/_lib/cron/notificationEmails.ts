/**
 * Vercel Cron: emails important unread notifications to users with no active push token.
 *
 * Most signups are on web, which can't receive push, so week-1 nudges and "your artist
 * announced a show" never reached them. One digest email per user per run.
 * notifications.email_sent_at is claimed BEFORE sending, so a crash or a rerun can skip
 * an email but never send one twice.
 *
 * Skips anyone in newsletter_unsubscribes: the footer link is the same HMAC unsubscribe
 * the newsletter uses, so one unsubscribe stops both.
 *
 * Required env vars: CRON_SECRET, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * BREVO_API_KEY, NEWSLETTER_UNSUBSCRIBE_SECRET.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { DeliveryRejectedError, sendBrevoNewsletter } from '../brevoNewsletter.js';
import {
  EMAIL_LOOKBACK_HOURS,
  EMAIL_NOTIFICATION_TYPES,
  buildNotificationEmail,
  groupEmailRecipients,
} from '../notificationEmail.js';

const APP_URL = 'https://getsynth.app';
const APP_STORE_URL = 'https://apps.apple.com/us/app/synth-for-live-music-lovers/id6757408095';

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const chunks = <T,>(xs: T[], n = 200) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'Cron not configured' });
  if (!secureEquals((req.headers.authorization as string) ?? '', `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const brevoKey = process.env.BREVO_API_KEY;
  const unsubscribeSecret = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET;
  if (!supabaseUrl || !serviceKey || !brevoKey || !unsubscribeSecret) {
    return res.status(500).json({ ok: false, error: 'Notification emails are not configured.' });
  }
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

  try {
    const since = new Date(Date.now() - EMAIL_LOOKBACK_HOURS * 3600_000).toISOString();
    const { data: notifs, error: nErr } = await db
      .from('notifications')
      .select('id, user_id, title, message')
      .in('type', [...EMAIL_NOTIFICATION_TYPES])
      .eq('is_read', false)
      .is('email_sent_at', null)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(2000);
    if (nErr) throw new Error(nErr.message);
    const userIds = [...new Set((notifs ?? []).map((n) => n.user_id as string))];
    if (!userIds.length) return res.status(200).json({ ok: true, sent: 0 });

    const users: any[] = [];
    const tokenUsers = new Set<string>();
    for (const ids of chunks(userIds)) {
      const [u, t] = await Promise.all([
        db.from('users').select('user_id, email, is_bot').in('user_id', ids).eq('account_status', 'active'),
        db.from('device_tokens').select('user_id').in('user_id', ids).eq('is_active', true),
      ]);
      if (u.error) throw new Error(u.error.message);
      if (t.error) throw new Error(t.error.message);
      users.push(...(u.data ?? []));
      (t.data ?? []).forEach((r) => tokenUsers.add(r.user_id));
    }
    const { data: unsubs, error: uErr } = await db.from('newsletter_unsubscribes').select('email');
    if (uErr) throw new Error(uErr.message);
    const unsubscribed = new Set((unsubs ?? []).map((r) => String(r.email).trim().toLowerCase()));

    const recipients = groupEmailRecipients(notifs ?? [], users, tokenUsers, unsubscribed);
    let sent = 0;
    let failed = 0;
    for (const r of recipients) {
      // Claim first: at most once, even if two runs overlap.
      const { data: claimed, error: cErr } = await db
        .from('notifications')
        .update({ email_sent_at: new Date().toISOString() })
        .in('id', r.notifications.map((n) => n.id))
        .is('email_sent_at', null)
        .select('id');
      if (cErr) throw new Error(cErr.message);
      const claimedIds = new Set((claimed ?? []).map((c) => c.id));
      const items = r.notifications.filter((n) => claimedIds.has(n.id));
      if (!items.length) continue;

      const token = createHmac('sha256', unsubscribeSecret).update(r.email).digest('hex');
      const unsubscribeUrl = `${supabaseUrl}/functions/v1/newsletter-unsubscribe?email=${encodeURIComponent(r.email)}&token=${encodeURIComponent(token)}&slug=notifications&next=${encodeURIComponent(APP_URL)}`;
      const { subject, html } = buildNotificationEmail({ items, appUrl: APP_URL, appStoreUrl: APP_STORE_URL, unsubscribeUrl });
      try {
        await sendBrevoNewsletter(brevoKey, {
          to: r.email,
          subject,
          html,
          unsubscribeUrl,
          deliveryKey: `notif:${items[0].id}`,
          senderName: 'Synth',
          tag: 'synth-notifications',
        });
        sent++;
      } catch (e) {
        failed++;
        console.warn('[cron/notification-emails] send failed:', e instanceof Error ? e.message : e);
        if (e instanceof DeliveryRejectedError && e.stopBatch) break;
      }
    }
    return res.status(200).json({ ok: true, recipients: recipients.length, sent, failed });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[cron/notification-emails] failed:', message);
    return res.status(500).json({ ok: false, error: message });
  }
}
