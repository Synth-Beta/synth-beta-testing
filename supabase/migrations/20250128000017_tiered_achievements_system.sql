-- ============================================
-- TIERED ACHIEVEMENTS SYSTEM
-- Implements Bronze/Silver/Gold tier system for passport achievements
-- ============================================

-- Step 1: Update passport_achievements table to support tiers
ALTER TABLE public.passport_achievements
ADD COLUMN IF NOT EXISTS tier TEXT CHECK (tier IN ('bronze', 'silver', 'gold')),
ADD COLUMN IF NOT EXISTS progress INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS goal INTEGER DEFAULT 0;

-- Update constraint to allow multiple tiers per achievement type
ALTER TABLE public.passport_achievements
DROP CONSTRAINT IF EXISTS passport_achievements_user_id_achievement_type_key;

-- Create new unique constraint that includes tier
CREATE UNIQUE INDEX IF NOT EXISTS passport_achievements_user_id_type_tier_key
ON public.passport_achievements(user_id, achievement_type, tier)
WHERE tier IS NOT NULL;

-- Update achievement_type constraint to include all new types
ALTER TABLE public.passport_achievements
DROP CONSTRAINT IF EXISTS passport_achievements_achievement_type_check;

ALTER TABLE public.passport_achievements
ADD CONSTRAINT passport_achievements_achievement_type_check
CHECK (achievement_type IN (
  'venue_hopper',
  'scene_explorer',
  'city_crosser',
  'era_walker',
  'first_through_door',
  'trusted_voice',
  'deep_cut_reviewer',
  'scene_regular',
  'road_tripper',
  'venue_loyalist',
  'genre_blender',
  'memory_maker',
  'early_adopter',
  'connector',
  'passport_complete'
));

-- Step 2: Helper function to check and unlock tiered achievements
CREATE OR REPLACE FUNCTION public.check_tiered_achievement(
  p_user_id UUID,
  p_achievement_type TEXT,
  p_current_progress INTEGER,
  p_bronze_goal INTEGER,
  p_silver_goal INTEGER,
  p_gold_goal INTEGER,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_tier TEXT;
BEGIN
  -- Determine highest tier achieved
  IF p_current_progress >= p_gold_goal THEN
    v_tier := 'gold';
  ELSIF p_current_progress >= p_silver_goal THEN
    v_tier := 'silver';
  ELSIF p_current_progress >= p_bronze_goal THEN
    v_tier := 'bronze';
  ELSE
    RETURN; -- No achievement unlocked yet
  END IF;

  -- Insert or update achievement for the highest tier
  INSERT INTO public.passport_achievements (
    user_id,
    achievement_type,
    tier,
    progress,
    goal,
    metadata,
    unlocked_at
  )
  VALUES (
    p_user_id,
    p_achievement_type,
    v_tier,
    p_current_progress,
    CASE v_tier
      WHEN 'gold' THEN p_gold_goal
      WHEN 'silver' THEN p_silver_goal
      ELSE p_bronze_goal
    END,
    p_metadata,
    now()
  )
  ON CONFLICT (user_id, achievement_type, tier)
  DO UPDATE SET
    progress = EXCLUDED.progress,
    goal = EXCLUDED.goal,
    metadata = EXCLUDED.metadata,
    unlocked_at = CASE 
      WHEN passport_achievements.tier != EXCLUDED.tier THEN now()
      ELSE passport_achievements.unlocked_at
    END,
    tier = EXCLUDED.tier;
END;
$$;

-- Step 3: Venue Hopper (3/7/15 different venues)
CREATE OR REPLACE FUNCTION public.detect_venue_hopper(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_venue_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT pe.entity_uuid)
  INTO v_venue_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.type = 'venue'
    AND pe.entity_uuid IS NOT NULL;

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'venue_hopper',
    v_venue_count,
    3,  -- Bronze
    7,  -- Silver
    15, -- Gold
    jsonb_build_object('venue_count', v_venue_count)
  );
END;
$$;

