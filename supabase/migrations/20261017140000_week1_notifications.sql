-- Week-1 notification sequence + re-engagement fallback.
--
-- Why: of 33 users who signed up Aug 1 - Oct 17 2026, 31 got zero notifications in
-- their first 7 days, and almost none came back after day 1. Every existing
-- notification needs history a new user doesn't have (friends, "interested"
-- events, a fresh announcement), and send_reengagement_notifications() skipped
-- anyone without user_app_opens rows (only builds >= 1.4.17 write them).
--
-- 1. send_week1_notifications(): hourly. One personal nudge on day 1, 3 and 6
--    after signup, built from the artists the user followed in onboarding and
--    their location:
--      day 1: upcoming shows from artists you follow near you
--             (fallback: how many shows are near you in the next 2 weeks)
--      day 3: the most popular upcoming show near you
--      day 6: "your week in live music" summary
--    Sent at the hour the user signed up (clamped 10am-8pm US Eastern, same
--    approximation as the other jobs). Skipped if the user was in the app in the
--    last 6h, if there is nothing real to say, or if the spacing rules block it.
--    Each step is tried exactly once (one matching hour per 24h window).
-- 2. send_reengagement_notifications(): users with no user_app_opens rows now fall
--    back to their latest known activity (users.last_active_at or interactions).
--    Users in their first 7 days are left to the week-1 sequence.
-- 3. record_app_open() also bumps users.last_active_at. Mobile never updated it,
--    so it was stuck at signup time for iOS users.
--
-- Safe to re-run: every statement is idempotent.
-- ROLLBACK: SELECT cron.unschedule('week1-notifications'); then re-apply
--   20261014190000_churn_reengagement_notifications.sql (reengagement + record_app_open).
--
-- Run this in the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- New notification type (widening only; same list as 20261014200000 + week1_nudge)
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'friend_request', 'friend_accepted', 'match', 'message', 'chat_message',
  'review_liked', 'review_commented', 'comment_replied', 'event_interest',
  'artist_followed', 'artist_new_event', 'venue_new_event', 'bucket_list_new_event',
  'friend_tagged_in_review', 'follows_new_events_summary', 'friends_event_interest_summary',
  'bucket_list_new_events_summary', 'event_reminder_1_week', 'event_reminder_3_days',
  'event_reminder_1_day', 'event_reminder_day_after',
  'reengagement', 'week1_nudge'
]::text[]));

-- ---------------------------------------------------------------------------
-- record_app_open(): also keep users.last_active_at current
-- ---------------------------------------------------------------------------
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
  UPDATE public.users SET last_active_at = now() WHERE user_id = uid;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_app_open() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_app_open() TO authenticated;

-- ---------------------------------------------------------------------------
-- Week-1 sequence
-- ---------------------------------------------------------------------------

-- Pure: which step (1, 2, 3) a user is in, by hours since signup. NULL = none.
CREATE OR REPLACE FUNCTION public.week1_step(p_hours_since_signup numeric)
RETURNS int
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_hours_since_signup >= 24  AND p_hours_since_signup < 48  THEN 1
    WHEN p_hours_since_signup >= 72  AND p_hours_since_signup < 96  THEN 2
    WHEN p_hours_since_signup >= 144 AND p_hours_since_signup < 168 THEN 3
  END;
$$;

DO $$ BEGIN
  ASSERT public.week1_step(5) IS NULL, 'signup day: nothing';
  ASSERT public.week1_step(24) = 1, 'day 1 starts at 24h';
  ASSERT public.week1_step(47.9) = 1, 'day 1 ends before 48h';
  ASSERT public.week1_step(60) IS NULL, 'day 2: nothing';
  ASSERT public.week1_step(80) = 2, 'day 3';
  ASSERT public.week1_step(150) = 3, 'day 6';
  ASSERT public.week1_step(168) IS NULL, 'day 7+: re-engagement takes over';
END $$;

