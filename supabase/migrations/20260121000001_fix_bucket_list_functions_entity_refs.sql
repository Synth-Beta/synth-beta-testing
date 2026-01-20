-- ============================================
-- FIX BUCKET LIST FUNCTIONS AFTER ENTITY MIGRATION
-- ============================================
-- This migration updates bucket_list related functions to use the new schema
-- where bucket_list.entity_id is an FK to entities.id instead of having entity_type
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: FIX notify_bucket_list_new_event FUNCTION
-- ============================================
-- Update to use entities table join instead of direct entity_type/entity_id columns

CREATE OR REPLACE FUNCTION public.notify_bucket_list_new_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bucket_list_user RECORD;
  v_artist_name TEXT;
  v_venue_name TEXT;
  v_event_title TEXT;
BEGIN
  -- Get event details
  SELECT COALESCE(NEW.title, 'New Event') INTO v_event_title;
  
  -- Notify users who have the artist in their bucket list
  IF NEW.artist_id IS NOT NULL THEN
    -- Get artist name
    SELECT name INTO v_artist_name
    FROM public.artists
    WHERE id = NEW.artist_id;
    
    IF v_artist_name IS NOT NULL THEN
      FOR v_bucket_list_user IN
        SELECT DISTINCT bl.user_id
        FROM public.bucket_list bl
        INNER JOIN public.entities e ON e.id = bl.entity_id
        WHERE e.entity_type = 'artist'
          AND e.entity_uuid = NEW.artist_id
      LOOP
        INSERT INTO public.notifications (
          user_id,
          type,
          title,
          message,
          data,
          is_read,
          created_at
        ) VALUES (
          v_bucket_list_user.user_id,
          'bucket_list_new_event',
          v_artist_name || ' has a new show!',
          v_event_title || 
            CASE 
              WHEN NEW.venue_id IS NOT NULL THEN
                ' at ' || COALESCE((SELECT name FROM public.venues WHERE id = NEW.venue_id), '')
              ELSE ''
            END ||
            ' on ' || to_char(NEW.event_date, 'Mon DD, YYYY'),
          jsonb_build_object(
            'event_id', NEW.id,
            'artist_id', NEW.artist_id,
            'artist_name', v_artist_name,
            'venue_id', NEW.venue_id,
            'venue_name', (SELECT name FROM public.venues WHERE id = NEW.venue_id),
            'event_title', v_event_title,
            'event_date', NEW.event_date,
            'entity_type', 'artist'
          ),
          false,
          now()
        );
      END LOOP;
    END IF;
  END IF;
  
  -- Notify users who have the venue in their bucket list
  IF NEW.venue_id IS NOT NULL THEN
    -- Get venue name
    SELECT name INTO v_venue_name
    FROM public.venues
    WHERE id = NEW.venue_id;
    
    IF v_venue_name IS NOT NULL THEN
      FOR v_bucket_list_user IN
        SELECT DISTINCT bl.user_id
        FROM public.bucket_list bl
        INNER JOIN public.entities e ON e.id = bl.entity_id
        WHERE e.entity_type = 'venue'
          AND e.entity_uuid = NEW.venue_id
      LOOP
        INSERT INTO public.notifications (
          user_id,
          type,
          title,
          message,
          data,
          is_read,
          created_at
        ) VALUES (
          v_bucket_list_user.user_id,
          'bucket_list_new_event',
          v_venue_name || ' has a new show!',
          v_event_title ||
            CASE 
              WHEN NEW.artist_id IS NOT NULL THEN
                ' with ' || COALESCE((SELECT name FROM public.artists WHERE id = NEW.artist_id), '')
              ELSE ''
            END ||
            ' on ' || to_char(NEW.event_date, 'Mon DD, YYYY'),
          jsonb_build_object(
            'event_id', NEW.id,
            'artist_id', NEW.artist_id,
            'artist_name', (SELECT name FROM public.artists WHERE id = NEW.artist_id),
            'venue_id', NEW.venue_id,
            'venue_name', v_venue_name,
            'event_title', v_event_title,
            'event_date', NEW.event_date,
            'entity_type', 'venue'
          ),
          false,
          now()
        );
      END LOOP;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.notify_bucket_list_new_event IS 'Notifies users when new events are created for artists or venues in their bucket list (updated for new entity schema)';

-- ============================================
-- STEP 2: FIX update_preference_signals_on_bucket_list_add FUNCTION
-- ============================================
-- Update to get entity_type from entities table instead of NEW.entity_type

CREATE OR REPLACE FUNCTION public.update_preference_signals_on_bucket_list_add()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_genre TEXT;
  v_artist_genres TEXT[];
  v_signal_type TEXT := 'bucket_list'; -- Default signal type
  v_entity_type_text TEXT;
  v_entity_uuid UUID;
