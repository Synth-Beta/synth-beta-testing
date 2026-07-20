-- =============================================================================
-- 03 — Event reminders: fix + schedule  (1-week / 3-day / 1-day / day-after)
-- =============================================================================
-- WHY: send_event_reminders() exists and is mostly current-schema, but it never
-- ran and had two defects that would make it error or misbehave:
--   (a) It reads public.user_reviews (DELETED table) in the "day-after / how was it?"
--       block -> the function would ERROR at runtime. Current table is public.reviews.
--   (b) The dedup check `... AND reminder_type = reminder_type` compares the loop
--       VARIABLE to itself (variable shadows the column) -> always TRUE -> once ANY
--       reminder was recorded for a user+event, NO further reminder types could send.
--       Fixed by renaming the variable to v_reminder_type so the column is compared.
--   (c) Its reminder types (event_reminder_1_week/3_days/1_day/day_after) are NOT in
--       notifications_type_check -> every insert would violate the constraint. We add
--       them (additive; all existing rows still satisfy the check).
-- Then it's scheduled on pg_cron like the daily summary already is.
-- Dedup is via event_reminders_sent, so re-runs never double-send.
--
-- SAFETY: extends a CHECK constraint (additive), replaces one function, adds one cron
-- job. No app data modified. Idempotent. Review, then apply yourself.
-- =============================================================================
SET statement_timeout = '120s';

-- ---- (c) Allow the reminder notification types ------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (
  type = ANY (ARRAY[
    'friend_request','friend_accepted','match','message','chat_message',
    'review_liked','review_commented','comment_replied','event_interest',
    'artist_followed','artist_new_event','venue_new_event','bucket_list_new_event',
    'friend_tagged_in_review','follows_new_events_summary',
    'friends_event_interest_summary','bucket_list_new_events_summary',
    -- newly allowed (event reminders):
    'event_reminder_1_week','event_reminder_3_days','event_reminder_1_day','event_reminder_day_after'
  ]::text[])
);

