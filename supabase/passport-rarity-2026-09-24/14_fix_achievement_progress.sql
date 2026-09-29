-- get_achievement_progress: the last five event_id joins. 2026-09-27.
-- REVIEW ONLY, NOT APPLIED. Run AFTER 13_fix_achievements.sql.
--
-- 13 got tiers flowing (15 earned across 8 users, from zero). These five
-- metrics inside get_achievement_progress are still starved by the same
-- always-NULL reviews.event_id:
--
--   v_emerging_count      first_through_door   INNER JOIN events ON e.id = r.event_id
--   v_out_of_town_count   road_tripper         same
--   v_genre_count         genre_blender        same
--   v_early_events_count  early_adopter        same
--   v_friend_shows_count  connector            r2.event_id = r1.event_id, and
--                                              NULL = NULL is never true
--
-- connector also backs the go_with_friends achievement, so that one stayed at
-- zero after 13. "Same show" now means same artist + same venue + same date,
-- since event_id can no longer identify a show.
--
-- Everything else in this function was already sound: trusted_voice,
-- deep_cut_reviewer, memory_maker and passport_complete never touched events,
-- and the six stamp-counting metrics (venue_hopper, scene_explorer,
-- city_crosser, era_walker, scene_regular, venue_loyalist) unblock from the
-- stamp backfill instead.
--
-- KNOWN REMAINING GAP, not fixed here: passport_entries only ever contains
-- 'artist' and 'venue' rows. The repaired trigger now also writes 'city', but
-- NOTHING writes type 'scene' or type 'era'. So scene_explorer, scene_regular
-- and era_walker will sit at 0 regardless. They need a writer, which is a
-- separate piece of work -- see the note at the bottom.

