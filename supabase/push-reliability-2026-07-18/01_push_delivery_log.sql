-- =============================================================================
-- 01 — push_delivery_log: per-attempt push delivery observability
-- =============================================================================
-- Today the live webhook (api/push-notification-webhook.ts) deactivates dead
-- tokens but records NOTHING about who received what — so a delivery regression
-- (e.g. "APNs not configured", the exact failure that killed 2,491 of 2,902 old
-- queue sends) is invisible until users complain.
--
-- This table gives one row per (notification, device token) delivery attempt so
-- you can answer "did user X get notification Y, and if not, why?" and chart the
-- send success rate over time. The webhook code writes to it in one batch insert.
--
-- PRIVACY: we store only the last 12 chars of the token (device_token_tail), never
-- the full push token.
--
-- SAFETY: purely additive (new table). No app data touched. Idempotent.
-- Review, then apply yourself.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.push_delivery_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  notification_id   uuid,
  user_id           uuid,
  channel           text,        -- 'expo' | 'apns'
  platform          text,        -- 'ios' | 'android'
  device_token_tail text,        -- last 12 chars only (never the full token)
  status            text NOT NULL,-- 'sent' | 'failed' | 'skipped'
  error             text,        -- error/reason when not 'sent'
  deactivated       boolean NOT NULL DEFAULT false, -- did we deactivate this token?
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- Query patterns: "recent attempts for a user", "attempts for a notification",
-- "failures over time".
CREATE INDEX IF NOT EXISTS push_delivery_log_user_created_idx
  ON public.push_delivery_log (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS push_delivery_log_notification_idx
  ON public.push_delivery_log (notification_id);
CREATE INDEX IF NOT EXISTS push_delivery_log_status_created_idx
  ON public.push_delivery_log (status, created_at DESC);

-- Lock it down: written/read only by the service role (the webhook uses the
-- service-role key, which bypasses RLS). No anon/authenticated access — this is
-- operational telemetry, not user-facing data.
ALTER TABLE public.push_delivery_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.push_delivery_log FROM anon, authenticated;

COMMENT ON TABLE public.push_delivery_log IS
  'Per-attempt push delivery telemetry written by the push-notification webhook. Service-role only.';

-- ----------------------------------------------------------------------------
-- HANDY QUERIES (after the webhook starts writing):
--
--   -- Overall success rate, last 24h:
--   SELECT status, count(*) FROM public.push_delivery_log
--   WHERE created_at > now()-interval '24 hours' GROUP BY status;
--
--   -- Why is a specific user not getting push?
--   SELECT created_at, channel, platform, status, error, deactivated
--   FROM public.push_delivery_log WHERE user_id = '<uuid>'
--   ORDER BY created_at DESC LIMIT 50;
--
--   -- Are we back to "apns:not-configured"? (the old failure mode)
--   SELECT error, count(*) FROM public.push_delivery_log
--   WHERE status='skipped' AND created_at > now()-interval '24 hours'
--   GROUP BY error ORDER BY 2 DESC;
-- ----------------------------------------------------------------------------

-- Optional retention (keep 60 days) — schedule with pg_cron if you like:
--   DELETE FROM public.push_delivery_log WHERE created_at < now()-interval '60 days';

-- VERIFY
SELECT
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='push_delivery_log') AS table_expect_1,
  (SELECT count(*) FROM pg_indexes WHERE schemaname='public' AND tablename='push_delivery_log') AS indexes_expect_3;

-- ROLLBACK:
--   DROP TABLE IF EXISTS public.push_delivery_log;
