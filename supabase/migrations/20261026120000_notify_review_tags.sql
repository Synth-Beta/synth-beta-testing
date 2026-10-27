-- Notify friends tagged in a review, server-side.
--
-- Until now web (reviewService.ts) and mobile (eventReviewSubmitService.ts) inserted the
-- friend_tagged_in_review row straight from the reviewer's client. public.notifications
-- only has SELECT/UPDATE policies for users (see perf-review-2026-07-12/02), so that
-- insert for SOMEONE ELSE was always rejected by RLS and swallowed as a console.warn.
-- Nobody tagged in a review has ever been notified.
--
-- This trigger does it as SECURITY DEFINER, the same way notify_friend_event_interest()
-- does. Rules:
--   * only published reviews (is_draft is not true)
--   * only users newly tagged by this write (an edit does not re-notify old tags;
--     publishing a draft notifies everyone on it)
--   * only accepted friends of the reviewer - the client picks the attendee list, so the
--     server must not let it notify arbitrary user ids
--   * never blocks the review save: any failure is logged as a WARNING and swallowed
--
-- The payload matches what the client used to send, so the existing tap routing
-- (packages/synth-shared/src/notificationNavigation.ts -> /review-compose prefilled) works.
--
-- Run in the Supabase SQL editor.

-- reviews.attendees is text[]; tagged users are JSON strings like
-- {"type":"user","user_id":"...","name":"..."}. Bad elements are skipped, not fatal.
CREATE OR REPLACE FUNCTION public.review_tagged_user_ids(p_attendees text[])
RETURNS SETOF uuid
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  a text;
  j jsonb;
BEGIN
  IF p_attendees IS NULL THEN
    RETURN;
  END IF;
  FOREACH a IN ARRAY p_attendees LOOP
    BEGIN
      j := a::jsonb;
      IF j->>'type' = 'user' AND j ? 'user_id' THEN
        RETURN NEXT (j->>'user_id')::uuid;
      END IF;
    EXCEPTION WHEN others THEN
      -- not JSON / not a uuid: plain-text attendee, ignore
    END;
  END LOOP;
END;
$$;

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
      -- already notified for this review: tagged before this write on a published review
      AND NOT (
        TG_OP = 'UPDATE'
        AND OLD.is_draft IS NOT TRUE
        AND t IN (SELECT public.review_tagged_user_ids(OLD.attendees))
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

DROP TRIGGER IF EXISTS trg_notify_review_tags ON public.reviews;
CREATE TRIGGER trg_notify_review_tags
  AFTER INSERT OR UPDATE OF attendees, is_draft ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_review_tags();

-- VERIFY (read-only): parser handles the stored shape and junk.
SELECT public.review_tagged_user_ids(ARRAY[
  '{"type":"user","user_id":"00000000-0000-0000-0000-000000000001","name":"A"}',
  '{"type":"phone","phone":"555"}',
  'plain text name',
  '{"type":"user","user_id":"not-a-uuid"}'
]) AS should_return_exactly_one_row;
