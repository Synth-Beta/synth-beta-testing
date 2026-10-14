-- Churn-score re-engagement notifications (Duolingo-style, heuristic — no ML).
--
-- 1. user_app_opens: one row per app session (foreground bounces within 30 min
--    collapse into one), written by the record_app_open() RPC from mobile + web.
-- 2. churn_stage(): hours since last open divided by the user's normal gap
--    between active days. >= 2x their normal gap = at_risk, 7+ days = dormant,
--    30+ days = lost (we stop nudging).
-- 3. send_reengagement_notifications(): hourly pg_cron job. Sends one nudge at the
--    hour the user usually opens the app (clamped 9am-8pm US Eastern — no
--    per-user timezone column yet, same approximation as next_notification_slot()).
--    at_risk: at most every ~2 days. dormant: at most weekly. lost: never.
--    Never within 4h of another non-chat notification, never if the user already
--    got 3 non-chat notifications in the last 24h.
--
-- The nudge is a normal `notifications` row (type 'reengagement'), so it flows
-- through the existing push webhook unchanged.
--
-- Users with no rows in user_app_opens are skipped, so this ramps up as open
-- data accumulates after the app update ships.
--
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.user_app_opens (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS user_app_opens_user_time_idx
  ON public.user_app_opens (user_id, opened_at DESC);

-- Written only through record_app_open(); no direct client access.
ALTER TABLE public.user_app_opens ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.user_app_opens FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_app_open()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN
    RETURN;
  END IF;

  -- One row per 30-minute session, so foreground/background bounces don't skew the best hour.
  IF EXISTS (
    SELECT 1 FROM public.user_app_opens
    WHERE user_id = uid AND opened_at > now() - interval '30 minutes'
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.user_app_opens (user_id) VALUES (uid);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_app_open() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_app_open() TO authenticated;

-- Pure scoring: kept separate so the thresholds are testable (see self-check below).
-- p_avg_gap_hours NULL = not enough history; assume a 48h normal gap.
-- Gap floor of 24h: a daily user is flagged after 2 missed days, not 2 missed hours.
CREATE OR REPLACE FUNCTION public.churn_stage(
  p_hours_since_open numeric,
  p_avg_gap_hours numeric
) RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_hours_since_open >= 30 * 24 THEN 'lost'
    WHEN p_hours_since_open >= 7 * 24 THEN 'dormant'
    WHEN p_hours_since_open / greatest(coalesce(p_avg_gap_hours, 48), 24) >= 2 THEN 'at_risk'
    ELSE 'active'
  END;
$$;

DO $$ BEGIN
  ASSERT public.churn_stage(10, 24) = 'active', 'opened 10h ago is active';
  ASSERT public.churn_stage(47, 24) = 'active', 'daily user, 47h out is still active';
  ASSERT public.churn_stage(48, 24) = 'at_risk', 'daily user, 48h out is at_risk';
  ASSERT public.churn_stage(60, 1) = 'at_risk', 'gap floored at 24h';
  ASSERT public.churn_stage(90, NULL) = 'active', 'no history: 48h default gap';
  ASSERT public.churn_stage(96, NULL) = 'at_risk', 'no history: at_risk at 96h';
  ASSERT public.churn_stage(100, 72) = 'active', 'every-3-days user, 100h out is fine';
  ASSERT public.churn_stage(7 * 24, 168) = 'dormant', '7 days out is dormant regardless of gap';
  ASSERT public.churn_stage(30 * 24, 24) = 'lost', '30 days out is lost';
END $$;

CREATE OR REPLACE FUNCTION public.send_reengagement_notifications()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sent int;
  at_risk_templates jsonb := '[
    {"title": "New shows just dropped", "message": "See what''s coming up near you this week."},
    {"title": "Your friends have been busy", "message": "Catch up on the shows they''re heading to."},
    {"title": "Don''t miss your next show", "message": "Tickets for upcoming shows near you are moving fast."}
  ]'::jsonb;
  dormant_templates jsonb := '[
    {"title": "It''s been a minute", "message": "A lot of new shows were added since you last checked in."},
    {"title": "Your scene missed you", "message": "See who''s playing near you this month."}
  ]'::jsonb;
