-- Unblock passport_entries inserts. 2026-09-27. REVIEW ONLY, NOT APPLIED.
--
-- auto_update_scene_progress() reads NEW.is_draft, NEW.event_id, NEW.artist_id
-- and NEW.user_created_artist_id -- all columns of `reviews`. It is attached to
-- BOTH reviews and passport_entries, and the passport_entries trigger has no
-- WHEN clause, so every stamp insert raises 42703 and rolls back. No stamp has
-- ever been written through that path.
--
-- TWO FIXES, because either alone leaves a trap:
--   1. Drop the passport_entries trigger. It is redundant: every stamp is
--      created by a review, and trigger_auto_update_scene_progress_review
--      already computes scene progress from that same review's artist/venue.
--      The stamp row adds no signal the review did not already carry.
--   2. Make the function refuse to run on any table but reviews, so
--      re-attaching it elsewhere fails safe instead of blocking writes.
--
-- Not attempting to make scene progress work FROM stamps. Scenes are currently
-- a dead feature (no 'scene' stamps exist, and scene_explorer / scene_regular /
-- era_walker are seeded inactive in 16). Wiring that is a product decision, not
-- part of unblocking stamps.

-- 1. The redundant trigger goes.
DROP TRIGGER IF EXISTS trigger_auto_update_scene_progress_passport
  ON public.passport_entries;

-- 2. Guard the function. One early return; the rest of the body is untouched.
CREATE OR REPLACE FUNCTION public.auto_update_scene_progress()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_user_id UUID;
  v_scene_ids UUID[];
  v_artist_venue_ids RECORD;
BEGIN
  -- This body reads is_draft / event_id / artist_id / user_created_artist_id,
  -- which only exist on `reviews`. Attached to any other table it raises 42703
  -- and blocks that table's writes -- which is exactly what it did to
  -- passport_entries. Fail safe instead.
  IF TG_TABLE_NAME <> 'reviews' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'DELETE') THEN
    SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
    FROM public.scene_participants sp
    WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
    AND (
      (sp.participant_type = 'artist' AND sp.artist_id IS NOT NULL AND (
        (OLD.event_id IS NOT NULL AND sp.artist_id IN (SELECT e.artist_id FROM public.events e WHERE e.id = OLD.event_id))
        OR (OLD.event_id IS NULL AND sp.artist_id = COALESCE(OLD.artist_id, OLD.user_created_artist_id))
      )) OR
      (sp.participant_type = 'venue' AND sp.venue_id IS NOT NULL AND (
        (OLD.event_id IS NOT NULL AND sp.venue_id IN (SELECT e.venue_id FROM public.events e WHERE e.id = OLD.event_id))
        OR (OLD.event_id IS NULL AND sp.venue_id = OLD.venue_id)
      ))
    );
  ELSIF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_draft = false THEN
    IF NEW.event_id IS NOT NULL THEN
      SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
      FROM public.scene_participants sp
      JOIN public.events e ON e.id = NEW.event_id
      WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
      AND (
        (sp.participant_type = 'artist' AND sp.artist_id IS NOT NULL AND sp.artist_id = e.artist_id) OR
        (sp.participant_type = 'venue' AND sp.venue_id IS NOT NULL AND sp.venue_id = e.venue_id) OR
        (sp.participant_type = 'city' AND e.venue_city = sp.text_value) OR
        (sp.participant_type = 'genre' AND e.genres IS NOT NULL AND e.genres @> ARRAY[sp.text_value])
      );
    ELSE
      SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
      FROM public.scene_participants sp
      WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
      AND (
        (sp.participant_type = 'artist' AND sp.artist_id IS NOT NULL AND sp.artist_id = COALESCE(NEW.artist_id, NEW.user_created_artist_id)) OR
        (sp.participant_type = 'venue' AND sp.venue_id IS NOT NULL AND sp.venue_id = NEW.venue_id)
      );
    END IF;
  END IF;

  IF v_scene_ids IS NOT NULL AND array_length(v_scene_ids, 1) > 0 THEN
    PERFORM public.calculate_scene_progress(v_user_id, unnest_scene_id)
    FROM UNNEST(v_scene_ids) AS unnest_scene_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;


-- 3. Now the backfill can actually run. Idempotent.
SELECT * FROM public.backfill_passport_stamps();

-- 4. Rarity for anything newly stamped.
SELECT public.refresh_entity_rarity();

-- 5. Achievements that count stamps (city_crosser, road_tripper, venue_hopper,
--    venue_loyalist) can finally move.
DO $do$
DECLARE u uuid;
BEGIN
  FOR u IN SELECT DISTINCT user_id FROM public.reviews WHERE is_draft = false
  LOOP
    PERFORM public.check_all_achievements(u);
  END LOOP;
END
$do$;


-- VERIFY -------------------------------------------------------------------
-- A. Stamps by type. Expect 'city' to appear for the first time, and artist /
--    venue counts to rise from 10 / 9.
SELECT type, count(*) AS stamps, count(DISTINCT user_id) AS users
FROM public.passport_entries GROUP BY type ORDER BY type;

-- B. Users with stamps should reach 8, up from 3.
SELECT count(DISTINCT user_id) AS users_with_stamps FROM public.passport_entries;

-- C. Rarity spread across the larger stamp set.
SELECT type, rarity, count(*) AS stamps
FROM public.passport_entries_with_rarity
GROUP BY type, rarity ORDER BY type, rarity;

-- D. city_crosser and road_tripper should no longer be 0.
SELECT a.achievement_key, a.bronze_goal,
       max(p.current_progress) AS best,
       count(*) FILTER (WHERE p.highest_tier_achieved IS NOT NULL) AS earned
FROM public.achievements a
LEFT JOIN public.user_achievement_progress p ON p.achievement_id = a.id
WHERE a.is_active
GROUP BY a.achievement_key, a.bronze_goal, a.sort_order ORDER BY a.sort_order;

-- E. Tier totals, against 16's result of bronze 19 / silver 4 / gold 9.
SELECT coalesce(highest_tier_achieved,'(none)') AS tier,
       count(*) AS rows, count(DISTINCT user_id) AS users
FROM public.user_achievement_progress GROUP BY 1 ORDER BY 1;