-- ---- (a)+(b) Corrected function --------------------------------------------
CREATE OR REPLACE FUNCTION public.send_event_reminders()
RETURNS TABLE(notifications_sent integer, reminders_sent jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  notification_count INTEGER := 0;
  reminder_summary   JSONB := '[]'::JSONB;
  interest_record    RECORD;
  event_record       RECORD;
  notification_id    UUID;
  v_reminder_type    TEXT;   -- renamed from reminder_type (was shadowing the column)
  days_until_event   INTEGER;
BEGIN
  -- Upcoming reminders (1 week / 3 days / 1 day)
  FOR interest_record IN
    SELECT uer.user_id, uer.event_id
    FROM public.user_event_relationships uer
    WHERE uer.relationship_type IN ('interested', 'going', 'maybe')
  LOOP
    SELECT e.id, e.title,
      COALESCE((SELECT v.name FROM public.venues v WHERE v.id = e.venue_id),
               e.venue_city || ', ' || e.venue_state, 'Unknown Venue') AS venue_name,
      e.event_date,
      COALESCE((SELECT a.name FROM public.artists a WHERE a.id = e.artist_id), '') AS artist_name
    INTO event_record
    FROM public.events e
    WHERE e.id = interest_record.event_id
      AND e.event_date >= now()
      AND e.event_date <= (now() + interval '8 days');

    CONTINUE WHEN event_record IS NULL;

    days_until_event := EXTRACT(EPOCH FROM (event_record.event_date - now())) / 86400;

    IF    days_until_event >= 7 AND days_until_event < 8 THEN v_reminder_type := 'event_reminder_1_week';
    ELSIF days_until_event >= 3 AND days_until_event < 4 THEN v_reminder_type := 'event_reminder_3_days';
    ELSIF days_until_event >= 1 AND days_until_event < 2 THEN v_reminder_type := 'event_reminder_1_day';
    ELSE  CONTINUE;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.event_reminders_sent ers
      WHERE ers.user_id = interest_record.user_id
        AND ers.event_id = interest_record.event_id
        AND ers.reminder_type = v_reminder_type
    ) THEN CONTINUE; END IF;

    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      interest_record.user_id, v_reminder_type,
      CASE v_reminder_type
        WHEN 'event_reminder_1_week' THEN 'Event in 1 Week! 🎵'
        WHEN 'event_reminder_3_days' THEN 'Event in 3 Days! 🎵'
        WHEN 'event_reminder_1_day'  THEN 'Event Tomorrow! 🎵'
        ELSE 'Event Reminder'
      END,
      '"' || event_record.title || '" at ' || event_record.venue_name ||
      CASE v_reminder_type
        WHEN 'event_reminder_1_week' THEN ' is in 1 week!'
        WHEN 'event_reminder_3_days' THEN ' is in 3 days!'
        WHEN 'event_reminder_1_day'  THEN ' is tomorrow!'
        ELSE ''
      END,
      jsonb_build_object(
        'event_id', event_record.id, 'event_title', event_record.title,
        'event_venue', event_record.venue_name, 'event_date', event_record.event_date,
        'event_artist', event_record.artist_name, 'reminder_type', v_reminder_type)
    )
    RETURNING id INTO notification_id;

    INSERT INTO public.event_reminders_sent (user_id, event_id, reminder_type, notification_id)
    VALUES (interest_record.user_id, event_record.id, v_reminder_type, notification_id);

    notification_count := notification_count + 1;
  END LOOP;

  -- Day-after "how was it?" reminders (only if the user hasn't reviewed it)
  FOR interest_record IN
    SELECT uer.user_id, uer.event_id
    FROM public.user_event_relationships uer
    WHERE uer.relationship_type IN ('interested', 'going', 'maybe')
  LOOP
    SELECT e.id, e.title,
      COALESCE((SELECT v.name FROM public.venues v WHERE v.id = e.venue_id),
               e.venue_city || ', ' || e.venue_state, 'Unknown Venue') AS venue_name,
      e.event_date,
      COALESCE((SELECT a.name FROM public.artists a WHERE a.id = e.artist_id), '') AS artist_name
    INTO event_record
    FROM public.events e
    WHERE e.id = interest_record.event_id
      AND e.event_date >= (now() - interval '2 days')
      AND e.event_date <  (now() - interval '1 day');

    CONTINUE WHEN event_record IS NULL;

    v_reminder_type := 'event_reminder_day_after';

    IF EXISTS (
      SELECT 1 FROM public.event_reminders_sent ers
      WHERE ers.user_id = interest_record.user_id
        AND ers.event_id = interest_record.event_id
        AND ers.reminder_type = v_reminder_type
    ) THEN CONTINUE; END IF;

    -- FIXED: public.reviews (was public.user_reviews, which no longer exists)
    IF EXISTS (
      SELECT 1 FROM public.reviews r
      WHERE r.user_id = interest_record.user_id
        AND r.event_id = interest_record.event_id
    ) THEN CONTINUE; END IF;

    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      interest_record.user_id, v_reminder_type,
      'How was the event? ⭐',
      'You were interested in "' || event_record.title || '" at ' || event_record.venue_name || '. How was it?',
      jsonb_build_object(
        'event_id', event_record.id, 'event_title', event_record.title,
        'event_venue', event_record.venue_name, 'event_date', event_record.event_date,
        'event_artist', event_record.artist_name, 'reminder_type', v_reminder_type)
    )
    RETURNING id INTO notification_id;

    INSERT INTO public.event_reminders_sent (user_id, event_id, reminder_type, notification_id)
    VALUES (interest_record.user_id, event_record.id, v_reminder_type, notification_id);

    notification_count := notification_count + 1;
  END LOOP;

  RETURN QUERY SELECT notification_count, reminder_summary;
END;
$function$;

-- ---- Schedule daily (once/day catches each event as it enters a window) -----
DO $$
BEGIN
  PERFORM cron.unschedule('event-reminders') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='event-reminders');
END $$;
SELECT cron.schedule('event-reminders', '0 15 * * *', $$SELECT public.send_event_reminders();$$);
--                                        ^ 15:00 UTC (~10a ET / 7a PT). Adjust to taste.

-- ---- VERIFY -----------------------------------------------------------------
SELECT
  (SELECT count(*) FROM cron.job WHERE jobname='event-reminders') AS cron_expect_1,
  (SELECT count(*) FROM pg_constraint
     WHERE conname='notifications_type_check'
       AND pg_get_constraintdef(oid) ILIKE '%event_reminder_1_week%') AS constraint_has_reminders_expect_1;

-- Dry-run once now (safe; dedups via event_reminders_sent):
--   SELECT * FROM public.send_event_reminders();

-- ROLLBACK:
--   SELECT cron.unschedule('event-reminders');
--   (optionally revert the function/constraint to their prior definitions)