BEGIN
  -- Keep the open log bounded; a user with no opens in 60 days is past 'lost' anyway.
  DELETE FROM public.user_app_opens WHERE opened_at < now() - interval '60 days';

  WITH stats AS (
    SELECT
      o.user_id,
      max(o.opened_at) AS last_open,
      mode() WITHIN GROUP (ORDER BY extract(hour FROM o.opened_at AT TIME ZONE 'America/New_York')) AS best_hour,
      count(DISTINCT (o.opened_at AT TIME ZONE 'America/New_York')::date)
        FILTER (WHERE o.opened_at > now() - interval '30 days') AS active_days,
      max((o.opened_at AT TIME ZONE 'America/New_York')::date)
        FILTER (WHERE o.opened_at > now() - interval '30 days')
      - min((o.opened_at AT TIME ZONE 'America/New_York')::date)
        FILTER (WHERE o.opened_at > now() - interval '30 days') AS span_days
    FROM public.user_app_opens o
    GROUP BY o.user_id
  ),
  scored AS (
    SELECT
      s.user_id,
      public.churn_stage(
        extract(epoch FROM now() - s.last_open) / 3600,
        CASE WHEN s.active_days >= 2 THEN s.span_days * 24.0 / (s.active_days - 1) END
      ) AS stage
    FROM stats s
    WHERE least(greatest(s.best_hour, 9), 20) = extract(hour FROM now() AT TIME ZONE 'America/New_York')
  ),
  eligible AS (
    SELECT sc.user_id, sc.stage,
      (SELECT (n.data->>'template')::int
       FROM public.notifications n
       WHERE n.user_id = sc.user_id AND n.type = 'reengagement'
       ORDER BY n.created_at DESC LIMIT 1) AS last_template
    FROM scored sc
    WHERE sc.stage IN ('at_risk', 'dormant')
      AND EXISTS (
        SELECT 1 FROM public.device_tokens d
        WHERE d.user_id = sc.user_id AND d.is_active
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.user_settings_preferences p
        WHERE p.user_id = sc.user_id AND p.enable_push_notifications = false
      )
      -- Per-stage cooldown (44h, not 48h, so an hourly job can't drift a day late).
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = sc.user_id AND n.type = 'reengagement'
          AND n.created_at > now() - CASE WHEN sc.stage = 'at_risk' THEN interval '44 hours' ELSE interval '6 days 20 hours' END
      )
      -- Spacing: nothing non-chat in the last 4h, fewer than 3 non-chat in 24h.
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = sc.user_id
          AND n.type NOT IN ('message', 'chat_message', 'group_chat_invite')
          AND n.created_at > now() - interval '4 hours'
      )
      AND (
        SELECT count(*) FROM public.notifications n
        WHERE n.user_id = sc.user_id
          AND n.type NOT IN ('message', 'chat_message', 'group_chat_invite')
          AND n.created_at > now() - interval '24 hours'
      ) < 3
  ),
  picked AS (
    -- Random template, never the same one twice in a row.
    SELECT e.user_id, e.stage, t.idx, t.tpl
    FROM eligible e
    CROSS JOIN LATERAL (
      SELECT (x.ord - 1)::int AS idx, x.tpl
      FROM jsonb_array_elements(CASE WHEN e.stage = 'at_risk' THEN at_risk_templates ELSE dormant_templates END)
        WITH ORDINALITY AS x(tpl, ord)
      WHERE (x.ord - 1)::int IS DISTINCT FROM e.last_template
      ORDER BY random()
      LIMIT 1
    ) t
  )
  INSERT INTO public.notifications (user_id, type, title, message, data)
  SELECT user_id, 'reengagement', tpl->>'title', tpl->>'message',
    jsonb_build_object('template', idx, 'stage', stage)
  FROM picked;

  GET DIAGNOSTICS sent = ROW_COUNT;
  RETURN sent;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_reengagement_notifications() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.send_reengagement_notifications() IS
  'Hourly churn-score nudges. Scheduled via pg_cron (see reengagement-notifications job).';

DO $$ BEGIN
  PERFORM cron.unschedule('reengagement-notifications')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'reengagement-notifications');
END $$;

-- Minute 5 so it doesn't collide with notification-queue-release on the hour.
SELECT cron.schedule(
  'reengagement-notifications',
  '5 * * * *',
  $$SELECT public.send_reengagement_notifications();$$
);

-- VERIFY
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'reengagement-notifications';
