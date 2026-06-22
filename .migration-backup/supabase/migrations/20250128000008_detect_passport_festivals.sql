-- ============================================
-- FESTIVAL STAMP DETECTOR
-- Detects festivals via keyword matching and creates stamps
-- ============================================

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
  -- Find festivals from events user attended
  FOR v_festival IN
    SELECT DISTINCT
      COALESCE(
        -- Try to extract festival name from title
        CASE 
          WHEN e.title ILIKE '%festival%' THEN 
            SUBSTRING(e.title FROM '^([^:]+)(?::|$)')  -- Extract text before colon or to end
          WHEN e.venue_name ILIKE '%festival%' OR e.venue_name ILIKE '%fest%' THEN
            e.venue_name
          ELSE NULL
        END,
        e.venue_name  -- Fallback to venue name
      ) as name,
      e.venue_name as venue,
      EXTRACT(YEAR FROM e.event_date)::INTEGER as year
    FROM public.events e
    INNER JOIN public.reviews r ON r.event_id = e.id 
      AND r.user_id = p_user_id 
      AND r.was_there = true
    WHERE (
      e.venue_name ILIKE '%festival%' 
      OR e.venue_name ILIKE '%fest%' 
      OR e.venue_name ILIKE '%gathering%'
      OR e.venue_name ILIKE '%fair%'
      OR e.title ILIKE '%festival%'
      OR e.title ILIKE '%fest%'
    )
    AND e.venue_name IS NOT NULL
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.detect_festival_stamps(UUID) TO authenticated;

COMMENT ON FUNCTION public.detect_festival_stamps IS 'Detects festivals via keyword matching and creates/updates festival stamps (single stamp per festival with years_attended array)';

