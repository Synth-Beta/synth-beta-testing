-- ============================================
-- CREATE BUCKET LIST TABLE
-- ============================================
-- Allows users to save artists and venues to their bucket list
-- When new events are announced for bucket list items, users get notified

CREATE TABLE IF NOT EXISTS public.bucket_list (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'venue')),
  entity_id UUID NOT NULL, -- References artists.id or venues.id
  entity_name TEXT NOT NULL, -- Denormalized for display
  added_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Ensure one entity per user (unique constraint)
  CONSTRAINT bucket_list_user_entity_unique UNIQUE (user_id, entity_type, entity_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bucket_list_user_id 
  ON public.bucket_list(user_id);

CREATE INDEX IF NOT EXISTS idx_bucket_list_entity 
  ON public.bucket_list(entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_bucket_list_added_at 
  ON public.bucket_list(added_at DESC);

-- Enable RLS
ALTER TABLE public.bucket_list ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own bucket list"
  ON public.bucket_list
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can add to their own bucket list"
  ON public.bucket_list
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can remove from their own bucket list"
  ON public.bucket_list
  FOR DELETE
  USING (auth.uid() = user_id);

-- Comments
COMMENT ON TABLE public.bucket_list IS 'User bucket list of artists and venues they want to see live';
COMMENT ON COLUMN public.bucket_list.entity_type IS 'Type of entity: artist or venue';
COMMENT ON COLUMN public.bucket_list.entity_id IS 'UUID of the artist or venue';
COMMENT ON COLUMN public.bucket_list.entity_name IS 'Name of the artist or venue (denormalized for quick display)';

-- ============================================
-- FUNCTION: NOTIFY BUCKET LIST USERS OF NEW EVENTS
-- ============================================
-- Triggers notification when new events are created for bucket list artists/venues

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
        WHERE bl.entity_type = 'artist'
          AND bl.entity_id = NEW.artist_id
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
        WHERE bl.entity_type = 'venue'
          AND bl.entity_id = NEW.venue_id
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

-- ============================================
-- TRIGGER: NOTIFY ON NEW EVENT CREATION
-- ============================================

DROP TRIGGER IF EXISTS trigger_notify_bucket_list_new_event ON public.events;
CREATE TRIGGER trigger_notify_bucket_list_new_event
  AFTER INSERT ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_bucket_list_new_event();

-- ============================================
-- UPDATE NOTIFICATIONS TYPE CONSTRAINT
-- ============================================
-- Add 'bucket_list_new_event' to the notifications type check

DO $$
BEGIN
  -- Drop the existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'notifications' 
    AND constraint_name LIKE '%notifications_type_check%'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  END IF;
  
  -- Add new constraint with bucket list notification type
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN (
    'friend_request', 
    'friend_accepted', 
    'match', 
    'message',
    'review_liked',
    'review_commented',
    'comment_replied',
    'event_interest',
    'artist_followed',
    'artist_new_event',
    'artist_profile_updated',
    'venue_new_event',
    'venue_profile_updated',
    'bucket_list_new_event'
  ));
END $$;

COMMENT ON FUNCTION public.notify_bucket_list_new_event IS 'Notifies users when new events are created for artists or venues in their bucket list';

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