-- Shows near a user: browse location + radius, else profile coordinates within
-- 50 miles, else profile city name. Same rules as notify_just_announced().
CREATE OR REPLACE FUNCTION public.week1_nearby_events(
  p_user_id uuid,
  p_from timestamptz,
  p_to timestamptz
) RETURNS TABLE (
  event_id uuid,
  artist_id uuid,
  artist_name text,
  venue_name text,
  event_date timestamptz,
  city text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.id, e.artist_id,
         coalesce(a.name, e.title),
         coalesce(v.name, e.venue_city, 'a venue near you'),
         e.event_date,
         coalesce(u.location_city, e.venue_city)
  FROM public.events e
  LEFT JOIN public.venues v ON v.id = e.venue_id
  LEFT JOIN public.artists a ON a.id = e.artist_id
  LEFT JOIN public.user_browse_locations bl ON bl.user_id = p_user_id
  LEFT JOIN public.users u ON u.user_id = p_user_id
  WHERE e.event_date >= p_from
    AND e.event_date < p_to
    AND (
      (bl.user_id IS NOT NULL AND e.latitude IS NOT NULL
        AND public.miles_between(bl.latitude, bl.longitude, e.latitude, e.longitude) <= bl.radius_miles)
      OR (bl.user_id IS NULL AND u.latitude IS NOT NULL AND e.latitude IS NOT NULL
        AND public.miles_between(u.latitude, u.longitude, e.latitude, e.longitude) <= 50)
      OR (bl.user_id IS NULL AND u.latitude IS NULL
        AND lower(trim(u.location_city)) = lower(trim(e.venue_city)))
    );
$$;

REVOKE EXECUTE ON FUNCTION public.week1_nearby_events(uuid, timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.send_week1_notifications()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  sent int := 0;
  r record;
  ev record;
  n int;
  f int;
  pop int;
  v_title text;
  v_message text;
  v_event uuid;
  fmt text := 'Dy, Mon FMDD';
BEGIN
  FOR r IN
    SELECT u.user_id,
           public.week1_step(extract(epoch FROM now() - u.created_at) / 3600) AS step
    FROM public.users u
    WHERE u.created_at > now() - interval '7 days'
      AND coalesce(u.is_bot, false) = false
      AND coalesce(u.is_ai_scene_guide, false) = false
      AND public.week1_step(extract(epoch FROM now() - u.created_at) / 3600) IS NOT NULL
      -- Same time of day they signed up: one matching hour per 24h step window.
      AND least(greatest(extract(hour FROM u.created_at AT TIME ZONE 'America/New_York'), 10), 20)
          = extract(hour FROM now() AT TIME ZONE 'America/New_York')
      AND NOT EXISTS (
        SELECT 1 FROM public.user_settings_preferences p
        WHERE p.user_id = u.user_id AND p.enable_push_notifications = false
      )
      -- Already in the app recently: no nudge needed.
      AND NOT EXISTS (
        SELECT 1 FROM public.user_app_opens o
        WHERE o.user_id = u.user_id AND o.opened_at > now() - interval '6 hours'
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.interactions i
        WHERE i.user_id = u.user_id AND i.occurred_at > now() - interval '6 hours'
      )
      -- Spacing: nothing non-chat in the last 4h, fewer than 3 non-chat in 24h.
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications nn
        WHERE nn.user_id = u.user_id
          AND nn.type NOT IN ('message', 'chat_message', 'group_chat_invite')
          AND nn.created_at > now() - interval '4 hours'
      )
      AND (
        SELECT count(*) FROM public.notifications nn
        WHERE nn.user_id = u.user_id
          AND nn.type NOT IN ('message', 'chat_message', 'group_chat_invite')
          AND nn.created_at > now() - interval '24 hours'
      ) < 3
  LOOP
    -- Never send the same step twice (e.g. a manual re-run in the same hour).
    CONTINUE WHEN EXISTS (
      SELECT 1 FROM public.notifications nn
      WHERE nn.user_id = r.user_id AND nn.type = 'week1_nudge'
        AND (nn.data->>'step')::int = r.step
    );

    v_title := NULL; v_message := NULL; v_event := NULL;

    IF r.step = 1 THEN
      -- Upcoming shows from artists they follow, near them.
      SELECT count(*) INTO n
      FROM public.week1_nearby_events(r.user_id, now(), now() + interval '120 days') ne
      JOIN public.artist_follows af ON af.artist_id = ne.artist_id AND af.user_id = r.user_id;

      IF n > 0 THEN
        SELECT ne.* INTO ev
        FROM public.week1_nearby_events(r.user_id, now(), now() + interval '120 days') ne
        JOIN public.artist_follows af ON af.artist_id = ne.artist_id AND af.user_id = r.user_id
        ORDER BY ne.event_date LIMIT 1;

        v_title := CASE WHEN n = 1 THEN ev.artist_name || ' is playing near you'
                        ELSE n || ' upcoming shows from artists you follow' END;
        v_message := ev.artist_name || ' at ' || ev.venue_name || ' · '
          || to_char(ev.event_date AT TIME ZONE 'America/New_York', fmt)
          || CASE WHEN n > 1 THEN ' and ' || (n - 1) || ' more near you.' ELSE '.' END;
        v_event := ev.event_id;
      ELSE
        -- Fallback: anything near them in the next two weeks. Opens Discover.
        SELECT count(*) INTO n
        FROM public.week1_nearby_events(r.user_id, now(), now() + interval '14 days');
        IF n > 0 THEN
          SELECT ne.* INTO ev
          FROM public.week1_nearby_events(r.user_id, now(), now() + interval '14 days') ne
          ORDER BY ne.event_date LIMIT 1;
          v_title := CASE WHEN n = 1 THEN '1 show' ELSE n || ' shows' END || ' near you in the next two weeks';
          v_message := 'Starting with ' || ev.artist_name || ' at ' || ev.venue_name || ' · '
            || to_char(ev.event_date AT TIME ZONE 'America/New_York', fmt) || '.';
        END IF;
      END IF;

    ELSIF r.step = 2 THEN
      -- Most popular upcoming show near them (Synth interest first, then popularity score).
      SELECT ne.*, coalesce(ue.k, 0) AS interested,
             coalesce(ue.k, 0) + coalesce(ps.total_count, 0) AS score
      INTO ev
      FROM public.week1_nearby_events(r.user_id, now(), now() + interval '30 days') ne
      LEFT JOIN (
        SELECT uer.event_id, count(*)::int AS k
        FROM public.user_event_relationships uer
        WHERE uer.relationship_type IN ('interested', 'going')
        GROUP BY uer.event_id
      ) ue ON ue.event_id = ne.event_id
      LEFT JOIN public.event_popularity_scores ps ON ps.event_id = ne.event_id
      ORDER BY coalesce(ue.k, 0) + coalesce(ps.total_count, 0) DESC, ne.event_date
      LIMIT 1;

      IF FOUND THEN
        pop := ev.interested;
        v_title := CASE WHEN ev.score > 0 THEN 'Trending near you: ' ELSE 'Coming up near you: ' END
          || ev.artist_name;
        v_message := ev.venue_name || ' · ' || to_char(ev.event_date AT TIME ZONE 'America/New_York', fmt)
          || CASE WHEN pop > 0 THEN ' · ' || pop || ' interested on Synth' ELSE '' END
          || '. Tap Interested to get a reminder before the show.';
        v_event := ev.event_id;
      END IF;

    ELSIF r.step = 3 THEN
      SELECT count(*) INTO n
      FROM public.week1_nearby_events(r.user_id, now(), now() + interval '7 days');
      SELECT count(*) INTO f
      FROM public.week1_nearby_events(r.user_id, now(), now() + interval '30 days') ne
      JOIN public.artist_follows af ON af.artist_id = ne.artist_id AND af.user_id = r.user_id;

      IF n > 0 OR f > 0 THEN
        v_title := 'Your week in live music';
        v_message := CASE
          WHEN n > 0 AND f > 0 THEN n || CASE WHEN n = 1 THEN ' show' ELSE ' shows' END
            || ' near you this week, plus ' || f || ' from artists you follow this month.'
          WHEN n > 0 THEN n || CASE WHEN n = 1 THEN ' show' ELSE ' shows' END
            || ' near you this week. See what''s on.'
          ELSE f || CASE WHEN f = 1 THEN ' show' ELSE ' shows' END
            || ' from artists you follow near you this month.'
        END;
      END IF;
    END IF;

    CONTINUE WHEN v_title IS NULL;

    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      r.user_id, 'week1_nudge', v_title, v_message,
      jsonb_strip_nulls(jsonb_build_object('step', r.step, 'event_id', v_event))
    );
    sent := sent + 1;
  END LOOP;

  RETURN sent;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.send_week1_notifications() FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.send_week1_notifications() IS
  'Hourly: day 1/3/6 nudges for new users from followed artists + location. Scheduled via pg_cron (week1-notifications).';

