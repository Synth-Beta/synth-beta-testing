/**
 * Sends the approved newsletter edition at 10:00 America/New_York on Mondays.
 *
 * Vercel cron expressions are UTC and do not follow Eastern daylight time, so the
 * job is scheduled at both 14:00 and 15:00 UTC on Mondays. This handler sends only
 * when the current America/New_York weekday is Monday and the hour is 10. It never
 * generates or approves drafts.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { sendBrevoNewsletter } from '../brevoNewsletter.js';
import {
  deliverApprovedDrafts,
  reconcileNewsletterDelivery,
  type StoredDraft,
  deliveryKey,
} from '../newsletterDelivery.js';
import {
  SEND_TIME_ZONE,
  editionCalendarDate,
  isNewsletterSendWindow,
} from '../newsletterSchedule.js';

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const readAll = async (makeQuery: () => any) => {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await makeQuery().range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
};

const injectUnsubscribeLink = (html: string, unsubscribeUrl: string) => {
  if (/>\s*Unsubscribe\s*</i.test(html)) {
    return html.replace(
      /href="[^"]*"\s*style="color:#8A8F98;text-decoration:underline;">Unsubscribe<\/a>/i,
      `href="${unsubscribeUrl}" style="color:#8A8F98;text-decoration:underline;">Unsubscribe</a>`
    );
  }
  return html;
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) return res.status(500).json({ error: 'Cron not configured' });
  const authHeader = (req.headers.authorization as string) ?? '';
  if (!secureEquals(authHeader, `Bearer ${cronSecret}`)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const now = new Date();
  if (!isNewsletterSendWindow(now)) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: 'Newsletter send runs at 10:00 America/New_York on Mondays.',
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const brevoKey = process.env.BREVO_API_KEY;
  const unsubscribeSecret = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET;
  if (!supabaseUrl || !serviceKey || !brevoKey || !unsubscribeSecret) {
    return res.status(500).json({ ok: false, error: 'Newsletter send is not configured.' });
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const editionDate = editionCalendarDate(now);
  try {
    await reconcileNewsletterDelivery(db, editionDate);
    const rows = await readAll(() => db
      .from('newsletter_drafts')
      .select('id, edition_date, user_id, email, subject, html, content_hash, status, approved_content_hash, sent_at, brevo_message_id, delivery_state, send_claimed_at')
      .eq('edition_date', editionDate).order('id'));

    const unsubscribedRows = await readAll(() => db.from('newsletter_unsubscribes').select('email').order('email'));
    const eligibleRows = await readAll(() => db.from('users').select('user_id, email, newsletter_subscription').eq('account_status', 'active').eq('newsletter_subscription', 'subscribed').or('is_bot.is.false,is_bot.is.null').order('user_id'));
    const eligible = new Set(eligibleRows.map((row) => `${row.user_id}:${String(row.email).trim().toLowerCase()}`));
    const unsubscribed = new Set(
      (unsubscribedRows ?? []).map((row) => String(row.email).trim().toLowerCase())
    );
    const drafts: StoredDraft[] = (rows ?? []).filter((row) => eligible.has(`${row.user_id}:${String(row.email).trim().toLowerCase()}`)).map((row) => ({
      id: row.id,
      editionDate: row.edition_date,
      userId: row.user_id,
      email: row.email,
      subject: row.subject,
      html: row.html,
      contentHash: row.content_hash,
      status: row.status,
      approvedContentHash: row.approved_content_hash,
      sentAt: row.sent_at,
      brevoMessageId: row.brevo_message_id,
      deliveryState: row.delivery_state,
      sendClaimedAt: row.send_claimed_at,
    }));

    const result = await deliverApprovedDrafts({
      drafts,
      unsubscribedEmails: unsubscribed,
      claim: async (draft) => {
        const claimed = await db
          .from('newsletter_drafts')
          .update({ send_claimed_at: new Date().toISOString(), delivery_error: null })
          .eq('id', draft.id)
          .eq('status', 'approved')
          .eq('content_hash', draft.contentHash)
          .eq('approved_content_hash', draft.contentHash)
          .is('sent_at', null)
          .is('brevo_message_id', null)
          .is('send_claimed_at', null)
          .or('delivery_state.is.null,delivery_state.eq.failed')
          .select('id');
        if (claimed.error) throw new Error(claimed.error.message);
        return Boolean(claimed.data?.length);
      },
      sendEmail: async (draft) => {
        const email = draft.email.trim().toLowerCase();
        const token = createHmac('sha256', unsubscribeSecret).update(email).digest('hex');
        const unsubscribeUrl = `${supabaseUrl}/functions/v1/newsletter-unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}&slug=${encodeURIComponent(editionDate)}&next=${encodeURIComponent('https://getsynth.app')}`;
        return sendBrevoNewsletter(brevoKey, {
          to: email,
          subject: draft.subject,
          html: injectUnsubscribeLink(draft.html, unsubscribeUrl),
          unsubscribeUrl,
          deliveryKey: deliveryKey(draft),
        });
      },
      confirm: async (draft, messageId) => {
        const recorded = await db
          .from('newsletter_drafts')
          .update({ brevo_message_id: messageId, delivery_state: 'accepted', delivery_error: null })
          .eq('id', draft.id)
          .eq('status', 'approved')
          .is('sent_at', null)
          .select('id');
        if (recorded.error) throw new Error(recorded.error.message);
        if (!recorded.data?.length) return false;
        const marked = await db
          .from('newsletter_drafts')
          .update({ status: 'sent', sent_at: new Date().toISOString(), delivery_state: 'accepted' })
          .eq('id', draft.id)
          .eq('status', 'approved')
          .eq('brevo_message_id', messageId)
          .is('sent_at', null)
          .select('id');
        if (marked.error) throw new Error(marked.error.message);
        return Boolean(marked.data?.length);
      },
      release: async (draft, error) => {
        const released = await db
          .from('newsletter_drafts')
          .update({
            send_claimed_at: null,
            delivery_state: 'failed',
            delivery_error: (error ?? 'Brevo rejected the message.').slice(0, 500),
          })
          .eq('id', draft.id)
          .eq('status', 'approved')
          .is('sent_at', null)
          .is('brevo_message_id', null);
        if (released.error) throw new Error(released.error.message);
      },
      hold: async (draft, error) => {
        const held = await db
          .from('newsletter_drafts')
          .update({
            delivery_state: 'uncertain',
            delivery_error: error.slice(0, 500),
          })
          .eq('id', draft.id)
          .eq('status', 'approved')
          .is('sent_at', null)
          .is('brevo_message_id', null);
        if (held.error) throw new Error(held.error.message);
      },
    });

    const problem = result.failed + result.uncertain;
    return res.status(problem ? 502 : 200).json({ ok: problem === 0, skipped: false, editionDate, timeZone: SEND_TIME_ZONE, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Newsletter delivery failed.' });
  }
}
