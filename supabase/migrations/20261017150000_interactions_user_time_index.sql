-- send_reengagement_notifications() and send_week1_notifications()
-- (20261017140000_week1_notifications.sql) look up each user's latest
-- interactions.occurred_at every hour. Without this they scan the whole table per user.
--
-- Safe to re-run. Plain CREATE INDEX (not CONCURRENTLY) so it runs in the SQL
-- editor; the table is small enough (~23k rows, Oct 2026) that the lock is brief.
--
-- Run this in the Supabase SQL editor.

CREATE INDEX IF NOT EXISTS interactions_user_occurred_idx
  ON public.interactions (user_id, occurred_at DESC);

-- VERIFY
SELECT indexname FROM pg_indexes WHERE tablename = 'interactions' AND indexname = 'interactions_user_occurred_idx';