-- Step 4: Scene Explorer (2/4/7 distinct scenes)
CREATE OR REPLACE FUNCTION public.detect_scene_explorer(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_scene_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT pe.entity_uuid)
  INTO v_scene_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.type = 'scene'
    AND pe.entity_uuid IS NOT NULL;

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'scene_explorer',
    v_scene_count,
    2, -- Bronze
    4, -- Silver
    7, -- Gold
    jsonb_build_object('scene_count', v_scene_count)
  );
END;
$$;

-- Step 5: City Crosser (2/5/10 cities)
CREATE OR REPLACE FUNCTION public.detect_city_crosser(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_city_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT pe.entity_id)
  INTO v_city_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.type = 'city';

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'city_crosser',
    v_city_count,
    2,  -- Bronze
    5,  -- Silver
    10, -- Gold
    jsonb_build_object('city_count', v_city_count)
  );
END;
$$;

-- Step 6: Era Walker (2/3/5 different eras)
-- Note: This requires era stamps to be created first
CREATE OR REPLACE FUNCTION public.detect_era_walker(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_era_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT pe.entity_id)
  INTO v_era_count
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.type = 'era';

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'era_walker',
    v_era_count,
    2, -- Bronze
    3, -- Silver
    5, -- Gold
    jsonb_build_object('era_count', v_era_count)
  );
END;
$$;

-- Step 7: First Through the Door (1/3/6 emerging-artist shows)
-- Emerging artists: artists with < 1000 followers or events with < 50 attendees
CREATE OR REPLACE FUNCTION public.detect_first_through_door(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_emerging_count INTEGER;
BEGIN
  SELECT COUNT(DISTINCT r.event_id)
  INTO v_emerging_count
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  INNER JOIN public.artists a ON a.id = e.artist_id
  WHERE r.user_id = p_user_id
    AND (r.was_there = true OR r.review_text IS NOT NULL)
    -- Simple heuristic: emerging if no significant external IDs or low event popularity
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.external_entity_ids eei
        WHERE eei.entity_type = 'artist' 
        AND eei.entity_id = a.id::text
        AND eei.source = 'jambase'
        AND (eei.metadata->>'popularity')::int > 50
      )
      OR COALESCE((e.metadata->>'expected_attendance')::int, 0) < 50
    );

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'first_through_door',
    v_emerging_count,
    1, -- Bronze
    3, -- Silver
    6, -- Gold
    jsonb_build_object('emerging_shows', v_emerging_count)
  );
END;
$$;

-- Step 8: Trusted Voice (3/10/25 reviews saved by others)
CREATE OR REPLACE FUNCTION public.detect_trusted_voice(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saves_count INTEGER;
BEGIN
  -- Count total shares of user's reviews (using shares_count as proxy for saves)
  SELECT COALESCE(SUM(r.shares_count), 0)
  INTO v_saves_count
  FROM public.reviews r
  WHERE r.user_id = p_user_id
    AND r.is_public = true;

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'trusted_voice',
    v_saves_count,
    3,  -- Bronze
    10, -- Silver
    25, -- Gold
    jsonb_build_object('total_saves', v_saves_count)
  );
END;
$$;

-- Step 9: Deep Cut Reviewer (2/5/10 non-headliner performances reviewed)
CREATE OR REPLACE FUNCTION public.detect_deep_cut_reviewer(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_deep_cut_count INTEGER;
BEGIN
  -- Count reviews that mention non-headliner artists or opening acts
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

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'deep_cut_reviewer',
    v_deep_cut_count,
    2,  -- Bronze
    5,  -- Silver
    10, -- Gold
    jsonb_build_object('deep_cut_reviews', v_deep_cut_count)
  );
END;
$$;

-- Step 10: Scene Regular (3/6/10 events in the same scene)
CREATE OR REPLACE FUNCTION public.detect_scene_regular(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_scene_events INTEGER;
  v_scene_id UUID;
BEGIN
  -- Find the scene with most events attended
  SELECT pe.entity_uuid, COUNT(*)
  INTO v_scene_id, v_max_scene_events
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.type = 'scene'
    AND pe.entity_uuid IS NOT NULL
  GROUP BY pe.entity_uuid
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_max_scene_events IS NULL THEN
    v_max_scene_events := 0;
  END IF;

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'scene_regular',
    v_max_scene_events,
    3,  -- Bronze
    6,  -- Silver
    10, -- Gold
    jsonb_build_object('max_scene_events', v_max_scene_events, 'scene_id', v_scene_id)
  );
