-- =============================================================================
-- 01 — send_event_reminders(): day-after reminder gated to GOING only
-- =============================================================================
-- RUN THIS FILE WHOLE. It is ONE statement, so the Supabase editor's implicit
-- transaction wrapper cannot half-apply it. Do not paste it together with 02.
--
-- WHAT CHANGES
--   The day-after 'event_reminder_day_after' notification currently fires for
--   every user_event_relationships row with relationship_type IN
--   ('interested','going','maybe'). "Interested" is a bookmark, not a
--   commitment — asking those users how the show was is the noise being fixed.
--   After this file the day-after block fires ONLY for relationship_type='going'.
--
--   The three upcoming reminders (1 week / 3 days / 1 day) are UNCHANGED and
--   still cover interested/going/maybe.
--
--   Also adds artist_id + venue_id to the notification's data jsonb so the
--   clients can open the review composer prefilled instead of dumping the user
--   on the event page. (reviews.event_id is always null in this schema — the
--   composer resolves by artist_id / venue_id / date.)
--
-- SAFETY: replaces one function. No schema change, no constraint change, no
--   cron change, no data touched. Idempotent.
--
-- AFTER RUNNING: run 03_verify.READONLY.sql. Expect going_gate_pos > 0 and
--   old_copy_pos = 0. Only then run 02_cleanup.REVIEW.sql.
--
-- ROLLBACK: re-apply the function from
--   supabase/notification-generation-2026-07-19/03_event_reminders_fix_and_schedule.sql
-- =============================================================================
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
  -- Upcoming reminders (1 week / 3 days / 1 day) — UNCHANGED gating
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
