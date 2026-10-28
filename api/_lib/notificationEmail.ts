/**
 * Email fallback for notifications. Users with no active push token (nearly every web
 * signup: web can't receive push) otherwise never hear about week-1 nudges, new shows
 * from their artists, or reminders. Pure helpers here; the cron is cron/notificationEmails.ts.
 */

/** Only the notifications worth an email. Social chatter (likes, chat) stays in-app. */
export const EMAIL_NOTIFICATION_TYPES = [
  'week1_nudge',
  'reengagement',
  'artist_new_event',
  'event_reminder_1_week',
  'event_reminder_1_day',
  'friend_request',
] as const;

/** Older unread notifications are stale news; don't email them. */
export const EMAIL_LOOKBACK_HOURS = 48;
const MAX_LISTED = 5;

export interface EmailNotification {
  id: string;
  user_id: string;
  title: string | null;
  message: string | null;
}

export interface EmailUser {
  user_id: string;
  email: string | null;
  is_bot: boolean | null;
}

export interface EmailRecipient {
  userId: string;
  email: string;
  notifications: EmailNotification[];
}

export function groupEmailRecipients(
  notifications: EmailNotification[],
  users: EmailUser[],
  usersWithPushToken: Set<string>,
  unsubscribedEmails: Set<string>,
): EmailRecipient[] {
  const byUser = new Map<string, EmailRecipient>();
  const userById = new Map(users.map((u) => [u.user_id, u]));
  for (const n of notifications) {
    const u = userById.get(n.user_id);
    const email = u?.email?.trim().toLowerCase();
    if (!u || !email || u.is_bot || usersWithPushToken.has(u.user_id) || unsubscribedEmails.has(email)) continue;
    let r = byUser.get(u.user_id);
    if (!r) byUser.set(u.user_id, (r = { userId: u.user_id, email, notifications: [] }));
    r.notifications.push(n);
  }
  return [...byUser.values()];
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export function buildNotificationEmail({
  items,
  appUrl,
  appStoreUrl,
  unsubscribeUrl,
}: {
  items: { title: string | null; message: string | null }[];
  appUrl: string;
  appStoreUrl: string;
  unsubscribeUrl: string;
}): { subject: string; html: string } {
  const subject = items.length === 1 ? items[0].title || 'New on Synth' : `${items.length} new updates on Synth`;
  const rows = items
    .slice(0, MAX_LISTED)
    .map(
      (n) => `<tr><td style="padding:12px 0;border-bottom:1px solid #eee;">
<div style="font-weight:700;color:#111;font-size:16px;">${esc(n.title || 'Synth')}</div>
${n.message ? `<div style="color:#555;font-size:14px;margin-top:4px;">${esc(n.message)}</div>` : ''}
</td></tr>`,
    )
    .join('');
  const more = items.length > MAX_LISTED ? `<p style="color:#555;font-size:14px;">And ${items.length - MAX_LISTED} more in the app.</p>` : '';
  const html = `<!doctype html><html><body style="margin:0;background:#FDF2F8;font-family:-apple-system,Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 16px;">
<table role="presentation" width="100%" style="max-width:520px;background:#fff;border-radius:16px;padding:24px;" cellpadding="0" cellspacing="0">
<tr><td style="font-size:22px;font-weight:800;color:#CC2486;padding-bottom:8px;">synth.</td></tr>
${rows}
<tr><td style="padding-top:16px;">${more}
<a href="${esc(appUrl)}" style="display:inline-block;background:#CC2486;color:#FFFDFA;font-weight:700;text-decoration:none;padding:12px 22px;border-radius:999px;">Open Synth</a>
<p style="color:#555;font-size:14px;margin-top:20px;">Get these alerts instantly: <a href="${esc(appStoreUrl)}" style="color:#CC2486;">download Synth for iPhone</a>.</p>
</td></tr></table>
<p style="color:#8A8F98;font-size:12px;margin-top:16px;">You're getting this because you have a Synth account. <a href="${esc(unsubscribeUrl)}" style="color:#8A8F98;text-decoration:underline;">Unsubscribe</a></p>
</td></tr></table></body></html>`;
  return { subject, html };
}
