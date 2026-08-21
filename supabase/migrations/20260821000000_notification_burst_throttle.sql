-- Notification burst throttle + retention drip.
--
-- Problem: a friend marking several events "interested" within seconds fires one
-- notification per event per friend, all at once (the burst from the 2026-08-21
-- report — 7 notifications, same-minute timestamps, confirmed via direct data
-- query to be genuinely distinct events, not duplicates). Push already got a
-- last-line-of-defense cap in api/push-notification-webhook.ts; this migration
-- moves the REAL cap upstream to notification-creation time, so both the in-app
-- list and push are throttled together instead of separately.
--
-- Design: at most 2 notifications of a given `type` land for a recipient within
-- a rolling 10-minute window. Anything past that gets queued instead of created
-- immediately, batched 2-per-slot, each slot staggered 20-28h (randomized, not a
-- flat 24h, so repeat batches don't land at the same clock time every day and
-- start reading as automated) past the previous slot, clamped to 9am-9pm US
-- Eastern so a jittered time can't land in the middle of the night. A cron job
-- releases due rows every 15 minutes (same cadence as feed-cache-drain).
--
-- This is the general queue/throttle mechanism only. It is NOT yet wired into
-- the "notify friends of event interest" trigger, which is not in any tracked
-- migration (edited directly in the DB previously — same situation as the
-- Spotify token RLS policies). That wiring is a small follow-up migration once
-- the live trigger/function source is confirmed via:
--   SELECT p.proname, pg_get_functiondef(p.oid) AS definition
--   FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public' AND (p.proname ILIKE '%event_interest%' OR p.proname ILIKE '%notify_friend%');
--
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  data jsonb,
  scheduled_for timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  delivered_at timestamptz
);

-- Cron scan: "what's due right now".
CREATE INDEX IF NOT EXISTS notification_queue_due_idx
  ON public.notification_queue (scheduled_for)
  WHERE delivered_at IS NULL;

-- Per-recipient lookup: "what's this user's latest pending slot, and how full is it".
CREATE INDEX IF NOT EXISTS notification_queue_user_pending_idx
  ON public.notification_queue (user_id, scheduled_for DESC)
  WHERE delivered_at IS NULL;

-- Service-role only (cron + the trigger below run as SECURITY DEFINER); no
-- client ever reads/writes this directly, matching push_delivery_log's pattern.
ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.notification_queue FROM anon, authenticated;

COMMENT ON TABLE public.notification_queue IS
  'Overflow notifications past the per-recipient burst cap, drip-released by release_due_queued_notifications() via pg_cron. Service-role only.';

-- Jittered "next slot" time: base + a random 20-28h offset, clamped so the
-- result always falls between 9am and 9pm US Eastern (there is no per-user
-- timezone column in this schema yet, so this is a repo-wide approximation —
-- fine for a DC-area-focused app; revisit if the user base becomes non-local).
CREATE OR REPLACE FUNCTION public.next_notification_slot(
  p_base timestamptz,
  p_min_hours numeric DEFAULT 20,
  p_max_hours numeric DEFAULT 28
) RETURNS timestamptz
LANGUAGE plpgsql
AS $$
DECLARE
  candidate timestamptz;
  local_hour int;
BEGIN
  candidate := p_base + (p_min_hours + random() * (p_max_hours - p_min_hours)) * interval '1 hour';
  local_hour := EXTRACT(HOUR FROM candidate AT TIME ZONE 'America/New_York');

  IF local_hour < 9 THEN
    candidate := (date_trunc('day', candidate AT TIME ZONE 'America/New_York') + interval '9 hours')
      AT TIME ZONE 'America/New_York';
  ELSIF local_hour >= 21 THEN
    candidate := (date_trunc('day', candidate AT TIME ZONE 'America/New_York') + interval '1 day' + interval '9 hours')
      AT TIME ZONE 'America/New_York';
  END IF;

  RETURN candidate;
END;
$$;

-- Shared entry point for any notification-creating trigger that wants burst
-- protection: sends immediately under the cap, otherwise batches onto the
-- recipient's next open queue slot (or opens a new one 20-28h out).
CREATE OR REPLACE FUNCTION public.queue_or_send_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_data jsonb DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count int;
  target_slot timestamptz;
  slot_count int;
BEGIN
  SELECT count(*) INTO recent_count
  FROM public.notifications
  WHERE user_id = p_user_id
    AND type = p_type
    AND created_at > now() - interval '10 minutes';

  IF recent_count < 2 THEN
    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (p_user_id, p_type, p_title, p_message, p_data);
    RETURN;
  END IF;

  SELECT scheduled_for, cnt INTO target_slot, slot_count
  FROM (
    SELECT scheduled_for, count(*) AS cnt
    FROM public.notification_queue
    WHERE user_id = p_user_id AND delivered_at IS NULL
    GROUP BY scheduled_for
    ORDER BY scheduled_for DESC
    LIMIT 1
  ) latest;

  IF target_slot IS NULL THEN
    target_slot := public.next_notification_slot(now());
  ELSIF slot_count >= 2 THEN
    target_slot := public.next_notification_slot(target_slot);
  END IF;

  INSERT INTO public.notification_queue (user_id, type, title, message, data, scheduled_for)
  VALUES (p_user_id, p_type, p_title, p_message, p_data, target_slot);
END;
$$;

-- Cron worker: promote due queued rows into real notifications (which then
-- flow through the existing push trigger unchanged — no separate push logic
-- needed here). SKIP LOCKED so overlapping runs can't double-release.
CREATE OR REPLACE FUNCTION public.release_due_queued_notifications(
  p_batch_limit int DEFAULT 200
) RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  released int;
BEGIN
  WITH due AS (
    SELECT id, user_id, type, title, message, data
    FROM public.notification_queue
    WHERE delivered_at IS NULL AND scheduled_for <= now()
    ORDER BY scheduled_for
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  ),
  inserted AS (
    INSERT INTO public.notifications (user_id, type, title, message, data)
    SELECT user_id, type, title, message, data FROM due
    RETURNING 1
  )
  UPDATE public.notification_queue q
  SET delivered_at = now()
  FROM due
  WHERE q.id = due.id;

  GET DIAGNOSTICS released = ROW_COUNT;
  RETURN released;
END;
$$;

COMMENT ON FUNCTION public.release_due_queued_notifications(int) IS
  'Drip-releases due notification_queue rows into real notifications rows. Scheduled every 15 min via pg_cron (see notification-queue-release job).';

DO $$ BEGIN
  PERFORM cron.unschedule('notification-queue-release')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'notification-queue-release');
END $$;

SELECT cron.schedule(
  'notification-queue-release',
  '*/15 * * * *',
  $$SELECT public.release_due_queued_notifications(200);$$
);

-- VERIFY
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'notification-queue-release';
