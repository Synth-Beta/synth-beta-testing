-- Remove the 3-day "Event in 3 Days!" reminder for interested/going events.
-- Users found 1 week + 3 days + 1 day too much; the 1-week and day-before
-- reminders and the day-after "How was the show?" (going only) are unchanged.
--
-- Based on the live definition (supabase/day-after-going-only-2026-09-06/
-- 01_function.REVIEW.sql, confirmed live 2026-10-17 by its notification data
-- keys and copy). Only the 3-day branch is removed. No schema/cron change.
-- 'event_reminder_3_days' stays in notifications_type_check so old rows remain valid.
--
-- ROLLBACK: re-apply supabase/day-after-going-only-2026-09-06/01_function.REVIEW.sql
--
-- Run this in the Supabase SQL editor (one statement).

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
  v_reminder_type    TEXT;
  days_until_event   INTEGER;
BEGIN
  -- Upcoming reminders: 1 week + 1 day (3-day reminder removed 2026-10-17: too much)
  FOR interest_record IN
    SELECT uer.user_id, uer.event_id
    FROM public.user_event_relationships uer
    WHERE uer.relationship_type IN ('interested', 'going', 'maybe')
  LOOP
    SELECT e.id, e.title,
      COALESCE((SELECT v.name FROM public.venues v WHERE v.id = e.venue_id),
               e.venue_city || ', ' || e.venue_state, 'Unknown Venue') AS venue_name,
      e.event_date, e.artist_id, e.venue_id,
      COALESCE((SELECT a.name FROM public.artists a WHERE a.id = e.artist_id), '') AS artist_name
    INTO event_record
    FROM public.events e
    WHERE e.id = interest_record.event_id
      AND e.event_date >= now()
      AND e.event_date <= (now() + interval '8 days');

    CONTINUE WHEN event_record IS NULL;

    days_until_event := EXTRACT(EPOCH FROM (event_record.event_date - now())) / 86400;

    IF    days_until_event >= 7 AND days_until_event < 8 THEN v_reminder_type := 'event_reminder_1_week';
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
        WHEN 'event_reminder_1_day'  THEN 'Event Tomorrow! 🎵'
        ELSE 'Event Reminder'
      END,
      '"' || event_record.title || '" at ' || event_record.venue_name ||
      CASE v_reminder_type
        WHEN 'event_reminder_1_week' THEN ' is in 1 week!'
        WHEN 'event_reminder_1_day'  THEN ' is tomorrow!'
        ELSE ''
      END,
      jsonb_build_object(
        'event_id', event_record.id, 'event_title', event_record.title,
        'event_venue', event_record.venue_name, 'event_date', event_record.event_date,
        'event_artist', event_record.artist_name,
        'artist_id', event_record.artist_id, 'venue_id', event_record.venue_id,
        'reminder_type', v_reminder_type)
    )
    RETURNING id INTO notification_id;

    INSERT INTO public.event_reminders_sent (user_id, event_id, reminder_type, notification_id)
    VALUES (interest_record.user_id, event_record.id, v_reminder_type, notification_id);

    notification_count := notification_count + 1;
  END LOOP;

  -- Day-after "how was it?" — GOING ONLY (was: interested/going/maybe)
  FOR interest_record IN
    SELECT uer.user_id, uer.event_id
    FROM public.user_event_relationships uer
    WHERE uer.relationship_type = 'going'
  LOOP
    SELECT e.id, e.title,
      COALESCE((SELECT v.name FROM public.venues v WHERE v.id = e.venue_id),
               e.venue_city || ', ' || e.venue_state, 'Unknown Venue') AS venue_name,
      e.event_date, e.artist_id, e.venue_id,
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

    IF EXISTS (
      SELECT 1 FROM public.reviews r
      WHERE r.user_id = interest_record.user_id
        AND r.event_id = interest_record.event_id
    ) THEN CONTINUE; END IF;

    INSERT INTO public.notifications (user_id, type, title, message, data)
    VALUES (
      interest_record.user_id, v_reminder_type,
      'How was the show? ⭐',
      'You said you were going to "' || event_record.title || '" at ' ||
        event_record.venue_name || '. How was it?',
      jsonb_build_object(
        'event_id', event_record.id, 'event_title', event_record.title,
        'event_venue', event_record.venue_name, 'event_date', event_record.event_date,
        'event_artist', event_record.artist_name,
        'artist_id', event_record.artist_id, 'venue_id', event_record.venue_id,
        'reminder_type', v_reminder_type)
    )
    RETURNING id INTO notification_id;

    INSERT INTO public.event_reminders_sent (user_id, event_id, reminder_type, notification_id)
    VALUES (interest_record.user_id, event_record.id, v_reminder_type, notification_id);

    notification_count := notification_count + 1;
  END LOOP;

  RETURN QUERY SELECT notification_count, reminder_summary;
END;
$function$;
