-- ============================================
-- TASTE MAP CALCULATOR
-- Calculates passive taste fingerprint from user behavior
-- ============================================

CREATE OR REPLACE FUNCTION public.calculate_taste_map(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_core_genres JSONB := '{}'::jsonb;
  v_venue_affinity JSONB := '{}'::jsonb;
  v_energy_preference JSONB := '{}'::jsonb;
  v_era_bias JSONB := '{}'::jsonb;
  v_genre_data RECORD;
  v_total_genre_score NUMERIC;
  v_venue_data RECORD;
  v_small_rooms INTEGER := 0;
  v_big_sheds INTEGER := 0;
  v_festivals INTEGER := 0;
  v_other_venues INTEGER := 0;
  v_total_venue_events INTEGER := 0;
  v_energy_data RECORD;
  v_intimate INTEGER := 0;
  v_moderate INTEGER := 0;
  v_chaotic INTEGER := 0;
  v_total_energy_events INTEGER := 0;
  v_era_data RECORD;
  v_legacy_count INTEGER := 0;
  v_new_acts_count INTEGER := 0;
  v_total_era_events INTEGER := 0;
  v_current_year INTEGER;
BEGIN
  v_current_year := EXTRACT(YEAR FROM now())::INTEGER;

  -- 1. Calculate Core Genres from user_genre_preferences
  -- Normalize weights to 0-1 scale
  SELECT 
    SUM(preference_score) as total_score,
    jsonb_object_agg(genre, preference_score) as genre_map
  INTO v_genre_data
  FROM (
    SELECT 
      genre,
      SUM(preference_score) as preference_score
    FROM public.user_genre_preferences
    WHERE user_id = p_user_id
      AND genre IS NOT NULL
    GROUP BY genre
    ORDER BY SUM(preference_score) DESC
    LIMIT 20  -- Top 20 genres
  ) genre_scores;

  IF v_genre_data.total_score > 0 AND v_genre_data.genre_map IS NOT NULL THEN
    -- Normalize genre weights
    SELECT jsonb_object_agg(
      key,
      (value::numeric / v_genre_data.total_score)::numeric(5,4)
    )
    INTO v_core_genres
    FROM jsonb_each(v_genre_data.genre_map);
  END IF;

  -- 2. Calculate Venue Affinity
  -- Categorize venues by size/type from events attended
  SELECT 
    COUNT(*) FILTER (WHERE venue_type = 'small') as small,
    COUNT(*) FILTER (WHERE venue_type = 'big') as big,
    COUNT(*) FILTER (WHERE venue_type = 'festival') as festival,
    COUNT(*) FILTER (WHERE venue_type = 'other') as other,
    COUNT(*) as total
  INTO v_venue_data
  FROM (
    SELECT DISTINCT e.id,
      CASE 
        WHEN e.venue_name ILIKE '%club%' 
          OR e.venue_name ILIKE '%bar%' 
          OR e.venue_name ILIKE '%theater%' 
          OR e.venue_name ILIKE '%hall%'
          THEN 'small'
        WHEN e.venue_name ILIKE '%stadium%' 
          OR e.venue_name ILIKE '%arena%' 
          OR e.venue_name ILIKE '%amphitheater%'
          OR e.venue_name ILIKE '%amphitheatre%'
          THEN 'big'
        WHEN e.venue_name ILIKE '%festival%' 
          OR e.venue_name ILIKE '%fest%' 
          OR e.title ILIKE '%festival%'
          THEN 'festival'
        ELSE 'other'
      END as venue_type
    FROM public.events e
    INNER JOIN public.reviews r ON r.event_id = e.id 
      AND r.user_id = p_user_id 
      AND r.was_there = true
    WHERE e.venue_name IS NOT NULL
  ) venue_categorized;

  IF v_venue_data.total > 0 THEN
    v_venue_affinity := jsonb_build_object(
      'small_rooms', (v_venue_data.small::numeric / v_venue_data.total)::numeric(5,4),
      'big_sheds', (v_venue_data.big::numeric / v_venue_data.total)::numeric(5,4),
      'festivals', (v_venue_data.festival::numeric / v_venue_data.total)::numeric(5,4),
      'other', (v_venue_data.other::numeric / v_venue_data.total)::numeric(5,4)
    );
  END IF;

  -- 3. Calculate Energy Preference
  -- Infer from genre characteristics and venue types
  SELECT 
    COUNT(*) FILTER (WHERE energy = 'intimate') as intimate,
    COUNT(*) FILTER (WHERE energy = 'moderate') as moderate,
    COUNT(*) FILTER (WHERE energy = 'chaotic') as chaotic,
    COUNT(*) as total
  INTO v_energy_data
  FROM (
    SELECT DISTINCT e.id,
      CASE 
        -- Intimate: jazz, folk, acoustic, small venues
        WHEN e.genres && ARRAY['jazz', 'folk', 'acoustic', 'blues']
          OR e.venue_name ILIKE '%club%'
          OR e.venue_name ILIKE '%jazz%'
          THEN 'intimate'
        -- Chaotic: EDM, metal, punk, festivals, large venues
        WHEN e.genres && ARRAY['edm', 'electronic', 'metal', 'punk', 'hardcore']
          OR e.venue_name ILIKE '%festival%'
          OR e.venue_name ILIKE '%stadium%'
          OR e.venue_name ILIKE '%arena%'
          THEN 'chaotic'
        -- Moderate: everything else
        ELSE 'moderate'
      END as energy
    FROM public.events e
    INNER JOIN public.reviews r ON r.event_id = e.id 
      AND r.user_id = p_user_id 
      AND r.was_there = true
    WHERE e.genres IS NOT NULL OR e.venue_name IS NOT NULL
  ) energy_categorized;

  IF v_energy_data.total > 0 THEN
    v_energy_preference := jsonb_build_object(
      'intimate', (v_energy_data.intimate::numeric / v_energy_data.total)::numeric(5,4),
      'moderate', (v_energy_data.moderate::numeric / v_energy_data.total)::numeric(5,4),
      'chaotic', (v_energy_data.chaotic::numeric / v_energy_data.total)::numeric(5,4)
    );
  END IF;

  -- 4. Calculate Era Bias (legacy vs new acts)
  -- Compare artist formation dates to current year
  SELECT 
    COUNT(*) FILTER (WHERE is_legacy = true) as legacy,
    COUNT(*) FILTER (WHERE is_legacy = false) as new_acts,
    COUNT(*) as total
  INTO v_era_data
  FROM (
    SELECT DISTINCT e.id,
      CASE 
        -- If artist formed more than 20 years ago, consider legacy
        WHEN ap.founding_date IS NOT NULL 
          AND EXTRACT(YEAR FROM ap.founding_date::date) < (v_current_year - 20)
        THEN true
        -- If no founding date, use heuristics (could be improved)
        WHEN e.artist_name IS NOT NULL
          AND e.genres && ARRAY['classic rock', 'jazz', 'blues', 'country']
        THEN true
        ELSE false
      END as is_legacy
    FROM public.events e
    INNER JOIN public.reviews r ON r.event_id = e.id 
      AND r.user_id = p_user_id 
      AND r.was_there = true
    LEFT JOIN public.artists ap ON ap.jambase_artist_id = e.artist_id
  ) era_categorized;

  IF v_era_data.total > 0 THEN
    v_era_bias := jsonb_build_object(
      'legacy', (v_era_data.legacy::numeric / v_era_data.total)::numeric(5,4),
      'new_acts', (v_era_data.new_acts::numeric / v_era_data.total)::numeric(5,4)
    );
  END IF;

  -- Insert or update taste map
  INSERT INTO public.passport_taste_map (
    user_id,
    core_genres,
    venue_affinity,
    energy_preference,
    era_bias,
    calculated_at,
    updated_at
  )
  VALUES (
    p_user_id,
    v_core_genres,
    v_venue_affinity,
    v_energy_preference,
    v_era_bias,
    now(),
    now()
  )
  ON CONFLICT (user_id)
  DO UPDATE SET
    core_genres = EXCLUDED.core_genres,
    venue_affinity = EXCLUDED.venue_affinity,
    energy_preference = EXCLUDED.energy_preference,
    era_bias = EXCLUDED.era_bias,
    updated_at = EXCLUDED.updated_at;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.calculate_taste_map(UUID) TO authenticated;

COMMENT ON FUNCTION public.calculate_taste_map IS 'Calculates passive taste fingerprint from genre preferences, venue attendance, energy levels, and era bias';

