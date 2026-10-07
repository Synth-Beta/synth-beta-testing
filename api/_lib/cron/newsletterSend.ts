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
} from '../../../apps/admin/src/lib/newsletterEdition/gate';
import { isTenAmCentral, SEND_TIME_ZONE } from '../../../apps/admin/src/lib/newsletterEdition/time';

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
  const { data: rows, error } = await db
    .from('newsletter_drafts')
    .select('id, edition_date, user_id, email, subject, html, content_hash, status, approved_content_hash, sent_at')
    .eq('edition_date', editionDate);
  if (error) return res.status(500).json({ ok: false, error: error.message });

  const { data: unsubscribedRows } = await db.from('newsletter_unsubscribes').select('email');
  const unsubscribed = new Set(
    (unsubscribedRows ?? []).map((row) => String(row.email).trim().toLowerCase())
  );
  const drafts: StoredDraft[] = (rows ?? []).map((row) => ({
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
      return Boolean(claimed.data?.length);
    },
    sendEmail: async (draft) => {
      const email = draft.email.trim().toLowerCase();
      const token = createHmac('sha256', unsubscribeSecret).update(email).digest('hex');
      const unsubscribeUrl = `${supabaseUrl}/functions/v1/newsletter-unsubscribe?email=${encodeURIComponent(email)}&token=${encodeURIComponent(token)}&slug=${encodeURIComponent(editionDate)}&next=${encodeURIComponent('https://getsynth.app')}`;
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resendKey}`,
          'Content-Type': 'application/json',
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
      await db
        .from('newsletter_drafts')
        .update({ status: 'approved', sent_at: null })
        .eq('id', draft.id)
        .eq('status', 'sent');
    },
  });

  return res.status(200).json({ ok: true, skipped: false, editionDate, timeZone: SEND_TIME_ZONE, ...result });
}