END;
$$;

-- Step 11: Road Tripper (1/3/6 out-of-town shows)
-- Out-of-town: events not in user's home city (inferred from most frequent city)
CREATE OR REPLACE FUNCTION public.detect_road_tripper(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_home_city TEXT;
  v_out_of_town_count INTEGER;
BEGIN
  -- Find user's home city (most frequent city in passport entries)
  SELECT pe.entity_id
  INTO v_home_city
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.type = 'city'
  GROUP BY pe.entity_id
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  -- Count events outside home city
  IF v_home_city IS NOT NULL THEN
    SELECT COUNT(DISTINCT r.event_id)
    INTO v_out_of_town_count
    FROM public.reviews r
    INNER JOIN public.events e ON e.id = r.event_id
    INNER JOIN public.venues v ON v.id = e.venue_id
    WHERE r.user_id = p_user_id
      AND (r.was_there = true OR r.review_text IS NOT NULL)
      AND LOWER(COALESCE(v.city, '') || '_' || COALESCE(v.state, '')) != LOWER(v_home_city);
  ELSE
    v_out_of_town_count := 0;
  END IF;

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'road_tripper',
    v_out_of_town_count,
    1, -- Bronze
    3, -- Silver
    6, -- Gold
    jsonb_build_object('out_of_town_shows', v_out_of_town_count, 'home_city', v_home_city)
  );
END;
$$;

-- Step 12: Venue Loyalist (3/6/10 shows at the same venue)
CREATE OR REPLACE FUNCTION public.detect_venue_loyalist(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_max_venue_events INTEGER;
  v_venue_id UUID;
BEGIN
  -- Find the venue with most events attended
  SELECT pe.entity_uuid, COUNT(*)
  INTO v_venue_id, v_max_venue_events
  FROM public.passport_entries pe
  WHERE pe.user_id = p_user_id
    AND pe.type = 'venue'
    AND pe.entity_uuid IS NOT NULL
  GROUP BY pe.entity_uuid
  ORDER BY COUNT(*) DESC
  LIMIT 1;

  IF v_max_venue_events IS NULL THEN
    v_max_venue_events := 0;
  END IF;

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'venue_loyalist',
    v_max_venue_events,
    3,  -- Bronze
    6,  -- Silver
    10, -- Gold
    jsonb_build_object('max_venue_events', v_max_venue_events, 'venue_id', v_venue_id)
  );
END;
$$;

-- Step 13: Genre Blender (2/4/6 genres)
CREATE OR REPLACE FUNCTION public.detect_genre_blender(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_genre_count INTEGER;
BEGIN
  -- Count distinct genres from attended events
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

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'genre_blender',
    v_genre_count,
    2, -- Bronze
    4, -- Silver
    6, -- Gold
    jsonb_build_object('genre_count', v_genre_count)
  );
END;
$$;

-- Step 14: Memory Maker (1/3/5 pinned shows)
CREATE OR REPLACE FUNCTION public.detect_memory_maker(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pinned_count INTEGER;
BEGIN
  SELECT COUNT(*)
  INTO v_pinned_count
  FROM public.passport_timeline
  WHERE user_id = p_user_id
    AND is_pinned = true;

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'memory_maker',
    v_pinned_count,
    1, -- Bronze
    3, -- Silver
    5, -- Gold
    jsonb_build_object('pinned_shows', v_pinned_count)
  );
END;
$$;