BEGIN
  -- Get entity_type and entity_uuid from entities table
  SELECT e.entity_type, e.entity_uuid
  INTO v_entity_type_text, v_entity_uuid
  FROM public.entities e
  WHERE e.id = NEW.entity_id;
  
  IF v_entity_type_text IS NULL OR v_entity_uuid IS NULL THEN
    RAISE WARNING 'Entity not found for bucket_list item entity_id: %', NEW.entity_id;
    RETURN NEW;
  END IF;
  
  -- Get genre information for artists (to enrich the preference signal)
  IF v_entity_type_text = 'artist' THEN
    SELECT genres INTO v_artist_genres
    FROM public.artists
    WHERE id = v_entity_uuid;
    
    -- Insert preference signal for the artist
    -- Use explicit casting with error handling
    BEGIN
      INSERT INTO public.user_preference_signals (
        user_id,
        signal_type,
        entity_type,
        entity_id,
        entity_name,
        signal_weight,
        genre,
        context,
        occurred_at,
        created_at,
        updated_at
      ) VALUES (
        NEW.user_id,
        v_signal_type::public.preference_signal_type,
        v_entity_type_text::public.preference_entity_type,
        v_entity_uuid,
        NEW.entity_name,
        2.0, -- Higher weight for explicit bucket list additions
        NULL, -- Genre handled separately below
        jsonb_build_object(
          'source', 'bucket_list',
          'added_at', NEW.added_at
        ),
        NEW.added_at,
        NEW.added_at,
        NEW.added_at
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
      DO UPDATE SET
        signal_weight = GREATEST(user_preference_signals.signal_weight, 2.0),
        context = user_preference_signals.context || jsonb_build_object('bucket_list', true),
        updated_at = now();
    EXCEPTION WHEN invalid_text_representation THEN
      -- If enum casting fails, try with 'save' as signal type
      BEGIN
        INSERT INTO public.user_preference_signals (
          user_id,
          signal_type,
          entity_type,
          entity_id,
          entity_name,
          signal_weight,
          genre,
          context,
          occurred_at,
          created_at,
          updated_at
        ) VALUES (
          NEW.user_id,
          'save'::public.preference_signal_type,
          v_entity_type_text::public.preference_entity_type,
          v_entity_uuid,
          NEW.entity_name,
          2.0,
          NULL,
          jsonb_build_object(
            'source', 'bucket_list',
            'added_at', NEW.added_at
          ),
          NEW.added_at,
          NEW.added_at,
          NEW.added_at
        )
        ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
        DO UPDATE SET
          signal_weight = GREATEST(user_preference_signals.signal_weight, 2.0),
          context = user_preference_signals.context || jsonb_build_object('bucket_list', true),
          updated_at = now();
      EXCEPTION WHEN OTHERS THEN
        -- Log but don't fail the trigger
        RAISE WARNING 'Could not insert preference signal for bucket list item: %', SQLERRM;
      END;
    END;
    
    -- Also create genre preference signals if artist has genres
    IF v_artist_genres IS NOT NULL AND array_length(v_artist_genres, 1) > 0 THEN
      FOREACH v_genre IN ARRAY v_artist_genres
      LOOP
        BEGIN
          INSERT INTO public.user_preference_signals (
            user_id,
            signal_type,
            entity_type,
            entity_id,
            entity_name,
            signal_weight,
            genre,
            context,
            occurred_at,
            created_at,
            updated_at
          ) VALUES (
            NEW.user_id,
            v_signal_type::public.preference_signal_type,
            'genre'::public.preference_entity_type,
            NULL, -- No entity_id for genres
            v_genre,
            1.5, -- Slightly lower weight for inferred genre preferences
            v_genre,
            jsonb_build_object(
              'source', 'bucket_list',
              'inferred_from', NEW.entity_name,
              'entity_type', v_entity_type_text,
              'entity_id', v_entity_uuid
            ),
            NEW.added_at,
            NEW.added_at,
            NEW.added_at
          )
          ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
          DO UPDATE SET
            signal_weight = GREATEST(user_preference_signals.signal_weight, 1.5),
            context = user_preference_signals.context || jsonb_build_object('bucket_list_inferred', true),
            updated_at = now();
        EXCEPTION WHEN invalid_text_representation THEN
          -- Try with 'save' as signal type for genre
          BEGIN
            INSERT INTO public.user_preference_signals (
              user_id,
              signal_type,
              entity_type,
              entity_id,
              entity_name,
              signal_weight,
              genre,
              context,
              occurred_at,
              created_at,
              updated_at
            ) VALUES (
              NEW.user_id,
              'save'::public.preference_signal_type,
              'genre'::public.preference_entity_type,
              NULL,
              v_genre,
              1.5,
              v_genre,
              jsonb_build_object(
                'source', 'bucket_list',
                'inferred_from', NEW.entity_name,
                'entity_type', v_entity_type_text,
                'entity_id', v_entity_uuid
              ),
              NEW.added_at,
              NEW.added_at,
              NEW.added_at
            )
            ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
            DO UPDATE SET
              signal_weight = GREATEST(user_preference_signals.signal_weight, 1.5),
              context = user_preference_signals.context || jsonb_build_object('bucket_list_inferred', true),
              updated_at = now();
          EXCEPTION WHEN OTHERS THEN
            -- Log but don't fail the trigger
            RAISE WARNING 'Could not insert genre preference signal for bucket list item: %', SQLERRM;
          END;
        END;
      END LOOP;
    END IF;
    
  ELSIF v_entity_type_text = 'venue' THEN
    -- Insert preference signal for the venue
    BEGIN
      INSERT INTO public.user_preference_signals (
        user_id,
        signal_type,
        entity_type,
        entity_id,
        entity_name,
        signal_weight,
        genre,
        context,
        occurred_at,
        created_at,
        updated_at
      ) VALUES (
        NEW.user_id,
        v_signal_type::public.preference_signal_type,
        v_entity_type_text::public.preference_entity_type,
        v_entity_uuid,
        NEW.entity_name,
        2.0, -- Higher weight for explicit bucket list additions
        NULL,
        jsonb_build_object(
          'source', 'bucket_list',
          'added_at', NEW.added_at
        ),
        NEW.added_at,
        NEW.added_at,
        NEW.added_at
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
      DO UPDATE SET
        signal_weight = GREATEST(user_preference_signals.signal_weight, 2.0),
        context = user_preference_signals.context || jsonb_build_object('bucket_list', true),
        updated_at = now();
    EXCEPTION WHEN invalid_text_representation THEN
      -- If enum casting fails, try with 'save' as signal type
      BEGIN
        INSERT INTO public.user_preference_signals (
          user_id,
          signal_type,
          entity_type,
          entity_id,
          entity_name,
          signal_weight,
          genre,
          context,
          occurred_at,
          created_at,
          updated_at
        ) VALUES (
          NEW.user_id,
          'save'::public.preference_signal_type,
          v_entity_type_text::public.preference_entity_type,
          v_entity_uuid,
          NEW.entity_name,
          2.0,
          NULL,
          jsonb_build_object(
            'source', 'bucket_list',
            'added_at', NEW.added_at
          ),
          NEW.added_at,
          NEW.added_at,
          NEW.added_at
        )
        ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
        DO UPDATE SET
          signal_weight = GREATEST(user_preference_signals.signal_weight, 2.0),
          context = user_preference_signals.context || jsonb_build_object('bucket_list', true),
          updated_at = now();
      EXCEPTION WHEN OTHERS THEN
        -- Log but don't fail the trigger
        RAISE WARNING 'Could not insert preference signal for bucket list venue: %', SQLERRM;
      END;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_preference_signals_on_bucket_list_add IS 'Creates preference signals when items are added to bucket list, including inferred genre preferences for artists (updated for new entity schema)';

-- ============================================
-- STEP 3: FIX search_bucket_list FUNCTION
-- ============================================
-- Update to use entities table join for entity_type

CREATE OR REPLACE FUNCTION public.search_bucket_list(
  p_user_id UUID,
  p_search_query TEXT,
  p_limit INT DEFAULT 50
)
RETURNS TABLE(
  id UUID,
  user_id UUID,
  entity_type TEXT,
  entity_id UUID,
  entity_name TEXT,
  added_at TIMESTAMPTZ,
  metadata JSONB,
  similarity REAL,
  artist_id UUID,
  artist_name TEXT,
  artist_image_url TEXT,
  venue_id UUID,
  venue_name TEXT,
  venue_image_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH bucket_items AS (
    SELECT 
      bl.id,
      bl.user_id,
      e.entity_type,
      e.entity_uuid as entity_uuid_value,
      bl.entity_name,
      bl.added_at,
      bl.metadata,
      -- Calculate similarity score using trigram
      CASE 
        WHEN LOWER(bl.entity_name) = LOWER(p_search_query) THEN 1.0
        WHEN LOWER(bl.entity_name) LIKE LOWER(p_search_query) || '%' THEN 0.9
        WHEN LOWER(bl.entity_name) LIKE '%' || LOWER(p_search_query) || '%' THEN 0.8
        ELSE GREATEST(
          similarity(LOWER(bl.entity_name), LOWER(p_search_query)),
          word_similarity(LOWER(p_search_query), LOWER(bl.entity_name))
        )
      END as similarity
    FROM public.bucket_list bl
    INNER JOIN public.entities e ON e.id = bl.entity_id
    WHERE bl.user_id = p_user_id
      AND (
        -- Use ILIKE for initial filtering (uses trigram index efficiently)
        LOWER(bl.entity_name) ILIKE '%' || LOWER(p_search_query) || '%'
        -- OR use similarity for fuzzy matching
        OR similarity(LOWER(bl.entity_name), LOWER(p_search_query)) > 0.2
        OR word_similarity(LOWER(p_search_query), LOWER(bl.entity_name)) > 0.2
      )
  ),
  -- Enrich with artist/venue details
  enriched_items AS (
    SELECT 
      bi.*,
      CASE 
        WHEN bi.entity_type = 'artist' THEN a.id
        ELSE NULL
      END as artist_id,
      CASE 
        WHEN bi.entity_type = 'artist' THEN a.name
        ELSE NULL
      END as artist_name,
      CASE 
        WHEN bi.entity_type = 'artist' THEN a.image_url
        ELSE NULL
      END as artist_image_url,
      CASE 
        WHEN bi.entity_type = 'venue' THEN v.id
        ELSE NULL
      END as venue_id,
      CASE 
        WHEN bi.entity_type = 'venue' THEN v.name
        ELSE NULL
      END as venue_name,
      CASE 
        WHEN bi.entity_type = 'venue' THEN v.image_url
        ELSE NULL
      END as venue_image_url
    FROM bucket_items bi
    LEFT JOIN public.artists a ON bi.entity_type = 'artist' AND a.id = bi.entity_uuid_value
    LEFT JOIN public.venues v ON bi.entity_type = 'venue' AND v.id = bi.entity_uuid_value
  )
  SELECT 
    ei.id,
    ei.user_id,
    ei.entity_type,
    ei.entity_uuid_value as entity_id,
    ei.entity_name,
    ei.added_at,
    ei.metadata,
    ei.similarity,
    ei.artist_id,
    ei.artist_name,
    ei.artist_image_url,
    ei.venue_id,
    ei.venue_name,
    ei.venue_image_url
  FROM enriched_items ei
  WHERE ei.similarity >= 0.2  -- Minimum similarity threshold
  ORDER BY 
    -- Order by: exact match, prefix match, contains match, then similarity
    CASE 
      WHEN ei.similarity = 1.0 THEN 1
      WHEN ei.similarity >= 0.9 THEN 2
      WHEN ei.similarity >= 0.8 THEN 3
      ELSE 4
    END,
    ei.similarity DESC,
    ei.entity_name ASC
  LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION public.search_bucket_list IS 
  'Searches bucket list items using PostgreSQL trigram indexes for fast fuzzy matching. Returns results sorted by relevance. (Updated for new entity schema)';

-- ============================================
-- STEP 4: FIX backfill_bucket_list_preference_signals FUNCTION
-- ============================================
-- Update to use entities table join for entity_type

CREATE OR REPLACE FUNCTION public.backfill_bucket_list_preference_signals()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_item RECORD;
  v_genre TEXT;
  v_artist_genres TEXT[];
  v_signal_type TEXT := 'bucket_list';
  v_entity_type_text TEXT;
  v_entity_uuid UUID;
BEGIN
  FOR v_item IN
    SELECT 
      bl.id,
      bl.user_id,
      e.entity_type,
      e.entity_uuid,
      bl.entity_name,
      bl.added_at
    FROM public.bucket_list bl
    INNER JOIN public.entities e ON e.id = bl.entity_id
    WHERE NOT EXISTS (
      SELECT 1 
      FROM public.user_preference_signals ups
      WHERE ups.user_id = bl.user_id
        AND ups.entity_type::text = e.entity_type
        AND ups.entity_id = e.entity_uuid
        AND ups.signal_type = 'streaming_profile_synced'
        AND ups.context->>'source' = 'bucket_list'
    )
  LOOP
    BEGIN
      v_entity_type_text := v_item.entity_type;
      v_entity_uuid := v_item.entity_uuid;
      
      IF v_item.entity_type = 'artist' THEN
        -- Get artist genres
        SELECT genres INTO v_artist_genres
        FROM public.artists
        WHERE id = v_item.entity_uuid;
        
        -- Insert artist preference signal (similar logic to trigger function)
        -- ... (same logic as update_preference_signals_on_bucket_list_add)
        
      ELSIF v_item.entity_type = 'venue' THEN
        -- Insert venue preference signal
        -- ... (same logic as update_preference_signals_on_bucket_list_add)
        
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error processing bucket list item %: %', v_item.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.backfill_bucket_list_preference_signals IS 'Backfills preference signals for existing bucket list items (updated for new entity schema)';

COMMIT;

