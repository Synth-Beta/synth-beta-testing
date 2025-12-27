-- ============================================
-- FIX PASSPORT FUNCTIONS FOR ACTUAL SCHEMA
-- Updates functions to use proper joins instead of non-existent columns
-- ============================================

-- Fix calculate_fan_type_archetype to join with venues for festival detection
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
  -- Join with venues to get venue name for festival detection
  SELECT 
    COUNT(DISTINCT e.id) FILTER (WHERE r.was_there = true),
    COUNT(DISTINCT e.venue_id) FILTER (WHERE r.was_there = true),
    COUNT(DISTINCT e.venue_city) FILTER (WHERE r.was_there = true),
    COUNT(DISTINCT e.artist_id) FILTER (WHERE r.was_there = true),
    COUNT(DISTINCT r.id) FILTER (WHERE r.was_there = true),
    COUNT(DISTINCT e.id) FILTER (WHERE r.was_there = true AND (
      COALESCE(v.name, '') ILIKE '%festival%' 
      OR COALESCE(v.name, '') ILIKE '%fest%' 
      OR COALESCE(v.name, '') ILIKE '%gathering%'
      OR COALESCE(v.name, '') ILIKE '%fair%'
      OR e.title ILIKE '%festival%' 
      OR e.title ILIKE '%fest%'
    ))
  INTO v_total_events, v_unique_venues, v_unique_cities, v_unique_artists, v_total_reviews, v_festival_events
  FROM public.events e
  INNER JOIN public.reviews r ON r.event_id = e.id AND r.user_id = p_user_id AND r.was_there = true
  LEFT JOIN public.venues v ON v.id = e.venue_id;

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

-- Fix enhance_passport_triggers to join with artists and venues
CREATE OR REPLACE FUNCTION public.auto_unlock_passport_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_data RECORD;
  v_artist_name TEXT;
  v_venue_name TEXT;
  v_jambase_artist_id TEXT;
  v_jambase_venue_id TEXT;
  v_is_festival BOOLEAN := false;
