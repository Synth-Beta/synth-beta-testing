-- ============================================
-- FAN TYPE ARCHETYPE CALCULATOR
-- Algorithmically determines user's fan type based on behavior patterns
-- ============================================

CREATE OR REPLACE FUNCTION public.calculate_fan_type_archetype(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_venue_diversity_score NUMERIC;
  v_city_diversity_score NUMERIC;
  v_artist_loyalty_score NUMERIC;
  v_scene_participation_score NUMERIC;
  v_festival_ratio NUMERIC;
  v_total_events INTEGER;
  v_unique_venues INTEGER;
  v_unique_cities INTEGER;
  v_unique_artists INTEGER;
  v_total_reviews INTEGER;
  v_festival_events INTEGER;
  v_max_artist_shows INTEGER;
  v_scene_count INTEGER;
  v_scores JSONB;
  v_best_type TEXT;
  v_best_score NUMERIC := 0;
BEGIN
  -- Get basic stats (using reviews.was_there for attendance)
  SELECT 
    COUNT(DISTINCT e.id) FILTER (WHERE r.was_there = true),
    COUNT(DISTINCT e.venue_id) FILTER (WHERE r.was_there = true),
    COUNT(DISTINCT e.venue_city) FILTER (WHERE r.was_there = true),
    COUNT(DISTINCT e.artist_id) FILTER (WHERE r.was_there = true),
    COUNT(DISTINCT r.id) FILTER (WHERE r.was_there = true),
    COUNT(DISTINCT e.id) FILTER (WHERE r.was_there = true AND (e.venue_name ILIKE '%festival%' OR e.venue_name ILIKE '%fest%' OR e.title ILIKE '%festival%' OR e.title ILIKE '%fest%'))
  INTO v_total_events, v_unique_venues, v_unique_cities, v_unique_artists, v_total_reviews, v_festival_events
  FROM public.events e
  INNER JOIN public.reviews r ON r.event_id = e.id AND r.user_id = p_user_id AND r.was_there = true;

  -- Get max shows per artist (artist loyalty)
  SELECT COALESCE(MAX(artist_count), 0)
  INTO v_max_artist_shows
  FROM (
    SELECT e.artist_id, COUNT(DISTINCT e.id) as artist_count
    FROM public.events e
    INNER JOIN public.reviews r ON r.event_id = e.id AND r.user_id = p_user_id AND r.was_there = true
    WHERE e.artist_id IS NOT NULL
    GROUP BY e.artist_id
  ) artist_counts;

  -- Get scene participation count
  SELECT COUNT(DISTINCT scene_id)
  INTO v_scene_count
  FROM public.passport_entries
  WHERE user_id = p_user_id AND type = 'scene';

  -- Calculate scores (0-1 scale)
  -- Venue diversity: higher = more unique venues / total events
  v_venue_diversity_score := CASE 
    WHEN v_total_events > 0 THEN LEAST(v_unique_venues::NUMERIC / NULLIF(v_total_events, 0), 1.0)
    ELSE 0 
  END;

  -- City diversity: higher = more unique cities / total events
  v_city_diversity_score := CASE 
    WHEN v_total_events > 0 THEN LEAST(v_unique_cities::NUMERIC / NULLIF(v_total_events, 0), 1.0)
    ELSE 0 
  END;

  -- Artist loyalty: higher = max shows per artist / total events (inverse of diversity)
  v_artist_loyalty_score := CASE 
    WHEN v_total_events > 0 THEN LEAST(v_max_artist_shows::NUMERIC / NULLIF(v_total_events, 0), 1.0)
    ELSE 0 
  END;

  -- Scene participation: higher = more scenes (capped at 10 for normalization)
  v_scene_participation_score := LEAST(v_scene_count::NUMERIC / 10.0, 1.0);

  -- Festival ratio: higher = more festival events / total events
  v_festival_ratio := CASE 
    WHEN v_total_events > 0 THEN v_festival_events::NUMERIC / NULLIF(v_total_events, 0)
    ELSE 0 
  END;

  -- Calculate weighted scores for each archetype
  v_scores := jsonb_build_object(
    -- Jam Chaser: High artist loyalty, low venue diversity
    'jam_chaser', (v_artist_loyalty_score * 0.6) + ((1 - v_venue_diversity_score) * 0.4),
    
    -- Venue Purist: High venue repeat rate (low diversity), low city diversity
    'venue_purist', ((1 - v_venue_diversity_score) * 0.5) + ((1 - v_city_diversity_score) * 0.5),
    
    -- Scene Builder: High scene participation, attends events across related scenes
    'scene_builder', (v_scene_participation_score * 0.7) + (v_venue_diversity_score * 0.3),
    
    -- Road Tripper: High city diversity, attends events far from home
    'road_tripper', (v_city_diversity_score * 0.8) + (v_venue_diversity_score * 0.2),
    
    -- Genre Explorer: High genre diversity (inferred from artist diversity), low artist loyalty
    'genre_explorer', ((1 - v_artist_loyalty_score) * 0.6) + (v_venue_diversity_score * 0.4),
    
    -- Festival Fanatic: High festival attendance percentage
    'festival_fanatic', v_festival_ratio * 2.0  -- Multiply by 2 to weight festivals more
  );

  -- Find highest scoring archetype
  FOR v_best_type, v_best_score IN 
    SELECT key, (value::text)::numeric 
    FROM jsonb_each(v_scores)
    ORDER BY (value::text)::numeric DESC
    LIMIT 1
  LOOP
    EXIT;
  END LOOP;

  -- Default to genre_explorer if no clear pattern (low activity)
  IF v_total_events < 3 THEN
    RETURN 'genre_explorer';
  END IF;

  RETURN v_best_type;
END;
$$;

-- Function to update passport identity
CREATE OR REPLACE FUNCTION public.update_passport_identity(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fan_type TEXT;
  v_join_year INTEGER;
BEGIN
  -- Calculate fan type
  v_fan_type := public.calculate_fan_type_archetype(p_user_id);
  
  -- Get join year from users table
  SELECT EXTRACT(YEAR FROM created_at)::INTEGER
  INTO v_join_year
  FROM auth.users
  WHERE id = p_user_id;

  -- Insert or update passport identity
  INSERT INTO public.passport_identity (user_id, fan_type, join_year, updated_at)
  VALUES (p_user_id, v_fan_type, COALESCE(v_join_year, EXTRACT(YEAR FROM now())::INTEGER), now())
  ON CONFLICT (user_id) 
  DO UPDATE SET
    fan_type = EXCLUDED.fan_type,
    updated_at = EXCLUDED.updated_at;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.calculate_fan_type_archetype(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_passport_identity(UUID) TO authenticated;

COMMENT ON FUNCTION public.calculate_fan_type_archetype IS 'Algorithmically determines fan type archetype based on behavior patterns';
COMMENT ON FUNCTION public.update_passport_identity IS 'Updates passport identity with calculated fan type and join year';

