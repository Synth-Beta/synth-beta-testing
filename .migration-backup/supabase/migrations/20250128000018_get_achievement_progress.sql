-- ============================================
-- GET ACHIEVEMENT PROGRESS FUNCTION
-- Returns current progress for all achievement types
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
  -- Venue Hopper
  SELECT COUNT(DISTINCT pe.entity_uuid)
  INTO v_venue_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.type = 'venue'
    AND pe.entity_uuid IS NOT NULL;

  -- Scene Explorer
  SELECT COUNT(DISTINCT pe.entity_uuid)
  INTO v_scene_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.type = 'scene'
    AND pe.entity_uuid IS NOT NULL;

  -- City Crosser
  SELECT COUNT(DISTINCT pe.entity_id)
  INTO v_city_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.type = 'city';

  -- Era Walker
  SELECT COUNT(DISTINCT pe.entity_id)
  INTO v_era_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.type = 'era';

  -- First Through the Door
  -- Emerging artists: artists with no JamBase external ID (simpler heuristic)
  SELECT COUNT(DISTINCT r.event_id)
  INTO v_emerging_count
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  INNER JOIN public.artists a ON a.id = e.artist_id
  WHERE r.user_id = p_user_id
    AND (r.was_there = true OR r.review_text IS NOT NULL)
    -- No JamBase ID means likely emerging artist
    AND NOT EXISTS (
      SELECT 1 FROM public.external_entity_ids eei
      WHERE eei.entity_type = 'artist' 
      AND eei.entity_uuid = a.id
      AND eei.source = 'jambase'
    );

  -- Trusted Voice
  -- Use shares_count as proxy for saves (or could track in a separate saves table)
  -- For now, using shares_count + a multiplier to approximate saves
  SELECT COALESCE(SUM(r.shares_count), 0)
  INTO v_saves_count
  FROM public.reviews r
  WHERE r.user_id = p_user_id
    AND r.is_public = true;

  -- Deep Cut Reviewer
  SELECT COUNT(DISTINCT r.id)
  INTO v_deep_cut_count
  FROM public.reviews r
  WHERE r.user_id = p_user_id
    AND r.review_text IS NOT NULL
    AND r.review_text != 'ATTENDANCE_ONLY'
    AND (
      LOWER(r.review_text) LIKE '%opening%'
      OR LOWER(r.review_text) LIKE '%support%'
      OR LOWER(r.review_text) LIKE '%opener%'
      OR LOWER(r.review_text) LIKE '%first act%'
      OR LOWER(r.review_text) LIKE '%warm-up%'
    );

  -- Scene Regular
  SELECT COALESCE(MAX(scene_events.count), 0)
  INTO v_max_scene_events
  FROM (
    SELECT pe.entity_uuid, COUNT(*) as count
    FROM public.passport_entries pe
    WHERE pe.user_id = p_user_id
      AND pe.type = 'scene'
      AND pe.entity_uuid IS NOT NULL
    GROUP BY pe.entity_uuid
  ) scene_events;

  -- Road Tripper
  SELECT pe.entity_id
  INTO v_home_city
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.type = 'city'
  GROUP BY pe.entity_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_home_city IS NOT NULL THEN
    SELECT COUNT(DISTINCT r.event_id)
    INTO v_out_of_town_count
    FROM public.reviews r
    INNER JOIN public.events e ON e.id = r.event_id
    INNER JOIN public.venues v ON v.id = e.venue_id
    WHERE r.user_id = p_user_id
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND LOWER(COALESCE(v.city, '') || '_' || COALESCE(v.state, '')) != LOWER(v_home_city);
  END IF;

  -- Venue Loyalist
  SELECT COALESCE(MAX(venue_events.count), 0)
  INTO v_max_venue_events
  FROM (
    SELECT pe.entity_uuid, COUNT(*) as count
    FROM public.passport_entries pe
    WHERE pe.user_id = p_user_id
      AND pe.type = 'venue'
      AND pe.entity_uuid IS NOT NULL
    GROUP BY pe.entity_uuid
  ) venue_events;

  -- Genre Blender
  SELECT COUNT(DISTINCT genre)
  INTO v_genre_count
  FROM (
    SELECT UNNEST(a.genres) as genre
    FROM public.reviews r
    INNER JOIN public.events e ON e.id = r.event_id
    INNER JOIN public.artists a ON a.id = e.artist_id
    WHERE r.user_id = p_user_id
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND a.genres IS NOT NULL
  ) genre_list;

  -- Memory Maker
  SELECT COUNT(*)
  INTO v_pinned_count
  FROM public.passport_timeline
  WHERE user_id = p_user_id
    AND is_pinned = true;

  -- Early Adopter
  SELECT created_at
  INTO v_join_date
  FROM auth.users
  WHERE id = p_user_id;

  IF v_join_date IS NOT NULL THEN
    v_cutoff_date := v_join_date + INTERVAL '30 days';
    SELECT COUNT(DISTINCT r.event_id)
    INTO v_early_events_count
    FROM public.reviews r
    INNER JOIN public.events e ON e.id = r.event_id
    WHERE r.user_id = p_user_id
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND r.created_at <= v_cutoff_date
      AND r.created_at >= v_join_date;
  END IF;

  -- Connector
  SELECT COUNT(DISTINCT r1.event_id)
  INTO v_friend_shows_count
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

  -- Passport Complete
  SELECT COUNT(DISTINCT pa.achievement_type)
  INTO v_achievement_count
  FROM public.passport_achievements pa
  WHERE pa.user_id = p_user_id
    AND pa.achievement_type != 'passport_complete';

  -- Return all achievements with progress
  RETURN QUERY
  SELECT 
    'venue_hopper'::TEXT,
    v_venue_count,
    3, 7, 15,
    CASE 
      WHEN v_venue_count >= 15 THEN 'gold'
      WHEN v_venue_count >= 7 THEN 'silver'
      WHEN v_venue_count >= 3 THEN 'bronze'
      ELSE NULL
    END,
    v_venue_count
  UNION ALL
  SELECT 'scene_explorer'::TEXT, v_scene_count, 2, 4, 7,
    CASE 
      WHEN v_scene_count >= 7 THEN 'gold'
      WHEN v_scene_count >= 4 THEN 'silver'
      WHEN v_scene_count >= 2 THEN 'bronze'
      ELSE NULL
    END,
    v_scene_count
  UNION ALL
  SELECT 'city_crosser'::TEXT, v_city_count, 2, 5, 10,
    CASE 
      WHEN v_city_count >= 10 THEN 'gold'
      WHEN v_city_count >= 5 THEN 'silver'
      WHEN v_city_count >= 2 THEN 'bronze'
      ELSE NULL
    END,
    v_city_count
  UNION ALL
  SELECT 'era_walker'::TEXT, v_era_count, 2, 3, 5,
    CASE 
      WHEN v_era_count >= 5 THEN 'gold'
      WHEN v_era_count >= 3 THEN 'silver'
      WHEN v_era_count >= 2 THEN 'bronze'
      ELSE NULL
    END,
    v_era_count
  UNION ALL
  SELECT 'first_through_door'::TEXT, v_emerging_count, 1, 3, 6,
    CASE 
      WHEN v_emerging_count >= 6 THEN 'gold'
      WHEN v_emerging_count >= 3 THEN 'silver'
      WHEN v_emerging_count >= 1 THEN 'bronze'
      ELSE NULL
    END,
    v_emerging_count
  UNION ALL
  SELECT 'trusted_voice'::TEXT, v_saves_count, 3, 10, 25,
    CASE 
      WHEN v_saves_count >= 25 THEN 'gold'
      WHEN v_saves_count >= 10 THEN 'silver'
      WHEN v_saves_count >= 3 THEN 'bronze'
      ELSE NULL
    END,
    v_saves_count
  UNION ALL
  SELECT 'deep_cut_reviewer'::TEXT, v_deep_cut_count, 2, 5, 10,
    CASE 
      WHEN v_deep_cut_count >= 10 THEN 'gold'
      WHEN v_deep_cut_count >= 5 THEN 'silver'
      WHEN v_deep_cut_count >= 2 THEN 'bronze'
      ELSE NULL
    END,
    v_deep_cut_count
  UNION ALL
  SELECT 'scene_regular'::TEXT, v_max_scene_events, 3, 6, 10,
    CASE 
      WHEN v_max_scene_events >= 10 THEN 'gold'
      WHEN v_max_scene_events >= 6 THEN 'silver'
      WHEN v_max_scene_events >= 3 THEN 'bronze'
      ELSE NULL
    END,
    v_max_scene_events
  UNION ALL
  SELECT 'road_tripper'::TEXT, v_out_of_town_count, 1, 3, 6,
    CASE 
      WHEN v_out_of_town_count >= 6 THEN 'gold'
      WHEN v_out_of_town_count >= 3 THEN 'silver'
      WHEN v_out_of_town_count >= 1 THEN 'bronze'
      ELSE NULL
    END,
    v_out_of_town_count
  UNION ALL
  SELECT 'venue_loyalist'::TEXT, v_max_venue_events, 3, 6, 10,
    CASE 
      WHEN v_max_venue_events >= 10 THEN 'gold'
      WHEN v_max_venue_events >= 6 THEN 'silver'
      WHEN v_max_venue_events >= 3 THEN 'bronze'
      ELSE NULL
    END,
    v_max_venue_events
  UNION ALL
  SELECT 'genre_blender'::TEXT, v_genre_count, 2, 4, 6,
    CASE 
      WHEN v_genre_count >= 6 THEN 'gold'
      WHEN v_genre_count >= 4 THEN 'silver'
      WHEN v_genre_count >= 2 THEN 'bronze'
      ELSE NULL
    END,
    v_genre_count
  UNION ALL
  SELECT 'memory_maker'::TEXT, v_pinned_count, 1, 3, 5,
    CASE 
      WHEN v_pinned_count >= 5 THEN 'gold'
      WHEN v_pinned_count >= 3 THEN 'silver'
      WHEN v_pinned_count >= 1 THEN 'bronze'
      ELSE NULL
    END,
    v_pinned_count
  UNION ALL
  SELECT 'early_adopter'::TEXT, v_early_events_count, 1, 3, 5,
    CASE 
      WHEN v_early_events_count >= 5 THEN 'gold'
      WHEN v_early_events_count >= 3 THEN 'silver'
      WHEN v_early_events_count >= 1 THEN 'bronze'
      ELSE NULL
    END,
    v_early_events_count
  UNION ALL
  SELECT 'connector'::TEXT, v_friend_shows_count, 2, 5, 10,
    CASE 
      WHEN v_friend_shows_count >= 10 THEN 'gold'
      WHEN v_friend_shows_count >= 5 THEN 'silver'
      WHEN v_friend_shows_count >= 2 THEN 'bronze'
      ELSE NULL
    END,
    v_friend_shows_count
  UNION ALL
  SELECT 'passport_complete'::TEXT, v_achievement_count, 5, 10, 15,
    CASE 
      WHEN v_achievement_count >= 15 THEN 'gold'
      WHEN v_achievement_count >= 10 THEN 'silver'
      WHEN v_achievement_count >= 5 THEN 'bronze'
      ELSE NULL
    END,
    v_achievement_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_achievement_progress(UUID) TO authenticated;

COMMENT ON FUNCTION public.get_achievement_progress IS 'Returns current progress for all achievement types, including highest tier achieved';

