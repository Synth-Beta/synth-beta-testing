-- Email fallback for users without push (api/_lib/cron/notificationEmails.ts).
-- email_sent_at is claimed before each send so a notification is emailed at most once.
-- ROLLBACK: DROP INDEX IF EXISTS public.idx_notifications_email_pending;
--           ALTER TABLE public.notifications DROP COLUMN IF EXISTS email_sent_at;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz;

-- The cron only scans recent, unread, not-yet-emailed rows.
CREATE INDEX IF NOT EXISTS idx_notifications_email_pending
  ON public.notifications (created_at)
  WHERE email_sent_at IS NULL AND is_read = false;
