-- Replay the stamps 8 months of reviews should have created. 2026-09-24.
-- REVIEW ONLY, NOT APPLIED. Run AFTER 03_fix_stamp_trigger.sql.
--
-- Scope (measured): 55 published reviews, 8 users, 43 artists, 32 venues,
-- 0 rows without an artist or venue. Expect roughly 75-110 new stamps.
--
-- NOTE: do NOT backfill by touching the reviews rows (e.g.
-- `UPDATE reviews SET updated_at = updated_at`). `reviews` carries 12 triggers
-- including trigger_log_review_posted and the achievement/signal triggers —
-- a mass update would replay notifications and preference signals for every
-- historical review. This calls only the unlock_* functions.

CREATE OR REPLACE FUNCTION public.backfill_passport_stamps()
 RETURNS TABLE(reviews_processed integer, stamps_before integer, stamps_after integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  r             RECORD;
  v_before      integer;
  v_after       integer;
  v_count       integer := 0;
  v_artist_name text;
  v_venue_name  text;
  v_city        text;
  v_state       text;
BEGIN
  SELECT count(*) INTO v_before FROM public.passport_entries;

  FOR r IN
    SELECT user_id, artist_id, venue_id
    FROM public.reviews
    WHERE is_draft = false
      AND (artist_id IS NOT NULL OR venue_id IS NOT NULL)
  LOOP
    v_artist_name := NULL; v_venue_name := NULL; v_city := NULL; v_state := NULL;

    IF r.artist_id IS NOT NULL THEN
      SELECT a.name INTO v_artist_name FROM public.artists a WHERE a.id = r.artist_id;
      IF v_artist_name IS NOT NULL THEN
        PERFORM public.unlock_passport_artist(r.user_id, r.artist_id::text, v_artist_name);
      END IF;
    END IF;

    IF r.venue_id IS NOT NULL THEN
      SELECT v.name, v.city, v.state INTO v_venue_name, v_city, v_state
      FROM public.venues v WHERE v.id = r.venue_id;

      IF v_venue_name IS NOT NULL THEN
        PERFORM public.unlock_passport_venue(r.user_id, r.venue_id::text, v_venue_name);
      END IF;
      IF v_city IS NOT NULL AND lower(trim(v_city)) <> 'unknown' AND trim(v_city) <> '' THEN
        PERFORM public.unlock_passport_city(r.user_id, v_city, v_state);
      END IF;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  SELECT count(*) INTO v_after FROM public.passport_entries;
  RETURN QUERY SELECT v_count, v_before, v_after;
END;
$function$;

REVOKE ALL ON FUNCTION public.backfill_passport_stamps() FROM PUBLIC;

-- Dry run first: how many users/entities are eligible?
SELECT count(DISTINCT user_id) AS users,
       count(DISTINCT artist_id) FILTER (WHERE artist_id IS NOT NULL) AS artists,
       count(DISTINCT venue_id)  FILTER (WHERE venue_id  IS NOT NULL) AS venues
FROM public.reviews WHERE is_draft = false;

-- Then run it (idempotent: every unlock_* is insert-or-ignore, so re-running
-- creates nothing new).
-- SELECT * FROM public.backfill_passport_stamps();

-- Then recompute achievements for the users who just gained stamps.
-- SELECT public.recalculate_all_passport_data();

-- Verify:
-- SELECT type, rarity, count(*) FROM public.passport_entries_with_rarity
-- GROUP BY type, rarity ORDER BY type, rarity;
