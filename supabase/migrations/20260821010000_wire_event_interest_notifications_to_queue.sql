-- Wires the live "notify friends of event interest" trigger into the burst
-- throttle/queue from 20260821000000_notification_burst_throttle.sql.
--
-- Confirmed via pg_get_functiondef (2026-08-21) that the function actually
-- firing today is public.notify_friend_event_interest() (singular "friend") —
-- triggered on public.user_event_relationships, matching the notification data
-- payload seen live (event_id/event_title/event_venue/event_date/event_artist/
-- user_name/interested_user_id). It also sets notifications.actor_user_id,
-- which queue_or_send_notification() didn't carry — added here so avatars/
-- profile links on these notifications (see NotificationItem.tsx,
-- NotificationsFeed.tsx) keep working once this routes through the queue.
--
-- Only the final INSERT INTO public.notifications is changed below, to a call
-- to queue_or_send_notification(). Everything else (event/user lookups, the
-- friend loop, the exact message text and data shape) is copied unchanged from
-- the live definition — this migration is the throttle wiring only, nothing
-- else.
--
-- Run this in the Supabase SQL editor, after 20260821000000_notification_
-- burst_throttle.sql.

ALTER TABLE public.notification_queue
  ADD COLUMN IF NOT EXISTS actor_user_id uuid;

-- Adding a 6th parameter changes the function's signature, which to Postgres
-- is a different function — CREATE OR REPLACE would leave the old 5-arg
-- version dangling as an unused overload rather than actually replacing it.
DROP FUNCTION IF EXISTS public.queue_or_send_notification(uuid, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.queue_or_send_notification(
  p_user_id uuid,
  p_type text,
  p_title text,
  p_message text,
  p_data jsonb DEFAULT '{}'::jsonb,
  p_actor_user_id uuid DEFAULT NULL
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
    INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
    VALUES (p_user_id, p_type, p_title, p_message, p_data, p_actor_user_id);
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

  INSERT INTO public.notification_queue (user_id, type, title, message, data, actor_user_id, scheduled_for)
  VALUES (p_user_id, p_type, p_title, p_message, p_data, p_actor_user_id, target_slot);
END;
$$;

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
    SELECT id, user_id, type, title, message, data, actor_user_id
    FROM public.notification_queue
    WHERE delivered_at IS NULL AND scheduled_for <= now()
    ORDER BY scheduled_for
    LIMIT p_batch_limit
    FOR UPDATE SKIP LOCKED
  ),
  inserted AS (
    INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
    SELECT user_id, type, title, message, data, actor_user_id FROM due
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

-- The actual wiring: same lookups/loop/message/data as the live function,
-- only the terminal INSERT is replaced.
CREATE OR REPLACE FUNCTION public.notify_friend_event_interest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  friend_record RECORD;
  event_title TEXT;
  user_name TEXT;
  event_venue TEXT;
  event_date TEXT;
  event_artist TEXT;
  event_id UUID;
BEGIN
  IF NEW.relationship_type NOT IN ('interested', 'going', 'maybe') THEN
    RETURN NEW;
  END IF;

  SELECT
    e.id,
    e.title,
    COALESCE(
      (SELECT v.name FROM public.venues v WHERE v.id = e.venue_id),
      e.venue_city || ', ' || e.venue_state,
      'Unknown Venue'
    ) as venue_name,
    e.event_date::text,
    COALESCE(
      (SELECT a.name FROM public.artists a WHERE a.id = e.artist_id),
      ''
    ) as artist_name
  INTO event_id, event_title, event_venue, event_date, event_artist
  FROM public.events e
  WHERE e.id = NEW.event_id;

  SELECT name INTO user_name
  FROM public.users
  WHERE user_id = NEW.user_id;

  IF event_title IS NULL OR user_name IS NULL THEN
    RETURN NEW;
  END IF;

  FOR friend_record IN
    SELECT
      CASE
        WHEN ur.user_id = NEW.user_id THEN ur.related_user_id
        ELSE ur.user_id
      END as friend_id
    FROM public.user_relationships ur
    WHERE (
      (ur.user_id = NEW.user_id AND ur.related_user_id != NEW.user_id)
      OR (ur.related_user_id = NEW.user_id AND ur.user_id != NEW.user_id)
    )
    AND ur.relationship_type = 'friend'
    AND ur.status = 'accepted'
  LOOP
    PERFORM public.queue_or_send_notification(
      friend_record.friend_id,
      'event_interest',
      'Friend Interested in Event!',
      COALESCE(user_name, 'Your friend') || ' is interested in "' || event_title || '" at ' || COALESCE(event_venue, 'a venue'),
      jsonb_build_object(
        'interested_user_id', NEW.user_id,
        'event_id', event_id,
        'event_title', event_title,
        'event_venue', event_venue,
        'event_date', event_date,
        'event_artist', event_artist,
        'user_name', user_name
      ),
      NEW.user_id
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

-- VERIFY: confirm the function picked up the change.
SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'notify_friend_event_interest';
