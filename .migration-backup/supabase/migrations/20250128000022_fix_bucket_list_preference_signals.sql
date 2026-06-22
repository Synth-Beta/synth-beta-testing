-- ============================================
-- FIX: BUCKET LIST PREFERENCE SIGNALS
-- ============================================
-- This migration fixes the trigger to ensure preference signals are created
-- when items are added to the bucket list.
-- It uses 'save' as the signal type (which we know exists) and adds
-- metadata to indicate it came from the bucket list.

-- Drop and recreate the function with a simpler, more reliable approach
CREATE OR REPLACE FUNCTION public.update_preference_signals_on_bucket_list_add()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_genre TEXT;
  v_artist_genres TEXT[];
  v_entity_type_text TEXT;
BEGIN
  v_entity_type_text := NEW.entity_type;
  
  IF NEW.entity_type = 'artist' THEN
    -- Get artist genres
    SELECT genres INTO v_artist_genres
    FROM public.artists
    WHERE id = NEW.entity_id;
    
    -- Insert preference signal for the artist
    -- Use 'streaming_profile_synced' signal type (which exists in the enum)
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
      'streaming_profile_synced'::public.preference_signal_type,
      v_entity_type_text::public.preference_entity_type,
      NEW.entity_id,
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
    
    -- Create genre preference signals if artist has genres
    IF v_artist_genres IS NOT NULL AND array_length(v_artist_genres, 1) > 0 THEN
      FOREACH v_genre IN ARRAY v_artist_genres
      LOOP
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
          'streaming_profile_synced'::public.preference_signal_type,
          'genre'::public.preference_entity_type,
          NULL,
          v_genre,
          1.5, -- Slightly lower weight for inferred genre preferences
          v_genre,
          jsonb_build_object(
            'source', 'bucket_list',
            'inferred_from', NEW.entity_name,
            'entity_type', NEW.entity_type,
            'entity_id', NEW.entity_id
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
      END LOOP;
    END IF;
    
  ELSIF NEW.entity_type = 'venue' THEN
    -- Insert preference signal for the venue
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
      'streaming_profile_synced'::public.preference_signal_type,
      v_entity_type_text::public.preference_entity_type,
      NEW.entity_id,
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
  END IF;
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the trigger
  RAISE WARNING 'Error in update_preference_signals_on_bucket_list_add: % - %', SQLERRM, SQLSTATE;
  RETURN NEW;
END;
$$;

-- Ensure the trigger exists
DROP TRIGGER IF EXISTS trigger_update_preferences_on_bucket_list_add ON public.bucket_list;
CREATE TRIGGER trigger_update_preferences_on_bucket_list_add
  AFTER INSERT ON public.bucket_list
  FOR EACH ROW
  EXECUTE FUNCTION public.update_preference_signals_on_bucket_list_add();

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.update_preference_signals_on_bucket_list_add() TO authenticated;

COMMENT ON FUNCTION public.update_preference_signals_on_bucket_list_add IS 'Creates preference signals when items are added to bucket list, using streaming_profile_synced signal type with bucket_list metadata';

-- ============================================
-- BACKFILL: Create preference signals for existing bucket list items
-- ============================================
-- This will create preference signals for any existing bucket list items
-- that don't already have corresponding signals

DO $$
DECLARE
  v_item RECORD;
  v_artist_genres TEXT[];
  v_genre TEXT;
BEGIN
  FOR v_item IN
    SELECT 
      bl.id,
      bl.user_id,
      bl.entity_type,
      bl.entity_id,
      bl.entity_name,
      bl.added_at
    FROM public.bucket_list bl
      WHERE NOT EXISTS (
      SELECT 1 
      FROM public.user_preference_signals ups
      WHERE ups.user_id = bl.user_id
        AND ups.entity_type::text = bl.entity_type
        AND ups.entity_id = bl.entity_id
        AND ups.signal_type = 'streaming_profile_synced'
        AND ups.context->>'source' = 'bucket_list'
    )
  LOOP
    BEGIN
      IF v_item.entity_type = 'artist' THEN
        -- Get artist genres
        SELECT genres INTO v_artist_genres
        FROM public.artists
        WHERE id = v_item.entity_id;
        
        -- Insert preference signal for artist
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
          v_item.user_id,
          'streaming_profile_synced'::public.preference_signal_type,
          v_item.entity_type::public.preference_entity_type,
          v_item.entity_id,
          v_item.entity_name,
          2.0,
          NULL,
          jsonb_build_object(
            'source', 'bucket_list',
            'added_at', v_item.added_at,
            'backfilled', true
          ),
          v_item.added_at,
          v_item.added_at,
          v_item.added_at
        )
        ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
        DO UPDATE SET
          signal_weight = GREATEST(user_preference_signals.signal_weight, 2.0),
          context = user_preference_signals.context || jsonb_build_object('bucket_list', true),
          updated_at = now();
        
        -- Create genre signals
        IF v_artist_genres IS NOT NULL AND array_length(v_artist_genres, 1) > 0 THEN
          FOREACH v_genre IN ARRAY v_artist_genres
          LOOP
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
              v_item.user_id,
              'streaming_profile_synced'::public.preference_signal_type,
              'genre'::public.preference_entity_type,
              NULL,
              v_genre,
              1.5,
              v_genre,
              jsonb_build_object(
                'source', 'bucket_list',
                'inferred_from', v_item.entity_name,
                'entity_type', v_item.entity_type,
                'entity_id', v_item.entity_id,
                'backfilled', true
              ),
              v_item.added_at,
              v_item.added_at,
              v_item.added_at
            )
            ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
            DO UPDATE SET
              signal_weight = GREATEST(user_preference_signals.signal_weight, 1.5),
              context = user_preference_signals.context || jsonb_build_object('bucket_list_inferred', true),
              updated_at = now();
          END LOOP;
        END IF;
        
      ELSIF v_item.entity_type = 'venue' THEN
        -- Insert preference signal for venue
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
          v_item.user_id,
          'streaming_profile_synced'::public.preference_signal_type,
          v_item.entity_type::public.preference_entity_type,
          v_item.entity_id,
          v_item.entity_name,
          2.0,
          NULL,
          jsonb_build_object(
            'source', 'bucket_list',
            'added_at', v_item.added_at,
            'backfilled', true
          ),
          v_item.added_at,
          v_item.added_at,
          v_item.added_at
        )
        ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
        DO UPDATE SET
          signal_weight = GREATEST(user_preference_signals.signal_weight, 2.0),
          context = user_preference_signals.context || jsonb_build_object('bucket_list', true),
          updated_at = now();
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Error backfilling preference signal for bucket list item %: %', v_item.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

