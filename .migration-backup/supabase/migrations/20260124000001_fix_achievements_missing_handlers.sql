-- ============================================
-- FIX ACHIEVEMENTS: MISSING HANDLERS AND BUGS
-- ============================================
-- 1. check_all_achievements: add handlers for festival_attendance, artist_devotee,
--    venue_regular, go_with_friends (else branch returned 0 – get_achievement_progress
--    uses different keys). Map: venue_regular -> venue_loyalist, go_with_friends -> connector.
-- 2. Fix intentional_explorer: old logic joined scenes to genres incorrectly. Use
--    “max distinct venues per genre” (same as fix_intentional_explorer).
-- 3. get_achievement_progress: passport_complete should count unlocked tiered
--    achievements (user_achievement_progress, excluding passport_complete), not
--    passport_achievements (behavioral).
-- 4. Ensure achievements.is_active exists (check_all_achievements filters on it).
-- ============================================

BEGIN;

-- Ensure is_active exists so check_all_achievements filter works
ALTER TABLE public.achievements ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;
UPDATE public.achievements SET is_active = true WHERE is_active IS NULL;

-- ============================================
-- 1. check_all_achievements: new WHENs + fix intentional_explorer
-- ============================================

CREATE OR REPLACE FUNCTION public.check_all_achievements(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_achievement RECORD;
  v_progress INTEGER;
  v_highest_tier TEXT;
  v_metadata JSONB;
BEGIN
  FOR v_achievement IN
    SELECT id, achievement_key, bronze_goal, silver_goal, gold_goal
    FROM public.achievements
    WHERE is_active = true
  LOOP
    v_progress := 0;
    v_highest_tier := NULL;
    v_metadata := '{}'::jsonb;

    CASE v_achievement.achievement_key
      WHEN 'genre_curator' THEN
        SELECT COUNT(DISTINCT genre)
        INTO v_progress
        FROM (
          SELECT UNNEST(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre
          FROM public.reviews r
          INNER JOIN public.events e ON e.id = r.event_id
          WHERE r.user_id = p_user_id
            AND (r.was_there = true OR r.review_text IS NOT NULL)
            AND COALESCE(e.genres, ARRAY[]::TEXT[]) != ARRAY[]::TEXT[]
          UNION
          SELECT UNNEST(a.genres) as genre
          FROM public.reviews r
          INNER JOIN public.events e ON e.id = r.event_id
          INNER JOIN public.artists a ON a.id = e.artist_id
          WHERE r.user_id = p_user_id
            AND (r.was_there = true OR r.review_text IS NOT NULL)
            AND a.genres IS NOT NULL
            AND (e.genres IS NULL OR e.genres = ARRAY[]::TEXT[])
        ) genre_list;

      WHEN 'genre_specialist' THEN
        SELECT COALESCE(MAX(genre_count), 0)
        INTO v_progress
        FROM (
          SELECT genre, COUNT(*) as genre_count
          FROM (
            SELECT UNNEST(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre
            FROM public.reviews r
            INNER JOIN public.events e ON e.id = r.event_id
            WHERE r.user_id = p_user_id
              AND (r.was_there = true OR r.review_text IS NOT NULL)
              AND COALESCE(e.genres, ARRAY[]::TEXT[]) != ARRAY[]::TEXT[]
            UNION ALL
            SELECT UNNEST(a.genres) as genre
            FROM public.reviews r
            INNER JOIN public.events e ON e.id = r.event_id
            INNER JOIN public.artists a ON a.id = e.artist_id
            WHERE r.user_id = p_user_id
              AND (r.was_there = true OR r.review_text IS NOT NULL)
              AND a.genres IS NOT NULL
              AND (e.genres IS NULL OR e.genres = ARRAY[]::TEXT[])
          ) genre_list
          GROUP BY genre
        ) genre_counts;

      WHEN 'bucket_list_starter' THEN
        SELECT COUNT(DISTINCT r.event_id)
        INTO v_progress
        FROM public.reviews r
        INNER JOIN public.events e ON e.id = r.event_id
        WHERE r.user_id = p_user_id
          AND (r.was_there = true OR r.review_text IS NOT NULL)
          AND (
            EXISTS (
              SELECT 1 FROM public.bucket_list bl
              INNER JOIN public.entities ent ON ent.id = bl.entity_id
              WHERE bl.user_id = p_user_id
                AND ent.entity_type = 'artist'
                AND ent.entity_uuid = e.artist_id
            )
            OR EXISTS (
              SELECT 1 FROM public.bucket_list bl
              INNER JOIN public.entities ent ON ent.id = bl.entity_id
              WHERE bl.user_id = p_user_id
                AND ent.entity_type = 'venue'
                AND ent.entity_uuid = e.venue_id
            )
          );

      WHEN 'intentional_explorer' THEN
        -- Use distinct venues per genre (proxy for “scenes in one genre”)
        SELECT COALESCE(MAX(venue_count), 0)
        INTO v_progress
        FROM (
          SELECT genre, COUNT(DISTINCT venue_id) as venue_count
          FROM (
            SELECT UNNEST(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre, e.venue_id
            FROM public.reviews r
            INNER JOIN public.events e ON e.id = r.event_id
            WHERE r.user_id = p_user_id
              AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
              AND (r.is_draft = false OR r.is_draft IS NULL)
              AND e.genres IS NOT NULL
              AND e.venue_id IS NOT NULL
            UNION
            SELECT UNNEST(a.genres) as genre, e.venue_id
            FROM public.reviews r
            INNER JOIN public.events e ON e.id = r.event_id
            INNER JOIN public.artists a ON a.id = e.artist_id
            WHERE r.user_id = p_user_id
              AND (r.was_there = true OR (r.review_text IS NOT NULL AND r.review_text != 'ATTENDANCE_ONLY'))
              AND (r.is_draft = false OR r.is_draft IS NULL)
              AND a.genres IS NOT NULL
              AND (e.genres IS NULL OR e.genres = ARRAY[]::TEXT[])
              AND e.venue_id IS NOT NULL
          ) genre_venues
          GROUP BY genre
        ) gv;

      WHEN 'festival_attendance' THEN
        SELECT COUNT(DISTINCT r.event_id)
        INTO v_progress
        FROM public.reviews r
        INNER JOIN public.events e ON e.id = r.event_id
        LEFT JOIN public.venues v ON v.id = e.venue_id
        WHERE r.user_id = p_user_id
          AND (r.was_there = true OR r.review_text IS NOT NULL)
          AND (
            COALESCE(v.name, e.venue_city, '') ILIKE '%festival%'
            OR COALESCE(v.name, e.venue_city, '') ILIKE '%fest%'
            OR COALESCE(v.name, e.venue_city, '') ILIKE '%gathering%'
            OR COALESCE(v.name, e.venue_city, '') ILIKE '%fair%'
            OR e.title ILIKE '%festival%'
            OR e.title ILIKE '%fest %'
          );

      WHEN 'artist_devotee' THEN
        SELECT COALESCE(MAX(cnt), 0)
        INTO v_progress
        FROM (
          SELECT COUNT(*) as cnt
          FROM public.reviews r
          INNER JOIN public.events e ON e.id = r.event_id
          WHERE r.user_id = p_user_id
            AND (r.was_there = true OR r.review_text IS NOT NULL)
            AND e.artist_id IS NOT NULL
          GROUP BY e.artist_id
        ) per_artist;

      WHEN 'venue_regular' THEN
        SELECT current_progress
        INTO v_progress
        FROM public.get_achievement_progress(p_user_id)
        WHERE achievement_type = 'venue_loyalist'
        LIMIT 1;

      WHEN 'go_with_friends' THEN
        SELECT current_progress
        INTO v_progress
        FROM public.get_achievement_progress(p_user_id)
        WHERE achievement_type = 'connector'
        LIMIT 1;

      ELSE
        SELECT current_progress
        INTO v_progress
        FROM public.get_achievement_progress(p_user_id)
        WHERE achievement_type = v_achievement.achievement_key
        LIMIT 1;
    END CASE;

    -- Ensure current_progress is never NULL (NOT NULL constraint on user_achievement_progress)
    v_progress := COALESCE(v_progress, 0);

    IF v_progress >= v_achievement.gold_goal THEN
      v_highest_tier := 'gold';
    ELSIF v_progress >= v_achievement.silver_goal THEN
      v_highest_tier := 'silver';
    ELSIF v_progress >= v_achievement.bronze_goal THEN
      v_highest_tier := 'bronze';
    END IF;

    INSERT INTO public.user_achievement_progress (
      user_id, achievement_id, current_progress, highest_tier_achieved, progress_metadata, updated_at
    )
    VALUES (p_user_id, v_achievement.id, v_progress, v_highest_tier, v_metadata, now())
    ON CONFLICT (user_id, achievement_id)
    DO UPDATE SET
      current_progress = EXCLUDED.current_progress,
      highest_tier_achieved = EXCLUDED.highest_tier_achieved,
      progress_metadata = EXCLUDED.progress_metadata,
      updated_at = now(),
      bronze_achieved_at = CASE
        WHEN EXCLUDED.highest_tier_achieved IN ('bronze', 'silver', 'gold')
         AND user_achievement_progress.bronze_achieved_at IS NULL THEN now()
        ELSE user_achievement_progress.bronze_achieved_at
      END,
      silver_achieved_at = CASE
        WHEN EXCLUDED.highest_tier_achieved IN ('silver', 'gold')
         AND user_achievement_progress.silver_achieved_at IS NULL THEN now()
        ELSE user_achievement_progress.silver_achieved_at
      END,
      gold_achieved_at = CASE
        WHEN EXCLUDED.highest_tier_achieved = 'gold'
         AND user_achievement_progress.gold_achieved_at IS NULL THEN now()
        ELSE user_achievement_progress.gold_achieved_at
      END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_all_achievements(UUID) TO authenticated;

-- ============================================
-- 2. get_achievement_progress: fix passport_complete to count tiered achievements
-- ============================================

CREATE OR REPLACE FUNCTION public.get_achievement_progress(p_user_id UUID)
RETURNS TABLE(
  achievement_type TEXT,
  current_progress INTEGER,
  bronze_goal INTEGER,
  silver_goal INTEGER,
  gold_goal INTEGER,
  highest_tier TEXT,
  highest_progress INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- (Venue Hopper through Connector: same as before, keep existing SELECTs)
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

  SELECT COUNT(DISTINCT r.event_id) INTO v_emerging_count
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  INNER JOIN public.artists a ON a.id = e.artist_id
  WHERE r.user_id = p_user_id
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

  IF v_home_city IS NOT NULL THEN
    SELECT COUNT(DISTINCT r.event_id) INTO v_out_of_town_count
    FROM public.reviews r
    INNER JOIN public.events e ON e.id = r.event_id
    INNER JOIN public.venues v ON v.id = e.venue_id
    WHERE r.user_id = p_user_id
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

  SELECT COUNT(DISTINCT genre) INTO v_genre_count
  FROM (
    SELECT UNNEST(a.genres) as genre
    FROM public.reviews r
    INNER JOIN public.events e ON e.id = r.event_id
    INNER JOIN public.artists a ON a.id = e.artist_id
    WHERE r.user_id = p_user_id
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND a.genres IS NOT NULL
  ) genre_list;

  SELECT COUNT(*) INTO v_pinned_count
  FROM public.passport_timeline
  WHERE user_id = p_user_id AND is_pinned = true;

  SELECT created_at INTO v_join_date FROM auth.users WHERE id = p_user_id;
  IF v_join_date IS NOT NULL THEN
    v_cutoff_date := v_join_date + INTERVAL '30 days';
    SELECT COUNT(DISTINCT r.event_id) INTO v_early_events_count
    FROM public.reviews r
    INNER JOIN public.events e ON e.id = r.event_id
    WHERE r.user_id = p_user_id
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND r.created_at <= v_cutoff_date AND r.created_at >= v_join_date;
  END IF;

  SELECT COUNT(DISTINCT r1.event_id) INTO v_friend_shows_count
  FROM public.reviews r1
  INNER JOIN public.reviews r2 ON r2.event_id = r1.event_id
    AND r2.user_id != r1.user_id
    AND (r2.was_there = true OR r2.review_text IS NOT NULL)
  INNER JOIN public.user_relationships ur ON (
    (ur.user_id = r1.user_id AND ur.related_user_id = r2.user_id)
    OR (ur.user_id = r2.user_id AND ur.related_user_id = r1.user_id)
  )
  WHERE r1.user_id = p_user_id
    AND (r1.was_there = true OR r1.review_text IS NOT NULL)
    AND ur.relationship_type = 'friend'
    AND ur.status = 'accepted';

  -- Passport Complete: count UNLOCKED tiered achievements (user_achievement_progress,
  -- excluding passport_complete itself), not passport_achievements (behavioral).
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
$$;

GRANT EXECUTE ON FUNCTION public.get_achievement_progress(UUID) TO authenticated;

COMMIT;
