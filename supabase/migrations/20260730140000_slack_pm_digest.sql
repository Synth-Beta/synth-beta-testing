-- Digest channel + schedule bookkeeping for Synth Slack PM

ALTER TABLE public.pm_workspaces
  ADD COLUMN IF NOT EXISTS digest_channel_id text,
  ADD COLUMN IF NOT EXISTS digest_timezone text NOT NULL DEFAULT 'America/New_York',
  ADD COLUMN IF NOT EXISTS digest_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS last_digest_key text;

COMMENT ON COLUMN public.pm_workspaces.digest_channel_id IS
  'Slack channel id for 9am / midday / EOD digests';
COMMENT ON COLUMN public.pm_workspaces.last_digest_key IS
  'Idempotency key e.g. 2026-07-30:morning';
