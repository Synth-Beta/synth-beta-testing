-- ============================================
-- PUSH NOTIFICATION UPDATES
-- ============================================
-- 1. Add chat_message to notifications type constraint (fixes chat push)
-- 2. Add daily summary notification types
-- 3. Remove friend_accepted from push (handled in webhook)
-- 4. Replace bucket_list_new_event trigger with daily summary job
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Update notifications type constraint
-- ============================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'notifications'
    AND constraint_name LIKE '%notifications_type_check%'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  END IF;

  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'friend_request',
    'friend_accepted',
    'match',
    'message',
    'chat_message',
    'review_liked',
    'review_commented',
    'comment_replied',
    'event_interest',
    'artist_followed',
    'artist_new_event',
    'artist_profile_updated',
    'venue_new_event',
    'venue_profile_updated',
    'bucket_list_new_event',
    'friend_tagged_in_review',
    'follows_new_events_summary',
    'friends_event_interest_summary',
    'bucket_list_new_events_summary'
  ));
END $$;

-- ============================================
-- STEP 2: Drop individual bucket_list_new_event trigger
-- Replaced by daily summary notifications
-- ============================================
DROP TRIGGER IF EXISTS trigger_notify_bucket_list_new_event ON public.events;

-- ============================================
-- STEP 3: Create daily event summary notification function
-- ============================================
CREATE OR REPLACE FUNCTION public.send_daily_event_summary_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today DATE := current_date;
BEGIN
  -- 1. "Artists and venues you follow announced X new events today"
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  SELECT r.user_id, 'follows_new_events_summary',
    'New events from artists & venues you follow',
    CASE WHEN r.cnt = 1 THEN 'Artists and venues you follow announced 1 new event today'
         ELSE 'Artists and venues you follow announced ' || r.cnt || ' new events today' END,
    jsonb_build_object('count', r.cnt, 'date', v_today),
    false
  FROM (
    SELECT u.user_id,
      COUNT(DISTINCT e.id)::int AS cnt
    FROM public.users u
    JOIN public.events e ON e.created_at::date = v_today AND e.event_date >= v_today
      AND (
        EXISTS (SELECT 1 FROM public.artist_follows af WHERE af.user_id = u.user_id AND af.artist_id = e.artist_id)
        OR EXISTS (SELECT 1 FROM public.user_venue_relationships uvr WHERE uvr.user_id = u.user_id AND uvr.venue_id = e.venue_id)
      )
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = u.user_id AND n.type = 'follows_new_events_summary' AND n.created_at::date = v_today
    )
    GROUP BY u.user_id
  ) r;

  -- 2. "Your friends expressed interest in X new events today - don't let them go alone!"
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  SELECT r.user_id, 'friends_event_interest_summary',
    'Your friends are going to shows',
    CASE WHEN r.cnt = 1 THEN 'Your friends expressed interest in 1 new event today - don''t let them go alone!'
         ELSE 'Your friends expressed interest in ' || r.cnt || ' new events today - don''t let them go alone!' END,
    jsonb_build_object('count', r.cnt, 'date', v_today),
    false
  FROM (
    SELECT u.user_id, COUNT(DISTINCT uer.event_id)::int AS cnt
    FROM public.users u
    JOIN public.user_relationships ur ON (ur.user_id = u.user_id OR ur.related_user_id = u.user_id)
      AND ur.relationship_type = 'friend' AND ur.status = 'accepted'
    JOIN public.user_event_relationships uer ON uer.user_id = (
        CASE WHEN ur.user_id = u.user_id THEN ur.related_user_id ELSE ur.user_id END
      )
      AND uer.user_id != u.user_id
      AND uer.relationship_type IN ('going', 'maybe', 'interested')
      AND uer.created_at::date = v_today
    JOIN public.events e ON e.id = uer.event_id
      AND e.created_at::date = v_today
      AND e.event_date >= v_today
    WHERE NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.user_id = u.user_id AND n.type = 'friends_event_interest_summary' AND n.created_at::date = v_today
    )
    GROUP BY u.user_id
  ) r;

  -- 3. "Your bucket list artist/venue has a new event!" (or "X new events")
  INSERT INTO public.notifications (user_id, type, title, message, data, is_read)
  SELECT r.user_id, 'bucket_list_new_events_summary',
    'New events from your bucket list',
    CASE WHEN r.cnt = 1 THEN 'Your bucket list artist/venue has a new event!'
         ELSE 'Your bucket list has ' || r.cnt || ' new events today!' END,
    jsonb_build_object('count', r.cnt, 'date', v_today),
    false
  FROM (
    SELECT bl.user_id, COUNT(DISTINCT e.id)::int AS cnt
    FROM public.bucket_list bl
    JOIN public.entities ent ON ent.id = bl.entity_id
    JOIN public.events e ON (
      (ent.entity_type = 'artist' AND e.artist_id = ent.entity_uuid)
      OR (ent.entity_type = 'venue' AND e.venue_id = ent.entity_uuid)
    )
    WHERE e.created_at::date = v_today AND e.event_date >= v_today
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = bl.user_id AND n.type = 'bucket_list_new_events_summary' AND n.created_at::date = v_today
      )
    GROUP BY bl.user_id
  ) r;
END;
$$;

COMMENT ON FUNCTION public.send_daily_event_summary_notifications IS
  'Creates daily summary push notifications: follows new events, friends event interest, bucket list new events. Run via pg_cron or manually.';

-- ============================================
-- STEP 4: Schedule daily run via pg_cron (optional)
-- Enable pg_cron in Supabase Dashboard > Database > Extensions, then run:
--   SELECT cron.schedule('daily-event-summary-notifications', '0 9 * * *', 'SELECT public.send_daily_event_summary_notifications();');
-- ============================================

COMMIT;
