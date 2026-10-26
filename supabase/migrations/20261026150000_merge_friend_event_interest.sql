-- Fold a friend's event-interest notifications into one.
--
-- Before: Sam hearts 3 shows -> 3 separate "Friend Interested in Event!" rows (and pushes).
-- The burst throttle only queues after 2 per 10 minutes, so small bursts all got through.
-- After: if the recipient already has an UNREAD event_interest from the same friend in the
-- last 6 hours, the new show is appended to that row instead of inserting a new one:
--   "Sam Loiterstein is interested in 3 shows: Lola Young at The Anthem, Lake Street Dive
--    at The Anthem and 1 more"
-- The merged row is bumped to the top but sends NO extra push (push fires on INSERT only).
-- Once the recipient reads it, the next interest starts a fresh notification.
--
-- Also fixes the doubled venue: event titles already read "Artist at Venue", and the old
-- message appended ' at <venue>' again ("Lola Young at The Anthem" at The Anthem).
--
-- Implemented as BEFORE INSERT on notifications so it covers every path that creates
-- event_interest rows (direct insert, queue_or_send_notification, queue release) without
-- touching notify_friend_event_interest(), whose live body is not fully known from the repo.
--
-- Multi-show rows drop data.event_id, so tapping opens the friend's profile
-- (packages/synth-shared/src/notificationNavigation.ts).
--
-- Run in the Supabase SQL editor.

CREATE OR REPLACE FUNCTION public.merge_friend_event_interest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := COALESCE(NULLIF(NEW.data->>'user_name', ''), 'Your friend');
  v_title text := COALESCE(NEW.data->>'event_title', 'a show');
  v_venue text := NULLIF(NEW.data->>'event_venue', '');
  v_label text;
  v_existing public.notifications%ROWTYPE;
  v_events jsonb;
  v_count int;
  v_list text;
BEGIN
  IF NEW.type IS DISTINCT FROM 'event_interest' THEN
    RETURN NEW;
  END IF;

  v_label := CASE
    WHEN v_venue IS NULL OR position(lower(v_venue) IN lower(v_title)) > 0 THEN v_title
    ELSE v_title || ' at ' || v_venue
  END;

  SELECT * INTO v_existing
  FROM public.notifications n
  WHERE n.user_id = NEW.user_id
    AND n.type = 'event_interest'
    AND n.is_read IS NOT TRUE
    AND n.created_at > now() - interval '6 hours'
    AND (n.actor_user_id = NEW.actor_user_id
      OR n.data->>'interested_user_id' = NEW.data->>'interested_user_id')
  ORDER BY n.created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    NEW.message := v_name || ' is interested in "' || v_label || '"';
    NEW.data := COALESCE(NEW.data, '{}'::jsonb)
      || jsonb_build_object('events', jsonb_build_array(
           jsonb_build_object('event_id', NEW.data->>'event_id', 'label', v_label)));
    RETURN NEW;
  END IF;

  -- rows created before this migration have no events array yet
  v_events := COALESCE(
    v_existing.data->'events',
    jsonb_build_array(jsonb_build_object(
      'event_id', v_existing.data->>'event_id',
      'label', COALESCE(v_existing.data->>'event_title', 'a show')))
  );

  -- same show again (un-heart / re-heart): nothing new to say
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(v_events) e
    WHERE e->>'event_id' = NEW.data->>'event_id'
  ) THEN
    RETURN NULL;
  END IF;

  v_events := v_events || jsonb_build_array(
    jsonb_build_object('event_id', NEW.data->>'event_id', 'label', v_label));
  v_count := jsonb_array_length(v_events);

  -- newest first, two names max
  SELECT string_agg(e->>'label', ', ' ORDER BY ord DESC)
  INTO v_list
  FROM (
    SELECT e, ord FROM jsonb_array_elements(v_events) WITH ORDINALITY AS t(e, ord)
    ORDER BY ord DESC
    LIMIT 2
  ) newest;

  UPDATE public.notifications
  SET title = 'Friend Interested in ' || v_count || ' Shows',
      message = v_name || ' is interested in ' || v_count || ' shows: ' || v_list
        || CASE WHEN v_count > 2 THEN ' and ' || (v_count - 2) || ' more' ELSE '' END,
      data = (v_existing.data - 'event_id')
        || jsonb_build_object('events', v_events, 'event_count', v_count),
      created_at = now()
  WHERE id = v_existing.id;

  RETURN NULL; -- merged; skip the new row
EXCEPTION WHEN others THEN
  -- never lose the notification over a merge bug
  RAISE WARNING 'merge_friend_event_interest failed: %', SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_merge_friend_event_interest ON public.notifications;
CREATE TRIGGER trg_merge_friend_event_interest
  BEFORE INSERT ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.merge_friend_event_interest();