BEGIN
  -- Only process if review is not a draft and user attended
  IF NEW.is_draft = false AND (NEW.was_there = true OR NEW.review_text IS NOT NULL) THEN
    -- Get event details with joins to artists and venues
    SELECT 
      e.venue_city,
      e.venue_state,
      e.venue_id,
      e.artist_id,
      e.title,
      e.id as event_id,
      v.name as venue_name,
      a.name as artist_name,
      eei_venue.external_id as jambase_venue_id,
      eei_artist.external_id as jambase_artist_id
    INTO v_event_data
    FROM public.events e
    LEFT JOIN public.venues v ON v.id = e.venue_id
    LEFT JOIN public.artists a ON a.id = e.artist_id
    LEFT JOIN public.external_entity_ids eei_venue ON eei_venue.entity_uuid = e.venue_id 
      AND eei_venue.entity_type = 'venue' 
      AND eei_venue.source = 'jambase'
    LEFT JOIN public.external_entity_ids eei_artist ON eei_artist.entity_uuid = e.artist_id 
      AND eei_artist.entity_type = 'artist' 
      AND eei_artist.source = 'jambase'
    WHERE e.id = NEW.event_id;
    
    IF v_event_data IS NOT NULL THEN
      v_venue_name := v_event_data.venue_name;
      v_artist_name := v_event_data.artist_name;
      v_jambase_venue_id := v_event_data.jambase_venue_id;
      v_jambase_artist_id := v_event_data.jambase_artist_id;

      -- Check if this is a festival
      v_is_festival := (
        COALESCE(v_venue_name, '') ILIKE '%festival%' 
        OR COALESCE(v_venue_name, '') ILIKE '%fest%' 
        OR COALESCE(v_venue_name, '') ILIKE '%gathering%'
        OR COALESCE(v_venue_name, '') ILIKE '%fair%'
        OR COALESCE(v_event_data.title, '') ILIKE '%festival%'
        OR COALESCE(v_event_data.title, '') ILIKE '%fest%'
      );

      -- Unlock city (skip if "Unknown")
      IF v_event_data.venue_city IS NOT NULL 
         AND LOWER(TRIM(v_event_data.venue_city)) != 'unknown' THEN
        PERFORM public.unlock_passport_city(
          NEW.user_id,
          v_event_data.venue_city,
          v_event_data.venue_state
        );
        
        -- Check for first-time city achievement
        PERFORM public.detect_first_time_city(NEW.user_id, NEW.event_id);
      END IF;
      
      -- Unlock venue using JamBase ID if available, otherwise use venue UUID as entity_id
      IF v_venue_name IS NOT NULL THEN
        PERFORM public.unlock_passport_venue(
          NEW.user_id,
          COALESCE(v_jambase_venue_id, v_event_data.venue_id::TEXT, ''),
          v_venue_name
        );
      END IF;
      
      -- Unlock artist using JamBase ID if available, otherwise use artist UUID as entity_id
      IF v_artist_name IS NOT NULL THEN
        PERFORM public.unlock_passport_artist(
          NEW.user_id,
          COALESCE(v_jambase_artist_id, v_event_data.artist_id::TEXT, ''),
          v_artist_name
        );
      END IF;

      -- Detect festivals (runs detection which handles existing stamps)
      IF v_is_festival THEN
        PERFORM public.detect_festival_stamps(NEW.user_id);
      END IF;

      -- Calculate artist milestones
      PERFORM public.calculate_artist_milestones(NEW.user_id);

      -- Check for deep cut reviewer achievement (after review is saved)
      IF NEW.review_text IS NOT NULL AND NEW.review_text != 'ATTENDANCE_ONLY' THEN
        PERFORM public.detect_deep_cut_reviewer(NEW.user_id);
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Fix detect_festival_stamps to join with venues
CREATE OR REPLACE FUNCTION public.detect_festival_stamps(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_festival RECORD;
  v_entity_id TEXT;
  v_festival_name TEXT;
  v_years_attended INTEGER[];
  v_metadata JSONB;
  v_existing_metadata JSONB;
  v_existing_years INTEGER[];
BEGIN
  -- Find festivals from events user attended, joining with venues
  FOR v_festival IN
    SELECT DISTINCT
      COALESCE(
        -- Try to extract festival name from title
        CASE 
          WHEN e.title ILIKE '%festival%' THEN 
            SUBSTRING(e.title FROM '^([^:]+)(?::|$)')  -- Extract text before colon or to end
          WHEN COALESCE(v.name, '') ILIKE '%festival%' OR COALESCE(v.name, '') ILIKE '%fest%' THEN
            v.name
          ELSE NULL
        END,
        v.name  -- Fallback to venue name
      ) as name,
      v.name as venue,
      EXTRACT(YEAR FROM e.event_date)::INTEGER as year
    FROM public.events e
    INNER JOIN public.reviews r ON r.event_id = e.id 
      AND r.user_id = p_user_id 
      AND r.was_there = true
    LEFT JOIN public.venues v ON v.id = e.venue_id
    WHERE (
      COALESCE(v.name, '') ILIKE '%festival%' 
      OR COALESCE(v.name, '') ILIKE '%fest%' 
      OR COALESCE(v.name, '') ILIKE '%gathering%'
      OR COALESCE(v.name, '') ILIKE '%fair%'
      OR e.title ILIKE '%festival%'
      OR e.title ILIKE '%fest%'
    )
    AND v.name IS NOT NULL
    ORDER BY name, year
  LOOP
    -- Normalize festival name for entity_id
    v_festival_name := TRIM(v_festival.name);
    v_entity_id := LOWER(REPLACE(REPLACE(REPLACE(v_festival_name, ' ', '_'), '''', ''), '-', '_'));

    -- Check if stamp already exists
    SELECT metadata
    INTO v_existing_metadata
    FROM public.passport_entries
    WHERE user_id = p_user_id
      AND type = 'festival'
      AND entity_id = v_entity_id;

    IF v_existing_metadata IS NOT NULL THEN
      -- Extract existing years and add new year if not present
      v_existing_years := ARRAY(
        SELECT jsonb_array_elements_text(v_existing_metadata->'years_attended')
      )::INTEGER[];
      
      IF NOT (v_festival.year = ANY(v_existing_years)) THEN
        v_existing_years := array_append(v_existing_years, v_festival.year);
        v_metadata := v_existing_metadata || jsonb_build_object(
          'years_attended', to_jsonb(v_existing_years)
        );

        -- Update existing stamp
        UPDATE public.passport_entries
        SET 
          metadata = v_metadata,
          unlocked_at = now(),
          rarity = CASE 
            WHEN array_length(v_existing_years, 1) >= 5 THEN 'legendary'
            WHEN array_length(v_existing_years, 1) >= 3 THEN 'uncommon'
            ELSE 'common'
          END
        WHERE user_id = p_user_id
          AND type = 'festival'
          AND entity_id = v_entity_id;
      END IF;
    ELSE
      -- Create new festival stamp
      v_years_attended := ARRAY[v_festival.year];
      v_metadata := jsonb_build_object(
        'years_attended', to_jsonb(v_years_attended),
        'festival_type', 'music',
        'venue', v_festival.venue
      );

      INSERT INTO public.passport_entries (
        user_id,
        type,
        entity_id,
        entity_name,
        rarity,
        cultural_context,
        metadata
      )
      VALUES (
        p_user_id,
        'festival',
        v_entity_id,
        v_festival_name,
        'common',
        'Annual music celebration you''ve experienced',
        v_metadata
      )
      ON CONFLICT (user_id, type, entity_id) DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- Fix calculate_artist_milestones to join with artists
CREATE OR REPLACE FUNCTION public.calculate_artist_milestones(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_artist RECORD;
  v_entity_id TEXT;
  v_milestone_name TEXT;
  v_metadata JSONB;
  v_show_count INTEGER;
  v_first_seen DATE;
  v_last_seen DATE;
  v_year_span INTEGER;
  v_cities TEXT[];
  v_jambase_artist_id TEXT;
BEGIN
  -- Find artists with milestone-worthy attendance, joining with artists table
  FOR v_artist IN
    SELECT 
      e.artist_id,
      a.name as artist_name,
      COUNT(DISTINCT e.id) as show_count,
      MIN(e.event_date)::DATE as first_seen,
      MAX(e.event_date)::DATE as last_seen,
      array_agg(DISTINCT e.venue_city) FILTER (WHERE e.venue_city IS NOT NULL) as cities,
      eei.external_id as jambase_artist_id
    FROM public.events e
    INNER JOIN public.reviews r ON r.event_id = e.id 
      AND r.user_id = p_user_id 
      AND r.was_there = true
    LEFT JOIN public.artists a ON a.id = e.artist_id
    LEFT JOIN public.external_entity_ids eei ON eei.entity_uuid = e.artist_id 
      AND eei.entity_type = 'artist' 
      AND eei.source = 'jambase'
    WHERE e.artist_id IS NOT NULL
      AND a.name IS NOT NULL
    GROUP BY e.artist_id, a.name, eei.external_id
    HAVING COUNT(DISTINCT e.id) >= 5  -- Minimum 5 shows for milestone
  LOOP
    v_show_count := v_artist.show_count;
    v_first_seen := v_artist.first_seen;
    v_last_seen := v_artist.last_seen;
    v_year_span := EXTRACT(YEAR FROM v_last_seen)::INTEGER - EXTRACT(YEAR FROM v_first_seen)::INTEGER;
    v_cities := v_artist.cities;
    v_jambase_artist_id := COALESCE(v_artist.jambase_artist_id, v_artist.artist_id::TEXT);

    -- Determine milestone type and name
    IF v_show_count >= 10 THEN
      v_milestone_name := v_artist.artist_name || ' – 10+ Shows';
      v_entity_id := v_jambase_artist_id || '_milestone_10plus';
    ELSIF v_show_count >= 5 THEN
      v_milestone_name := v_artist.artist_name || ' – 5+ Shows';
      v_entity_id := v_jambase_artist_id || '_milestone_5plus';
    ELSE
      CONTINUE;  -- Skip if below threshold
    END IF;

    -- Build metadata
    v_metadata := jsonb_build_object(
      'show_count', v_show_count,
      'first_seen', v_first_seen,
      'last_seen', v_last_seen,
      'year_span', v_year_span,
      'cities', v_cities,
      'is_multi_era', v_year_span >= 3
    );

    -- Insert or update milestone stamp
    INSERT INTO public.passport_entries (
      user_id,
      type,
      entity_id,
      entity_name,
      rarity,
      cultural_context,
      metadata
    )
    VALUES (
      p_user_id,
      'artist_milestone',
      v_entity_id,
      v_milestone_name,
      CASE 
        WHEN v_show_count >= 20 OR v_year_span >= 5 THEN 'legendary'
        WHEN v_show_count >= 10 OR v_year_span >= 3 THEN 'uncommon'
        ELSE 'common'
      END,
      CASE 
        WHEN v_year_span >= 3 THEN 'Following ' || v_artist.artist_name || ' across ' || v_year_span || ' years'
        ELSE v_show_count || ' shows with ' || v_artist.artist_name
      END,
      v_metadata
    )
    ON CONFLICT (user_id, type, entity_id) 
    DO UPDATE SET
      entity_name = EXCLUDED.entity_name,
      rarity = EXCLUDED.rarity,
      cultural_context = EXCLUDED.cultural_context,
      metadata = EXCLUDED.metadata,
      unlocked_at = now();

    -- Also create multi-era milestone if applicable
    IF v_year_span >= 3 THEN
      v_milestone_name := v_artist.artist_name || ' – Multi-Era Attendance';
      v_entity_id := v_jambase_artist_id || '_milestone_multiera';
      
      INSERT INTO public.passport_entries (
        user_id,
        type,
        entity_id,
        entity_name,
        rarity,
        cultural_context,
        metadata
      )
      VALUES (
        p_user_id,
        'artist_milestone',
        v_entity_id,
        v_milestone_name,
        'legendary',
        'Following ' || v_artist.artist_name || ' across ' || v_year_span || ' years of evolution',
        v_metadata
      )
      ON CONFLICT (user_id, type, entity_id) 
      DO UPDATE SET
        entity_name = EXCLUDED.entity_name,
        rarity = EXCLUDED.rarity,
        cultural_context = EXCLUDED.cultural_context,
        metadata = EXCLUDED.metadata,
        unlocked_at = now();
    END IF;
  END LOOP;
END;
$$;

-- Fix calculate_taste_map to join with venues
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
  -- Categorize venues by size/type from events attended, joining with venues
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
        WHEN COALESCE(v.name, '') ILIKE '%club%' 
          OR COALESCE(v.name, '') ILIKE '%bar%' 
          OR COALESCE(v.name, '') ILIKE '%theater%' 
          OR COALESCE(v.name, '') ILIKE '%hall%'
          THEN 'small'
        WHEN COALESCE(v.name, '') ILIKE '%stadium%' 
          OR COALESCE(v.name, '') ILIKE '%arena%' 
          OR COALESCE(v.name, '') ILIKE '%amphitheater%'
          OR COALESCE(v.name, '') ILIKE '%amphitheatre%'
          THEN 'big'
        WHEN COALESCE(v.name, '') ILIKE '%festival%' 
          OR COALESCE(v.name, '') ILIKE '%fest%' 
          OR e.title ILIKE '%festival%'
          THEN 'festival'
        ELSE 'other'
      END as venue_type
    FROM public.events e
    INNER JOIN public.reviews r ON r.event_id = e.id 
      AND r.user_id = p_user_id 
      AND r.was_there = true
    LEFT JOIN public.venues v ON v.id = e.venue_id
    WHERE v.name IS NOT NULL
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
  -- Infer from genre characteristics and venue types, joining with venues
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
          OR COALESCE(v.name, '') ILIKE '%club%'
          OR COALESCE(v.name, '') ILIKE '%jazz%'
          THEN 'intimate'
        -- Chaotic: EDM, metal, punk, festivals, large venues
        WHEN e.genres && ARRAY['edm', 'electronic', 'metal', 'punk', 'hardcore']
          OR COALESCE(v.name, '') ILIKE '%festival%'
          OR COALESCE(v.name, '') ILIKE '%stadium%'
          OR COALESCE(v.name, '') ILIKE '%arena%'
          THEN 'chaotic'
        -- Moderate: everything else
        ELSE 'moderate'
      END as energy
    FROM public.events e
    INNER JOIN public.reviews r ON r.event_id = e.id 
      AND r.user_id = p_user_id 
      AND r.was_there = true
    LEFT JOIN public.venues v ON v.id = e.venue_id
    WHERE e.genres IS NOT NULL OR v.name IS NOT NULL
  ) energy_categorized;

  IF v_energy_data.total > 0 THEN
    v_energy_preference := jsonb_build_object(
      'intimate', (v_energy_data.intimate::numeric / v_energy_data.total)::numeric(5,4),
      'moderate', (v_energy_data.moderate::numeric / v_energy_data.total)::numeric(5,4),
      'chaotic', (v_energy_data.chaotic::numeric / v_energy_data.total)::numeric(5,4)
    );
  END IF;

  -- 4. Calculate Era Bias (legacy vs new acts)
  -- Compare artist formation dates to current year, joining with artists
  SELECT 
    COUNT(*) FILTER (WHERE is_legacy = true) as legacy,
    COUNT(*) FILTER (WHERE is_legacy = false) as new_acts,
    COUNT(*) as total
  INTO v_era_data
  FROM (
    SELECT DISTINCT e.id,
      CASE 
        -- If artist formed more than 20 years ago, consider legacy
        WHEN a.founding_date IS NOT NULL 
          AND EXTRACT(YEAR FROM a.founding_date::date) < (v_current_year - 20)
        THEN true
        -- If no founding date, use heuristics (could be improved)
        WHEN e.genres && ARRAY['classic rock', 'jazz', 'blues', 'country']
        THEN true
        ELSE false
      END as is_legacy
    FROM public.events e
    INNER JOIN public.reviews r ON r.event_id = e.id 
      AND r.user_id = p_user_id 
      AND r.was_there = true
    LEFT JOIN public.artists a ON a.id = e.artist_id
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

COMMENT ON FUNCTION public.calculate_fan_type_archetype IS 'Fixed: Uses proper joins with venues table for festival detection';
COMMENT ON FUNCTION public.auto_unlock_passport_on_review IS 'Fixed: Joins with artists and venues tables, uses external_entity_ids for JamBase IDs';
COMMENT ON FUNCTION public.detect_festival_stamps IS 'Fixed: Joins with venues table to get venue names';
COMMENT ON FUNCTION public.calculate_artist_milestones IS 'Fixed: Joins with artists table to get artist names';
COMMENT ON FUNCTION public.calculate_taste_map IS 'Fixed: Joins with venues and artists tables for venue/artist data';

-- Also need to fix the original auto_unlock_passport_on_interest function
CREATE OR REPLACE FUNCTION public.auto_unlock_passport_on_interest()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_data RECORD;
BEGIN
  -- Only process if user marked as interested
  IF NEW.relationship_type = 'interest' THEN
    -- Get event details - join with venues to get city info
    SELECT 
      e.venue_city,
      e.venue_state
    INTO v_event_data
    FROM public.events e
    WHERE e.id = NEW.event_id;
    
    IF v_event_data IS NOT NULL THEN
      -- Unlock city (skip if "Unknown")
      IF v_event_data.venue_city IS NOT NULL 
         AND LOWER(TRIM(v_event_data.venue_city)) != 'unknown' THEN
        PERFORM public.unlock_passport_city(
          NEW.user_id,
          v_event_data.venue_city,
          v_event_data.venue_state
        );
      END IF;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

