-- ============================================
-- ERA STAMP DETECTOR
-- Detects user-specific eras based on attendance patterns
-- ============================================

CREATE OR REPLACE FUNCTION public.detect_user_eras(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_era RECORD;
  v_start_date DATE;
  v_end_date DATE;
  v_city TEXT;
  v_event_count INTEGER;
  v_era_name TEXT;
  v_entity_id TEXT;
  v_metadata JSONB;
BEGIN
  -- Find time clusters with geographic and genre consistency
  -- Group events by year and city, looking for clusters of activity
  FOR v_era IN
    WITH event_attendance AS (
      SELECT 
        e.id,
        e.event_date::DATE as event_date,
        e.venue_city,
        e.venue_state,
        e.genres,
        EXTRACT(YEAR FROM e.event_date)::INTEGER as year
      FROM public.events e
      INNER JOIN public.reviews r ON r.event_id = e.id 
        AND r.user_id = p_user_id 
        AND r.was_there = true
      WHERE e.venue_city IS NOT NULL
        AND LOWER(TRIM(e.venue_city)) != 'unknown'
      ORDER BY e.event_date
    ),
    year_city_clusters AS (
      SELECT 
        year,
        venue_city,
        venue_state,
        MIN(event_date) as start_date,
        MAX(event_date) as end_date,
        COUNT(*) as event_count,
        array_agg(DISTINCT unnest(genres)) FILTER (WHERE genres IS NOT NULL) as primary_genres
      FROM event_attendance
      GROUP BY year, venue_city, venue_state
      HAVING COUNT(*) >= 3  -- Minimum 3 events per year/city
    ),
    consecutive_clusters AS (
      SELECT 
        venue_city,
        venue_state,
        MIN(start_date) as era_start,
        MAX(end_date) as era_end,
        SUM(event_count) as total_events,
        COUNT(DISTINCT year) as year_span,
        array_agg(DISTINCT unnest(primary_genres)) as all_genres
      FROM year_city_clusters ycc1
      WHERE EXISTS (
        -- Check for consecutive years
        SELECT 1 FROM year_city_clusters ycc2
        WHERE ycc2.venue_city = ycc1.venue_city
          AND ycc2.year = ycc1.year + 1
      ) OR year_span >= 2
      GROUP BY venue_city, venue_state
      HAVING SUM(event_count) >= 10  -- Minimum 10 events total
        AND MAX(end_date) - MIN(start_date) >= INTERVAL '2 years'  -- At least 2 years duration
    )
    SELECT 
      venue_city,
      venue_state,
      era_start::DATE,
      era_end::DATE,
      total_events,
      year_span,
      all_genres[1] as primary_genre
    FROM consecutive_clusters
    ORDER BY total_events DESC
  LOOP
    -- Generate era name
    v_era_name := v_era.venue_city || ' ' || 
      CASE 
        WHEN v_era.primary_genre IS NOT NULL THEN INITCAP(v_era.primary_genre) || ' '
        ELSE ''
      END ||
      EXTRACT(YEAR FROM v_era.era_start)::TEXT || '–' || 
      EXTRACT(YEAR FROM v_era.era_end)::TEXT;

    -- Create entity_id from city and years
    v_entity_id := LOWER(REPLACE(v_era.venue_city, ' ', '_')) || '_' || 
      EXTRACT(YEAR FROM v_era.era_start)::TEXT || '_' || 
      EXTRACT(YEAR FROM v_era.era_end)::TEXT;

    -- Build metadata
    v_metadata := jsonb_build_object(
      'start_date', v_era.era_start,
      'end_date', v_era.era_end,
      'event_count', v_era.total_events,
      'year_span', v_era.year_span,
      'primary_cities', ARRAY[v_era.venue_city],
      'primary_genre', v_era.primary_genre,
      'state', v_era.venue_state
    );

    -- Insert or update era stamp
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
      'era',
      v_entity_id,
      v_era_name,
      CASE 
        WHEN v_era.total_events >= 50 THEN 'legendary'
        WHEN v_era.total_events >= 25 THEN 'uncommon'
        ELSE 'common'
      END,
      'Your ' || v_era.year_span || '-year journey through ' || v_era.venue_city || '''s music scene',
      v_metadata
    )
    ON CONFLICT (user_id, type, entity_id) 
    DO UPDATE SET
      entity_name = EXCLUDED.entity_name,
      rarity = EXCLUDED.rarity,
      cultural_context = EXCLUDED.cultural_context,
      metadata = EXCLUDED.metadata,
      unlocked_at = now();
  END LOOP;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.detect_user_eras(UUID) TO authenticated;

COMMENT ON FUNCTION public.detect_user_eras IS 'Detects user-specific eras from attendance patterns (consecutive years, same city/region, genre consistency)';

