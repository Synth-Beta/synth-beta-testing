-- Fix for 20261026120000_notify_review_tags.sql.
--
-- Bug: "don't re-notify" was decided by comparing OLD.attendees to NEW.attendees. Anyone
-- tagged BEFORE the trigger existed counted as already notified, so they never were
-- (seen live: Sam tagged on two published reviews, are_friends = true, notification_sent = false).
-- Fix: dedup on what was actually sent - skip only if a friend_tagged_in_review row for this
-- review + user already exists.
--
-- Also backfills: notifies tagged friends on reviews published in the last 7 days that
-- never got their notification.
--
-- Run in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.notify_review_tags()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_name text;
  v_artist_name text;
  v_venue_name text;
  v_event_desc text;
  v_friend uuid;
BEGIN
  IF NEW.is_draft IS TRUE THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_actor_name FROM public.users WHERE user_id = NEW.user_id;
  SELECT name INTO v_artist_name FROM public.artists WHERE id = NEW.artist_id;
  SELECT name INTO v_venue_name FROM public.venues WHERE id = NEW.venue_id;
  v_event_desc := COALESCE(NULLIF(concat_ws(' at ', v_artist_name, v_venue_name), ''), 'a show');

  FOR v_friend IN
    SELECT DISTINCT t
    FROM public.review_tagged_user_ids(NEW.attendees) t
    WHERE t <> NEW.user_id
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.user_id = t
          AND n.type = 'friend_tagged_in_review'
          AND n.data->>'review_id' = NEW.id::text
      )
      AND EXISTS (
        SELECT 1 FROM public.user_relationships ur
        WHERE ur.relationship_type = 'friend'
          AND ur.status = 'accepted'
          AND ((ur.user_id = NEW.user_id AND ur.related_user_id = t)
            OR (ur.related_user_id = NEW.user_id AND ur.user_id = t))
      )
  LOOP
    INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
    VALUES (
      v_friend,
      'friend_tagged_in_review',
      'You were tagged in a review',
      COALESCE(v_actor_name, 'A friend') || ' tagged you in their review of ' || v_event_desc || '. Write your own review!',
      jsonb_build_object(
        'review_id', NEW.id,
        'artist_id', NEW.artist_id,
        'artist_name', v_artist_name,
        'venue_id', NEW.venue_id,
        'venue_name', v_venue_name,
        'Event_date', NEW."Event_date",
        'actor_user_id', NEW.user_id,
        'actor_name', v_actor_name
      ),
      NEW.user_id
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'notify_review_tags failed for review %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

-- Backfill: tagged friends on recent published reviews who were never notified.
INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
SELECT
  t,
  'friend_tagged_in_review',
  'You were tagged in a review',
  COALESCE(u.name, 'A friend') || ' tagged you in their review of '
    || COALESCE(NULLIF(concat_ws(' at ', a.name, v.name), ''), 'a show') || '. Write your own review!',
  jsonb_build_object(
    'review_id', r.id,
    'artist_id', r.artist_id,
    'artist_name', a.name,
    'venue_id', r.venue_id,
    'venue_name', v.name,
    'Event_date', r."Event_date",
    'actor_user_id', r.user_id,
    'actor_name', u.name
  ),
  r.user_id
FROM public.reviews r
CROSS JOIN LATERAL (SELECT DISTINCT t FROM public.review_tagged_user_ids(r.attendees) t) tags
LEFT JOIN public.users u ON u.user_id = r.user_id
LEFT JOIN public.artists a ON a.id = r.artist_id
LEFT JOIN public.venues v ON v.id = r.venue_id
WHERE r.is_draft IS NOT TRUE
  AND r.created_at > now() - interval '7 days'
  AND tags.t <> r.user_id
  AND NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = tags.t AND n.type = 'friend_tagged_in_review'
      AND n.data->>'review_id' = r.id::text
  )
  AND EXISTS (
    SELECT 1 FROM public.user_relationships ur
    WHERE ur.relationship_type = 'friend' AND ur.status = 'accepted'
      AND ((ur.user_id = r.user_id AND ur.related_user_id = tags.t)
        OR (ur.related_user_id = r.user_id AND ur.user_id = tags.t))
  )
RETURNING user_id, data->>'review_id' AS review_id, message;
