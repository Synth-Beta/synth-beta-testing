-- Passport stamps: make the trigger actually create stamps. 2026-09-24.
-- REVIEW ONLY, NOT APPLIED.
--
-- trigger_auto_unlock_passport_on_review has been attached and enabled the
-- whole time. The body looked the review's event up with
-- `WHERE e.id = NEW.event_id`, but reviews.event_id is always NULL here, so
-- v_event_data never matched and every unlock_* call was skipped. Stamps stop
-- at 2026-01-18, when reviews moved to artist_id / venue_id.
--
-- This rewrite reads artist/venue off the review itself and keeps the event
-- join only as a fallback for rows that do carry an event_id.

CREATE OR REPLACE FUNCTION public.auto_unlock_passport_on_review()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_artist_id   uuid;
  v_venue_id    uuid;
  v_artist_name text;
  v_venue_name  text;
  v_city        text;
  v_state       text;
  v_title       text;
  v_is_festival boolean := false;
BEGIN
  IF NEW.is_draft IS DISTINCT FROM false THEN
    RETURN NEW;
  END IF;
  IF NOT (NEW.was_there = true OR NEW.review_text IS NOT NULL) THEN
    RETURN NEW;
  END IF;

  v_artist_id := NEW.artist_id;
  v_venue_id  := NEW.venue_id;

  -- Fallback for legacy rows that still carry an event_id.
  IF v_artist_id IS NULL AND v_venue_id IS NULL AND NEW.event_id IS NOT NULL THEN
    SELECT e.artist_id, e.venue_id, e.title
      INTO v_artist_id, v_venue_id, v_title
    FROM public.events e
    WHERE e.id = NEW.event_id;
  END IF;

  IF v_artist_id IS NOT NULL THEN
    SELECT a.name INTO v_artist_name
    FROM public.artists a WHERE a.id = v_artist_id;
  END IF;

  IF v_venue_id IS NOT NULL THEN
    SELECT v.name, v.city, v.state INTO v_venue_name, v_city, v_state
    FROM public.venues v WHERE v.id = v_venue_id;
  END IF;

  -- City comes from the venue now; reviews have no venue_city column.
  IF v_city IS NOT NULL AND lower(trim(v_city)) <> 'unknown' AND trim(v_city) <> '' THEN
    PERFORM public.unlock_passport_city(NEW.user_id, v_city, v_state);
  END IF;

  -- ::text deliberately selects the TEXT overload of unlock_passport_venue.
  -- The uuid overload writes entity_id only and uses a different conflict key,
  -- so mixing the two produces two stamps for one venue. The text overload
  -- also records entity_uuid, which is what the rarity join needs.
  IF v_venue_id IS NOT NULL AND v_venue_name IS NOT NULL THEN
    PERFORM public.unlock_passport_venue(NEW.user_id, v_venue_id::text, v_venue_name);
  END IF;

  IF v_artist_id IS NOT NULL AND v_artist_name IS NOT NULL THEN
    PERFORM public.unlock_passport_artist(NEW.user_id, v_artist_id::text, v_artist_name);
  END IF;

  v_is_festival := coalesce(v_venue_name, '') ~* '(festival|fest|gathering|fair)'
                OR coalesce(v_title, '')      ~* '(festival|fest)';
  IF v_is_festival THEN
    PERFORM public.detect_festival_stamps(NEW.user_id);
  END IF;

  -- detect_first_time_city(user, event_id) is dropped: it took NEW.event_id,
  -- which is always NULL. Re-add only if it gains an artist/venue signature.

  PERFORM public.calculate_artist_milestones(NEW.user_id);

  IF NEW.review_text IS NOT NULL AND NEW.review_text <> 'ATTENDANCE_ONLY' THEN
    PERFORM public.detect_deep_cut_reviewer(NEW.user_id);
  END IF;

  PERFORM public.check_all_achievements(NEW.user_id);

  RETURN NEW;
END;
$function$;

-- Verify: should now report artist/venue/city stamps for a recent reviewer.
-- SELECT type, count(*) FROM public.passport_entries GROUP BY type;