CREATE OR REPLACE FUNCTION public.get_achievement_progress(p_user_id uuid)
 RETURNS TABLE(achievement_type text, current_progress integer, bronze_goal integer,
               silver_goal integer, gold_goal integer, highest_tier text,
               highest_progress integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_venue_count INTEGER := 0;
  v_scene_count INTEGER := 0;
  v_city_count INTEGER := 0;
  v_era_count INTEGER := 0;
  v_emerging_count INTEGER := 0;
  v_saves_count INTEGER := 0;
  v_deep_cut_count INTEGER := 0;
  v_max_scene_events INTEGER := 0;
  v_out_of_town_count INTEGER := 0;
  v_max_venue_events INTEGER := 0;
  v_genre_count INTEGER := 0;
  v_pinned_count INTEGER := 0;
  v_early_events_count INTEGER := 0;
  v_friend_shows_count INTEGER := 0;
  v_achievement_count INTEGER := 0;
  v_home_city TEXT;
  v_join_date TIMESTAMPTZ;
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  -- Stamp-counting metrics: unchanged, they read passport_entries.
  SELECT COUNT(DISTINCT pe.entity_uuid) INTO v_venue_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id AND pe.type = 'venue' AND pe.entity_uuid IS NOT NULL;

  SELECT COUNT(DISTINCT pe.entity_uuid) INTO v_scene_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id AND pe.type = 'scene' AND pe.entity_uuid IS NOT NULL;

  SELECT COUNT(DISTINCT pe.entity_id) INTO v_city_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id AND pe.type = 'city';

  SELECT COUNT(DISTINCT pe.entity_id) INTO v_era_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id AND pe.type = 'era';

  -- FIXED: artist comes off the review. Counts reviews, not event_ids, since
  -- event_id is always NULL and would collapse every row into one group.
  SELECT COUNT(DISTINCT r.id) INTO v_emerging_count
  FROM public.reviews r
  INNER JOIN public.artists a ON a.id = r.artist_id
  WHERE r.user_id = p_user_id
    AND r.is_draft = false
    AND (r.was_there = true OR r.review_text IS NOT NULL)
    AND NOT EXISTS (
      SELECT 1 FROM public.external_entity_ids eei
      WHERE eei.entity_type = 'artist' AND eei.entity_uuid = a.id AND eei.source = 'jambase'
    );

  SELECT COALESCE(SUM(r.shares_count), 0) INTO v_saves_count
  FROM public.reviews r
  WHERE r.user_id = p_user_id AND r.is_public = true;

  SELECT COUNT(DISTINCT r.id) INTO v_deep_cut_count
  FROM public.reviews r
  WHERE r.user_id = p_user_id
    AND r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'
    AND (
      LOWER(r.review_text) LIKE '%opening%' OR LOWER(r.review_text) LIKE '%support%'
      OR LOWER(r.review_text) LIKE '%opener%' OR LOWER(r.review_text) LIKE '%first act%'
      OR LOWER(r.review_text) LIKE '%warm-up%'
    );

  SELECT COALESCE(MAX(scene_events.count), 0) INTO v_max_scene_events
  FROM (
    SELECT pe.entity_uuid, COUNT(*) as count
    FROM public.passport_entries pe
    WHERE pe.user_id = p_user_id AND pe.type = 'scene' AND pe.entity_uuid IS NOT NULL
    GROUP BY pe.entity_uuid
  ) scene_events;

  SELECT pe.entity_id INTO v_home_city
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id AND pe.type = 'city'
  GROUP BY pe.entity_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- FIXED: venue comes off the review.
  IF v_home_city IS NOT NULL THEN
    SELECT COUNT(DISTINCT r.id) INTO v_out_of_town_count
    FROM public.reviews r
    INNER JOIN public.venues v ON v.id = r.venue_id
    WHERE r.user_id = p_user_id
      AND r.is_draft = false
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND LOWER(COALESCE(v.city, '') || '_' || COALESCE(v.state, '')) != LOWER(v_home_city);
  END IF;

  SELECT COALESCE(MAX(venue_events.count), 0) INTO v_max_venue_events
  FROM (
    SELECT pe.entity_uuid, COUNT(*) as count
    FROM public.passport_entries pe
    WHERE pe.user_id = p_user_id AND pe.type = 'venue' AND pe.entity_uuid IS NOT NULL
    GROUP BY pe.entity_uuid
  ) venue_events;

  -- FIXED: genres via reviews.artist_id. artists.genres has three empty states
  -- (NULL, '{}', and the literal 'small artist') -- all excluded.
  SELECT COUNT(DISTINCT genre) INTO v_genre_count
  FROM (
    SELECT UNNEST(a.genres) as genre
    FROM public.reviews r
    INNER JOIN public.artists a ON a.id = r.artist_id
    WHERE r.user_id = p_user_id
      AND r.is_draft = false
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND a.genres IS NOT NULL
  ) genre_list
  WHERE genre <> '' AND LOWER(genre) <> 'small artist';

  SELECT COUNT(*) INTO v_pinned_count
  FROM public.passport_timeline
  WHERE user_id = p_user_id AND is_pinned = true;

  -- FIXED: the events join added nothing here, it only nulled the result.
  SELECT created_at INTO v_join_date FROM auth.users WHERE id = p_user_id;
  IF v_join_date IS NOT NULL THEN
    v_cutoff_date := v_join_date + INTERVAL '30 days';
    SELECT COUNT(DISTINCT r.id) INTO v_early_events_count
    FROM public.reviews r
    WHERE r.user_id = p_user_id
      AND r.is_draft = false
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND r.created_at <= v_cutoff_date AND r.created_at >= v_join_date;
  END IF;

  -- FIXED: "same show" is now same artist + same venue + same date. The old
  -- r2.event_id = r1.event_id could never match, because NULL = NULL is unknown.
  SELECT COUNT(DISTINCT r1.id) INTO v_friend_shows_count
  FROM public.reviews r1
  INNER JOIN public.reviews r2
          ON r2.user_id <> r1.user_id
         AND r2.artist_id IS NOT DISTINCT FROM r1.artist_id
         AND r2.venue_id  IS NOT DISTINCT FROM r1.venue_id
         AND r2."Event_date"::date = r1."Event_date"::date
         AND r2.is_draft = false
         AND (r2.was_there = true OR r2.review_text IS NOT NULL)
  INNER JOIN public.user_relationships ur ON (
    (ur.user_id = r1.user_id AND ur.related_user_id = r2.user_id)
    OR (ur.user_id = r2.user_id AND ur.related_user_id = r1.user_id)
  )
  WHERE r1.user_id = p_user_id
    AND r1.is_draft = false
    AND (r1.was_there = true OR r1.review_text IS NOT NULL)
    AND r1."Event_date" IS NOT NULL
    AND r1.artist_id IS NOT NULL
    AND ur.relationship_type = 'friend'
    AND ur.status = 'accepted';

  SELECT COUNT(DISTINCT uap.achievement_id) INTO v_achievement_count
  FROM public.user_achievement_progress uap
  INNER JOIN public.achievements a ON a.id = uap.achievement_id
  WHERE uap.user_id = p_user_id
    AND uap.highest_tier_achieved IS NOT NULL
    AND a.achievement_key != 'passport_complete';

  RETURN QUERY
  SELECT 'venue_hopper'::TEXT, v_venue_count, 3, 7, 15,
    CASE WHEN v_venue_count >= 15 THEN 'gold' WHEN v_venue_count >= 7 THEN 'silver' WHEN v_venue_count >= 3 THEN 'bronze' ELSE NULL END, v_venue_count
  UNION ALL SELECT 'scene_explorer'::TEXT, v_scene_count, 2, 4, 7,
    CASE WHEN v_scene_count >= 7 THEN 'gold' WHEN v_scene_count >= 4 THEN 'silver' WHEN v_scene_count >= 2 THEN 'bronze' ELSE NULL END, v_scene_count
  UNION ALL SELECT 'city_crosser'::TEXT, v_city_count, 2, 5, 10,
    CASE WHEN v_city_count >= 10 THEN 'gold' WHEN v_city_count >= 5 THEN 'silver' WHEN v_city_count >= 2 THEN 'bronze' ELSE NULL END, v_city_count
  UNION ALL SELECT 'era_walker'::TEXT, v_era_count, 2, 3, 5,
    CASE WHEN v_era_count >= 5 THEN 'gold' WHEN v_era_count >= 3 THEN 'silver' WHEN v_era_count >= 2 THEN 'bronze' ELSE NULL END, v_era_count
  UNION ALL SELECT 'first_through_door'::TEXT, v_emerging_count, 1, 3, 6,
    CASE WHEN v_emerging_count >= 6 THEN 'gold' WHEN v_emerging_count >= 3 THEN 'silver' WHEN v_emerging_count >= 1 THEN 'bronze' ELSE NULL END, v_emerging_count
  UNION ALL SELECT 'trusted_voice'::TEXT, v_saves_count, 3, 10, 25,
    CASE WHEN v_saves_count >= 25 THEN 'gold' WHEN v_saves_count >= 10 THEN 'silver' WHEN v_saves_count >= 3 THEN 'bronze' ELSE NULL END, v_saves_count
  UNION ALL SELECT 'deep_cut_reviewer'::TEXT, v_deep_cut_count, 2, 5, 10,
    CASE WHEN v_deep_cut_count >= 10 THEN 'gold' WHEN v_deep_cut_count >= 5 THEN 'silver' WHEN v_deep_cut_count >= 2 THEN 'bronze' ELSE NULL END, v_deep_cut_count
  UNION ALL SELECT 'scene_regular'::TEXT, v_max_scene_events, 3, 6, 10,
    CASE WHEN v_max_scene_events >= 10 THEN 'gold' WHEN v_max_scene_events >= 6 THEN 'silver' WHEN v_max_scene_events >= 3 THEN 'bronze' ELSE NULL END, v_max_scene_events
  UNION ALL SELECT 'road_tripper'::TEXT, v_out_of_town_count, 1, 3, 6,
    CASE WHEN v_out_of_town_count >= 6 THEN 'gold' WHEN v_out_of_town_count >= 3 THEN 'silver' WHEN v_out_of_town_count >= 1 THEN 'bronze' ELSE NULL END, v_out_of_town_count
  UNION ALL SELECT 'venue_loyalist'::TEXT, v_max_venue_events, 3, 6, 10,
    CASE WHEN v_max_venue_events >= 10 THEN 'gold' WHEN v_max_venue_events >= 6 THEN 'silver' WHEN v_max_venue_events >= 3 THEN 'bronze' ELSE NULL END, v_max_venue_events
  UNION ALL SELECT 'genre_blender'::TEXT, v_genre_count, 2, 4, 6,
    CASE WHEN v_genre_count >= 6 THEN 'gold' WHEN v_genre_count >= 4 THEN 'silver' WHEN v_genre_count >= 2 THEN 'bronze' ELSE NULL END, v_genre_count
  UNION ALL SELECT 'memory_maker'::TEXT, v_pinned_count, 1, 3, 5,
    CASE WHEN v_pinned_count >= 5 THEN 'gold' WHEN v_pinned_count >= 3 THEN 'silver' WHEN v_pinned_count >= 1 THEN 'bronze' ELSE NULL END, v_pinned_count
  UNION ALL SELECT 'early_adopter'::TEXT, v_early_events_count, 1, 3, 5,
    CASE WHEN v_early_events_count >= 5 THEN 'gold' WHEN v_early_events_count >= 3 THEN 'silver' WHEN v_early_events_count >= 1 THEN 'bronze' ELSE NULL END, v_early_events_count
  UNION ALL SELECT 'connector'::TEXT, v_friend_shows_count, 2, 5, 10,
    CASE WHEN v_friend_shows_count >= 10 THEN 'gold' WHEN v_friend_shows_count >= 5 THEN 'silver' WHEN v_friend_shows_count >= 2 THEN 'bronze' ELSE NULL END, v_friend_shows_count
  UNION ALL SELECT 'passport_complete'::TEXT, v_achievement_count, 5, 10, 15,
    CASE WHEN v_achievement_count >= 15 THEN 'gold' WHEN v_achievement_count >= 10 THEN 'silver' WHEN v_achievement_count >= 5 THEN 'bronze' ELSE NULL END, v_achievement_count;
END;
$function$;


-- Recompute everyone again, now that the delegated metrics work.
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
-- Tier counts should rise above 13's result (bronze 8 / silver 3 / gold 4).
SELECT coalesce(highest_tier_achieved, '(none)') AS tier,
       count(*) AS rows, count(DISTINCT user_id) AS users
FROM public.user_achievement_progress GROUP BY 1 ORDER BY 1;

-- Per-metric view straight from the source, for one real user. Anything still
-- at 0 here is either genuinely unearned or has no writer (see below).
SELECT * FROM public.get_achievement_progress(
  (SELECT user_id FROM public.reviews WHERE is_draft = false
   GROUP BY user_id ORDER BY count(*) DESC LIMIT 1)
) ORDER BY achievement_type;


-- SEPARATE WORK, NOT A BUG IN THIS FILE ------------------------------------
-- passport_entries holds only 'artist' and 'venue' rows today; the repaired
-- trigger adds 'city'. Nothing writes 'scene' or 'era', so these three stay at
-- zero until something does:
--     scene_explorer, scene_regular   need type 'scene' stamps
--     era_walker                      needs type 'era' stamps
-- unlock_passport_scene() already exists and is never called. detect_user_eras()
-- exists too. Worth deciding whether scenes/eras are a real feature before
-- wiring them, rather than lighting up three achievements nobody can read.
SELECT type, count(*) FROM public.passport_entries GROUP BY type ORDER BY type;
