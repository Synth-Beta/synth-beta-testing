-- ============================================
-- ARTIST MILESTONE CALCULATOR
-- Calculates artist milestones (5+ shows, 10+ shows, multi-era)
-- ============================================

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
BEGIN
  -- Find artists with milestone-worthy attendance
  FOR v_artist IN
    SELECT 
      e.artist_id,
      e.artist_name,
      COUNT(DISTINCT e.id) as show_count,
      MIN(e.event_date)::DATE as first_seen,
      MAX(e.event_date)::DATE as last_seen,
      array_agg(DISTINCT e.venue_city) FILTER (WHERE e.venue_city IS NOT NULL) as cities
    FROM public.events e
    INNER JOIN public.reviews r ON r.event_id = e.id 
      AND r.user_id = p_user_id 
      AND r.was_there = true
    WHERE e.artist_id IS NOT NULL
      AND e.artist_name IS NOT NULL
    GROUP BY e.artist_id, e.artist_name
    HAVING COUNT(DISTINCT e.id) >= 5  -- Minimum 5 shows for milestone
  LOOP
    v_show_count := v_artist.show_count;
    v_first_seen := v_artist.first_seen;
    v_last_seen := v_artist.last_seen;
    v_year_span := EXTRACT(YEAR FROM v_last_seen)::INTEGER - EXTRACT(YEAR FROM v_first_seen)::INTEGER;
    v_cities := v_artist.cities;

    -- Determine milestone type and name
    IF v_show_count >= 10 THEN
      v_milestone_name := v_artist.artist_name || ' – 10+ Shows';
      v_entity_id := v_artist.artist_id || '_milestone_10plus';
    ELSIF v_show_count >= 5 THEN
      v_milestone_name := v_artist.artist_name || ' – 5+ Shows';
      v_entity_id := v_artist.artist_id || '_milestone_5plus';
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
      v_entity_id := v_artist.artist_id || '_milestone_multiera';
      
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.calculate_artist_milestones(UUID) TO authenticated;

COMMENT ON FUNCTION public.calculate_artist_milestones IS 'Calculates artist milestones (5+ shows, 10+ shows, multi-era attendance spanning 3+ years)';