-- Step 15: Early Adopter (1/3/5 shows shortly after joining)
CREATE OR REPLACE FUNCTION public.detect_early_adopter(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_join_date TIMESTAMPTZ;
  v_early_events_count INTEGER;
  v_cutoff_date TIMESTAMPTZ;
BEGIN
  -- Get user's join date (account creation)
  SELECT created_at
  INTO v_join_date
  FROM auth.users
  WHERE id = p_user_id;

  IF v_join_date IS NULL THEN
    RETURN;
  END IF;

  -- Early adopter: events within 30 days of joining
  v_cutoff_date := v_join_date + INTERVAL '30 days';

  SELECT COUNT(DISTINCT r.event_id)
  INTO v_early_events_count
  FROM public.reviews r
  INNER JOIN public.events e ON e.id = r.event_id
  WHERE r.user_id = p_user_id
    AND (r.was_there = true OR r.review_text IS NOT NULL)
    AND r.created_at <= v_cutoff_date
    AND r.created_at >= v_join_date;

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'early_adopter',
    v_early_events_count,
    1, -- Bronze
    3, -- Silver
    5, -- Gold
    jsonb_build_object('early_events', v_early_events_count, 'join_date', v_join_date)
  );
END;
$$;

-- Step 16: Connector (2/5/10 shows with friends)
-- Shows with friends: events where friends also attended
CREATE OR REPLACE FUNCTION public.detect_connector(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_friend_shows_count INTEGER;
BEGIN
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

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'connector',
    v_friend_shows_count,
    2,  -- Bronze
    5,  -- Silver
    10, -- Gold
    jsonb_build_object('friend_shows', v_friend_shows_count)
  );
END;
$$;

-- Step 17: Passport Complete (5/10/15 achievements unlocked)
CREATE OR REPLACE FUNCTION public.detect_passport_complete(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_achievement_count INTEGER;
BEGIN
  -- Count distinct achievement types unlocked (any tier)
  SELECT COUNT(DISTINCT achievement_type)
  INTO v_achievement_count
  FROM public.passport_achievements
  WHERE user_id = p_user_id
    AND achievement_type != 'passport_complete'; -- Don't count itself

  PERFORM public.check_tiered_achievement(
    p_user_id,
    'passport_complete',
    v_achievement_count,
    5,  -- Bronze
    10, -- Silver
    15, -- Gold
    jsonb_build_object('achievements_unlocked', v_achievement_count)
  );
END;
$$;

-- Step 18: Master function to check all achievements
CREATE OR REPLACE FUNCTION public.check_all_achievements(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM public.detect_venue_hopper(p_user_id);
  PERFORM public.detect_scene_explorer(p_user_id);
  PERFORM public.detect_city_crosser(p_user_id);
  PERFORM public.detect_era_walker(p_user_id);
  PERFORM public.detect_first_through_door(p_user_id);
  PERFORM public.detect_trusted_voice(p_user_id);
  PERFORM public.detect_deep_cut_reviewer(p_user_id);
  PERFORM public.detect_scene_regular(p_user_id);
  PERFORM public.detect_road_tripper(p_user_id);
  PERFORM public.detect_venue_loyalist(p_user_id);
  PERFORM public.detect_genre_blender(p_user_id);
  PERFORM public.detect_memory_maker(p_user_id);
  PERFORM public.detect_early_adopter(p_user_id);
  PERFORM public.detect_connector(p_user_id);
  PERFORM public.detect_passport_complete(p_user_id);
END;
$$;

-- Step 19: Grant permissions
GRANT EXECUTE ON FUNCTION public.check_tiered_achievement(UUID, TEXT, INTEGER, INTEGER, INTEGER, INTEGER, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_venue_hopper(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_scene_explorer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_city_crosser(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_era_walker(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_first_through_door(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_trusted_voice(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_deep_cut_reviewer(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_scene_regular(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_road_tripper(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_venue_loyalist(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_genre_blender(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_memory_maker(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_early_adopter(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_connector(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.detect_passport_complete(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_all_achievements(UUID) TO authenticated;

-- Step 20: Comments
COMMENT ON COLUMN public.passport_achievements.tier IS 'Achievement tier: bronze, silver, or gold';
COMMENT ON COLUMN public.passport_achievements.progress IS 'Current progress towards the achievement goal';
COMMENT ON COLUMN public.passport_achievements.goal IS 'Goal value for the current tier';

