-- Engagement tracking for the 10-day "just announced" test
-- (20261016120000_just_announced_notifications.sql).
--
-- The question: are days 8-10 after announcement worth keeping (presale often
-- lands then), or is 7 enough? So every feed impression/open records how many
-- days after JamBase listed the show it happened.
--
-- The generic `interactions` table has no metadata column, so it can't carry the
-- feed label; this small table does. One row per user/event/action/day, with a
-- counter, so scrolling past a card repeatedly doesn't bloat it.
--
-- Run AFTER 20261016120000_just_announced_notifications.sql (needs events.announced_at).
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.just_announced_feed_log (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('impression', 'open')),
  day date NOT NULL,
  is_fan boolean NOT NULL,
  platform text NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  days_since_announced int,
  first_at timestamptz NOT NULL DEFAULT now(),
  hits int NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, event_id, action, day)
);

ALTER TABLE public.just_announced_feed_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.just_announced_feed_log FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.log_just_announced(
  p_event_id uuid,
  p_action text,
  p_is_fan boolean,
  p_platform text
) RETURNS void
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

  INSERT INTO public.just_announced_feed_log
    (user_id, event_id, action, day, is_fan, platform, days_since_announced)
  SELECT uid, p_event_id, p_action, (now() AT TIME ZONE 'America/New_York')::date,
         coalesce(p_is_fan, false), p_platform,
         floor(extract(epoch FROM now() - e.announced_at) / 86400)::int
  FROM public.events e
  WHERE e.id = p_event_id
  ON CONFLICT (user_id, event_id, action, day)
    DO UPDATE SET hits = public.just_announced_feed_log.hits + 1;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_just_announced(uuid, text, boolean, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_just_announced(uuid, text, boolean, text) TO authenticated;

-- Feed report: per day-since-announcement, how many user/show pairs were seen,
-- opened, and then marked interested/going (after first being seen).
-- Reading: compare the 8-10 rows against 0-7 to decide the final window.
CREATE OR REPLACE VIEW public.just_announced_feed_report AS
WITH seen AS (
  SELECT user_id, event_id, is_fan,
         min(days_since_announced) AS days_since_announced,
         min(first_at) AS first_seen_at
  FROM public.just_announced_feed_log
  WHERE action = 'impression'
  GROUP BY user_id, event_id, is_fan
)
SELECT
  s.days_since_announced,
  s.is_fan,
  count(*) AS seen,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM public.just_announced_feed_log o
    WHERE o.action = 'open' AND o.user_id = s.user_id AND o.event_id = s.event_id
  )) AS opened,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM public.user_event_relationships r
    WHERE r.user_id = s.user_id AND r.event_id = s.event_id
      AND r.relationship_type IN ('interested', 'going')
      AND r.created_at >= s.first_seen_at
  )) AS interested_after
FROM seen s
GROUP BY s.days_since_announced, s.is_fan
ORDER BY s.days_since_announced, s.is_fan;

-- Notification report: per send day. `read` is set when the user taps the
-- notification, but also by "mark all as read", so treat it as an upper bound;
-- interested_after is the stronger signal.
CREATE OR REPLACE VIEW public.just_announced_notification_report AS
SELECT
  (n.created_at AT TIME ZONE 'America/New_York')::date AS sent_day,
  count(*) AS sent,
  count(*) FILTER (WHERE n.is_read) AS read,
  count(*) FILTER (WHERE EXISTS (
    SELECT 1 FROM public.user_event_relationships r
    WHERE r.user_id = n.user_id
      AND r.event_id = (n.data->>'event_id')::uuid
      AND r.relationship_type IN ('interested', 'going')
      AND r.created_at >= n.created_at
  )) AS interested_after
FROM public.notifications n
WHERE n.type = 'artist_new_event' AND n.data->>'reason' = 'just_announced'
GROUP BY 1
ORDER BY 1;

-- Views run with the owner's rights; keep them admin/SQL-editor only.
REVOKE ALL ON public.just_announced_feed_report FROM anon, authenticated;
REVOKE ALL ON public.just_announced_notification_report FROM anon, authenticated;

-- VERIFY (empty until the apps ship)
SELECT * FROM public.just_announced_feed_report;
SELECT * FROM public.just_announced_notification_report;
