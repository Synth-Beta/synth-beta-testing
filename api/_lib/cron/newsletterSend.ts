/**
 * Sends the approved newsletter edition at 10:00 America/Chicago.
 *
 * Vercel cron expressions are UTC and do not follow Central daylight time, so the
 * job is scheduled at both 15:00 and 16:00 UTC. This handler sends only when the
 * current America/Chicago hour is 10. It never generates or approves drafts.
 */
import { createHmac, timingSafeEqual } from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import {
  deliverApprovedDrafts,
  type StoredDraft,
  deliveryKey,
} from '../newsletterDelivery.js';
const SEND_TIME_ZONE = 'America/Chicago';
const isTenAmCentral = (now: Date) => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: SEND_TIME_ZONE, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  return Number(parts.find((part) => part.type === 'hour')?.value) === 10
    && Number(parts.find((part) => part.type === 'minute')?.value) < 15;
};

const readAll = async (makeQuery: () => any) => {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await makeQuery().range(offset, offset + 499);
    if (error) throw new Error(error.message);
    rows.push(...(data ?? []));
    if (!data || data.length < 500) return rows;
  }
};

function secureEquals(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}

const editionDateCentral = (now: Date) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: SEND_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);

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
  if (!isTenAmCentral(now)) {
    return res.status(200).json({
      ok: true,
      skipped: true,
      reason: 'Newsletter send runs at 10:00 America/Chicago.',
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const unsubscribeSecret = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET;
  if (!supabaseUrl || !serviceKey || !resendKey || !fromEmail || !unsubscribeSecret) {
    return res.status(500).json({ ok: false, error: 'Newsletter send is not configured.' });
  }

  const db = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const editionDate = editionDateCentral(now);
  try {
    const rows = await readAll(() => db
      .from('newsletter_drafts')
      .select('id, edition_date, user_id, email, subject, html, content_hash, status, approved_content_hash, sent_at')
      .eq('edition_date', editionDate).order('id'));

    const unsubscribedRows = await readAll(() => db.from('newsletter_unsubscribes').select('email').order('email'));
    const eligibleRows = await readAll(() => db.from('users').select('user_id, email').eq('account_status', 'active').or('is_bot.is.false,is_bot.is.null').order('user_id'));
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
    }));

    const result = await deliverApprovedDrafts({
      drafts,
      unsubscribedEmails: unsubscribed,
      claim: async (draft) => {
        const claimed = await db
          .from('newsletter_drafts')
          .update({ status: 'sent', sent_at: new Date().toISOString() })
          .eq('id', draft.id)
          .eq('status', 'approved')
          .eq('content_hash', draft.contentHash)
          .eq('approved_content_hash', draft.contentHash)
          .is('sent_at', null)
          .select('id');
        if (claimed.error) throw new Error(claimed.error.message);
        return Boolean(claimed.data?.length);
      },
      sendEmail: async (draft) => {
        const email = draft.email.trim().toLowerCase();
        const token = createHmac('sha256', unsubscribeSecret).update(email).digest('hex');
        const unsubscribeUrl = `${supabaseUrl}/functions/v1/newsletter-unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}&slug=${encodeURIComponent(editionDate)}&next=${encodeURIComponent('https://getsynth.app')}`;
        // Resend permits two requests per second; avoid rejecting most of a large edition.
        await new Promise((resolve) => setTimeout(resolve, 550));
        const response = await fetch('https://api.resend.com/emails', {
          signal: AbortSignal.timeout(15000),
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendKey}`,
            'Content-Type': 'application/json',
            'Idempotency-Key': deliveryKey(draft),
          },
          body: JSON.stringify({
            from: fromEmail,
            to: [email],
            subject: draft.subject,
            html: injectUnsubscribeLink(draft.html, unsubscribeUrl),
            headers: {
              'List-Unsubscribe': `<${unsubscribeUrl}>`,
              'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
            },
          }),
        });
        if (!response.ok) {
          const body = await response.json().catch(() => ({}));
          throw new Error((body as { message?: string }).message || `Resend failed (${response.status})`);
        }
      },
      release: async (draft) => {
        const released = await db
          .from('newsletter_drafts')
          .update({ status: 'approved', sent_at: null })
          .eq('id', draft.id)
          .eq('status', 'sent')
          .eq('content_hash', draft.contentHash);
        if (released.error) throw new Error(released.error.message);
      },
    });

    return res.status(result.failed ? 502 : 200).json({ ok: result.failed === 0, skipped: false, editionDate, timeZone: SEND_TIME_ZONE, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Newsletter delivery failed.' });
  }
}