DO $$ BEGIN
  PERFORM cron.unschedule('week1-notifications')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'week1-notifications');
END $$;

-- Minute 35: clear of queue release (:00/:15/:30/:45), reengagement (:05), just-announced (:20).
SELECT cron.schedule(
  'week1-notifications',
  '35 * * * *',
  $$SELECT public.send_week1_notifications();$$
);

-- ---------------------------------------------------------------------------
-- Re-engagement: fall back to last known activity when there are no app opens
-- ---------------------------------------------------------------------------
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

  WITH opens AS (
    SELECT o.user_id, o.opened_at FROM public.user_app_opens o
    UNION ALL
    -- No open rows (pre-1.4.17 app or web before record_app_open shipped):
    -- one synthetic open at their latest known activity. GREATEST skips NULLs.
    SELECT u.user_id,
           greatest(u.last_active_at,
                    (SELECT max(i.occurred_at) FROM public.interactions i WHERE i.user_id = u.user_id))
    FROM public.users u
    WHERE NOT EXISTS (SELECT 1 FROM public.user_app_opens o WHERE o.user_id = u.user_id)
  ),
  stats AS (
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
    FROM opens o
    WHERE o.opened_at IS NOT NULL
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
    JOIN public.users u ON u.user_id = s.user_id
    WHERE least(greatest(s.best_hour, 9), 20) = extract(hour FROM now() AT TIME ZONE 'America/New_York')
      -- First week belongs to send_week1_notifications().
      AND u.created_at <= now() - interval '7 days'
      AND coalesce(u.is_bot, false) = false
      AND coalesce(u.is_ai_scene_guide, false) = false
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

-- VERIFY
SELECT jobname, schedule, command FROM cron.job
WHERE jobname IN ('week1-notifications', 'reengagement-notifications');
