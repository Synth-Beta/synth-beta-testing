-- ============================================
-- FUNCTION: UPDATE PREFERENCE SIGNALS ON BUCKET LIST ADD
-- ============================================
-- Creates preference signals when items are added to bucket list

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
BEGIN
  -- Check if 'bucket_list' is a valid enum value, if not use 'save' or 'interest' as fallback
  -- For now, we'll try 'bucket_list' and let the constraint handle validation
  
  v_entity_type_text := NEW.entity_type;
  
  -- Get genre information for artists (to enrich the preference signal)
  IF NEW.entity_type = 'artist' THEN
    SELECT genres INTO v_artist_genres
    FROM public.artists
    WHERE id = NEW.entity_id;
    
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
        NEW.entity_id,
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
          EXCEPTION WHEN OTHERS THEN
            -- Log but don't fail the trigger
            RAISE WARNING 'Could not insert genre preference signal for bucket list item: %', SQLERRM;
          END;
        END;
      END LOOP;
    END IF;
    
  ELSIF NEW.entity_type = 'venue' THEN
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
      EXCEPTION WHEN OTHERS THEN
        -- Log but don't fail the trigger
        RAISE WARNING 'Could not insert preference signal for bucket list venue: %', SQLERRM;
      END;
    END;
  END IF;
  
  RETURN NEW;
END;
$$;

-- ============================================
-- TRIGGER: UPDATE PREFERENCES ON BUCKET LIST ADD
-- ============================================

DROP TRIGGER IF EXISTS trigger_update_preferences_on_bucket_list_add ON public.bucket_list;
CREATE TRIGGER trigger_update_preferences_on_bucket_list_add
  AFTER INSERT ON public.bucket_list
  FOR EACH ROW
  EXECUTE FUNCTION public.update_preference_signals_on_bucket_list_add();

COMMENT ON FUNCTION public.update_preference_signals_on_bucket_list_add IS 'Creates preference signals when items are added to bucket list, including inferred genre preferences for artists';

