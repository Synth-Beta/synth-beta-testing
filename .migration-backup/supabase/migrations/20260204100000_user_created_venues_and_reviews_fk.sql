-- ============================================================
-- User-created venues: allow reviews when venue is not in venues table
-- ============================================================
-- 1. Create user_created_venues table (users can insert their own)
-- 2. Add reviews.user_created_venue_id FK (optional, when venue not in catalog)
-- 3. Constraint: when event_id is null, exactly one of venue_id or user_created_venue_id
-- 4. Update unique index for (user, artist, venue) to use either venue source
-- 5. Update triggers to resolve venue name from either table
-- ============================================================

BEGIN;

-- ============================================================
-- 1. Create user_created_venues table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_created_venues (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_created_venues_user_id ON public.user_created_venues(user_id);
CREATE INDEX IF NOT EXISTS idx_user_created_venues_name ON public.user_created_venues(name);

COMMENT ON TABLE public.user_created_venues IS 'User-supplied venue names when the venue is not in the main venues table. Used by reviews via user_created_venue_id.';
COMMENT ON COLUMN public.user_created_venues.user_id IS 'User who created this venue record (owner).';
COMMENT ON COLUMN public.user_created_venues.name IS 'Display name of the venue.';

ALTER TABLE public.user_created_venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_created_venues_select"
  ON public.user_created_venues FOR SELECT
  USING (true);

CREATE POLICY "user_created_venues_insert_own"
  ON public.user_created_venues FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_created_venues_update_own"
  ON public.user_created_venues FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_created_venues_delete_own"
  ON public.user_created_venues FOR DELETE
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_created_venues TO authenticated;

-- ============================================================
-- 2. Add user_created_venue_id to reviews
-- ============================================================
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS user_created_venue_id UUID REFERENCES public.user_created_venues(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_reviews_user_created_venue_id ON public.reviews(user_created_venue_id) WHERE user_created_venue_id IS NOT NULL;

COMMENT ON COLUMN public.reviews.user_created_venue_id IS 'Optional: when venue is not in venues table, reference a user-created venue. Exactly one of venue_id or user_created_venue_id when event_id is null.';

-- ============================================================
-- 3. Constraint: when event_id is null, exactly one venue source (and keep artist constraint)
-- ============================================================
ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_artist_or_user_created_check;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_artist_or_user_created_check CHECK (
    (event_id IS NOT NULL)
    OR
    (
      (artist_id IS NOT NULL AND user_created_artist_id IS NULL)
      OR (artist_id IS NULL AND user_created_artist_id IS NOT NULL)
    )
  );

ALTER TABLE public.reviews
  DROP CONSTRAINT IF EXISTS reviews_venue_or_user_created_check;

ALTER TABLE public.reviews
  ADD CONSTRAINT reviews_venue_or_user_created_check CHECK (
    (event_id IS NOT NULL)
    OR
    (
      (venue_id IS NOT NULL AND user_created_venue_id IS NULL)
      OR (venue_id IS NULL AND user_created_venue_id IS NOT NULL)
    )
  );

-- ============================================================
-- 4. Update unique index for (user, artist, venue) when no event
-- ============================================================
DROP INDEX IF EXISTS public.reviews_user_id_artist_or_custom_venue_id_unique;

CREATE UNIQUE INDEX reviews_user_id_artist_venue_custom_unique
  ON public.reviews(
    user_id,
    COALESCE(artist_id, user_created_artist_id),
    COALESCE(venue_id, user_created_venue_id)
  )
  WHERE event_id IS NULL AND is_draft = false
    AND COALESCE(artist_id, user_created_artist_id) IS NOT NULL
    AND COALESCE(venue_id, user_created_venue_id) IS NOT NULL;

COMMENT ON INDEX reviews_user_id_artist_venue_custom_unique IS
  'One published review per user per artist+venue when event_id is null. Artist from artists or user_created_artists; venue from venues or user_created_venues.';

-- ============================================================
-- 5. Update capture_review_music_data: venue from review when no event
-- ============================================================
CREATE OR REPLACE FUNCTION capture_review_music_data()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_event_record RECORD;
  v_song TEXT;
  v_genre TEXT;
  v_all_genres TEXT[];
  v_review_row JSONB;
  v_review_genre_tags TEXT[] := ARRAY[]::TEXT[];
  v_rating NUMERIC;
  v_artist_performance_rating NUMERIC;
  v_production_rating NUMERIC;
  v_venue_rating NUMERIC;
  v_location_rating NUMERIC;
  v_value_rating NUMERIC;
  v_ticket_price NUMERIC;
  v_has_photos BOOLEAN := FALSE;
  v_custom_setlist JSONB;
  v_artist_uuid UUID;
  v_artist_name TEXT;
  v_genre_name TEXT;
  v_cluster_slug TEXT;
  v_normalized_key TEXT;
  v_occurred_at timestamptz;
  v_genre_ord int := 0;
BEGIN
  IF NEW.is_draft THEN
    RETURN NEW;
  END IF;

  IF NEW.event_id IS NOT NULL THEN
    SELECT 
      e.id, 
      a.name as artist_name,
      e.artist_id,
      COALESCE(e.genres, ARRAY[]::TEXT[]) as genres,
      v.name as venue_name,
      e.venue_id,
      e.event_date
    INTO v_event_record
    FROM public.events e
    LEFT JOIN public.artists a ON a.id = e.artist_id
    LEFT JOIN public.venues v ON v.id = e.venue_id
    WHERE e.id = NEW.event_id;

    v_artist_uuid := v_event_record.artist_id;
    v_artist_name := v_event_record.artist_name;
    v_all_genres := COALESCE(v_event_record.genres, ARRAY[]::TEXT[]);
  ELSE
    v_artist_uuid := COALESCE(NEW.artist_id, NEW.user_created_artist_id);
    IF NEW.artist_id IS NOT NULL THEN
      SELECT a.name INTO v_artist_name FROM public.artists a WHERE a.id = NEW.artist_id;
    ELSIF NEW.user_created_artist_id IS NOT NULL THEN
      SELECT uca.name INTO v_artist_name FROM public.user_created_artists uca WHERE uca.id = NEW.user_created_artist_id;
    END IF;
    v_event_record.venue_id := NEW.venue_id;
    v_event_record.venue_name := NULL;
    v_event_record.genres := ARRAY[]::TEXT[];
    IF NEW.venue_id IS NOT NULL THEN
      SELECT v.name INTO v_event_record.venue_name FROM public.venues v WHERE v.id = NEW.venue_id;
    ELSIF NEW.user_created_venue_id IS NOT NULL THEN
      SELECT ucv.name INTO v_event_record.venue_name FROM public.user_created_venues ucv WHERE ucv.id = NEW.user_created_venue_id;
    END IF;
    v_event_record.event_date := NULL;
    v_all_genres := ARRAY[]::TEXT[];
  END IF;

  v_review_row := to_jsonb(NEW);

  IF v_review_row ? 'genre_tags' AND jsonb_typeof(v_review_row->'genre_tags') = 'array' THEN
    SELECT array_agg(elem.value)
    INTO v_review_genre_tags
    FROM jsonb_array_elements_text(v_review_row->'genre_tags') AS elem(value);
  END IF;

  v_all_genres := v_all_genres || COALESCE(v_review_genre_tags, ARRAY[]::TEXT[]);

  v_rating := NULLIF(v_review_row->>'rating', '')::NUMERIC;
  v_artist_performance_rating := NULLIF(v_review_row->>'artist_performance_rating', '')::NUMERIC;
  v_production_rating := NULLIF(v_review_row->>'production_rating', '')::NUMERIC;
  v_venue_rating := NULLIF(v_review_row->>'venue_rating', '')::NUMERIC;
  v_location_rating := NULLIF(v_review_row->>'location_rating', '')::NUMERIC;
  v_value_rating := NULLIF(v_review_row->>'value_rating', '')::NUMERIC;
  v_ticket_price := NULLIF(v_review_row->>'ticket_price_paid', '')::NUMERIC;

  IF (v_review_row ? 'photos') THEN
    v_has_photos := jsonb_typeof(v_review_row->'photos') = 'array'
      AND jsonb_array_length(v_review_row->'photos') > 0;
  END IF;

  IF (v_review_row ? 'custom_setlist') THEN
    v_custom_setlist := v_review_row->'custom_setlist';
    IF jsonb_typeof(v_custom_setlist) = 'array' THEN
      IF jsonb_array_length(v_custom_setlist) = 0 THEN
        v_custom_setlist := NULL;
      END IF;
    ELSE
      v_custom_setlist := NULL;
    END IF;
  END IF;

  IF v_artist_name IS NOT NULL THEN
    INSERT INTO user_artist_interactions (
      user_id, artist_id, artist_name, interaction_type, interaction_strength,
      genres, source_entity_type, source_entity_id, metadata, occurred_at
    ) VALUES (
      NEW.user_id, v_artist_uuid, v_artist_name, 'review', 9,
      v_all_genres, 'review', NEW.id::TEXT,
      jsonb_build_object(
        'rating', v_rating, 'artist_performance_rating', v_artist_performance_rating,
        'production_rating', v_production_rating, 'venue_rating', v_venue_rating,
        'location_rating', v_location_rating, 'value_rating', v_value_rating,
        'ticket_price_paid', v_ticket_price, 'has_photos', v_has_photos,
        'has_custom_setlist', v_custom_setlist IS NOT NULL
      ),
      NEW.created_at
    );
  END IF;

  IF array_length(v_all_genres, 1) > 0 AND v_artist_name IS NOT NULL THEN
    FOR v_genre IN SELECT unnest(v_all_genres) LOOP
      INSERT INTO user_genre_interactions (
        user_id, genre, interaction_type, interaction_count, artist_names,
        source_entity_type, source_entity_id, occurred_at
      ) VALUES (
        NEW.user_id, v_genre, 'review', 1, ARRAY[v_artist_name],
        'review', NEW.id::TEXT, NEW.created_at
      );
    END LOOP;
  END IF;

  IF v_custom_setlist IS NOT NULL AND v_artist_name IS NOT NULL THEN
    FOR v_song IN
      SELECT COALESCE(elem->>'title', elem->>'name', elem->>'song', NULLIF(trim(both '"' FROM elem::TEXT), ''))
      FROM jsonb_array_elements(v_custom_setlist) elem
    LOOP
      CONTINUE WHEN v_song IS NULL OR v_song = '';
      INSERT INTO user_song_interactions (
        user_id, song_id, song_name, artist_names, genres,
        interaction_type, source_entity_type, source_entity_id, occurred_at
      ) VALUES (
        NEW.user_id, md5(v_song || v_artist_name), v_song,
        ARRAY[v_artist_name], v_all_genres,
        'custom_setlist_added', 'review', NEW.id::TEXT, NEW.created_at
      );
    END LOOP;
  END IF;

  IF v_artist_name IS NOT NULL AND v_artist_uuid IS NOT NULL THEN
    SELECT g.name, (SELECT ck.cluster_path_slug FROM public.genre_cluster_keys ck WHERE ck.genre_id = g.id LIMIT 1)
    INTO v_genre_name, v_cluster_slug
    FROM public.artists_genres ag
    JOIN public.genres g ON g.id = ag.genre_id
    WHERE ag.artist_id = v_artist_uuid
    ORDER BY v_cluster_slug NULLS LAST
    LIMIT 1;

    INSERT INTO public.user_preference_signals (
      user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at, updated_at
    ) VALUES (
      NEW.user_id,
      'review'::public.preference_signal_type,
      'artist'::public.preference_entity_type,
      v_artist_uuid,
      v_artist_name,
      3.0,
      v_genre_name,
      jsonb_build_object('source', 'review', 'review_id', NEW.id) || CASE WHEN v_cluster_slug IS NOT NULL THEN jsonb_build_object('cluster_path_slug', v_cluster_slug) ELSE '{}'::jsonb END,
      NEW.created_at,
      NEW.created_at,
      now()
    )
    ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
    DO UPDATE SET
      signal_weight = GREATEST(user_preference_signals.signal_weight, 3.0),
      context = user_preference_signals.context || jsonb_build_object('review', true),
      updated_at = now();
  END IF;

  IF array_length(v_all_genres, 1) > 0 THEN
    FOR v_genre IN SELECT unnest(v_all_genres) LOOP
      v_genre_ord := v_genre_ord + 1;
      v_occurred_at := NEW.created_at + (v_genre_ord * interval '1 millisecond');
      v_normalized_key := lower(trim(regexp_replace(v_genre, '[-_\s]+', ' ', 'g')));
      SELECT g.name, (SELECT ck.cluster_path_slug FROM public.genre_cluster_keys ck WHERE ck.genre_id = g.id LIMIT 1)
      INTO v_genre_name, v_cluster_slug
      FROM public.genres g
      WHERE g.normalized_key = v_normalized_key
      LIMIT 1;
      v_genre_name := COALESCE(v_genre_name, v_genre);

      INSERT INTO public.user_preference_signals (
        user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at, updated_at
      ) VALUES (
        NEW.user_id,
        'review'::public.preference_signal_type,
        'genre'::public.preference_entity_type,
        NULL,
        v_genre_name,
        2.0,
        v_genre_name,
        jsonb_build_object('source', 'review', 'review_id', NEW.id) || CASE WHEN v_cluster_slug IS NOT NULL THEN jsonb_build_object('cluster_path_slug', v_cluster_slug) ELSE '{}'::jsonb END,
        v_occurred_at,
        NEW.created_at,
        now()
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
      DO UPDATE SET
        signal_weight = GREATEST(user_preference_signals.signal_weight, 2.0),
        context = user_preference_signals.context || jsonb_build_object('review', true),
        updated_at = now();
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.capture_review_music_data() IS
  'Captures music metadata from reviews. Resolves artist/venue from event or from review (artist_id/user_created_artist_id, venue_id/user_created_venue_id) when event_id is null.';

-- ============================================================
-- 6. Update scene progress: match user_created_venue_id when event_id is null
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_update_scene_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_scene_ids UUID[];
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);
  IF v_user_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF (TG_OP = 'DELETE') THEN
    SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
    FROM public.scene_participants sp
    WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
    AND (
      (sp.participant_type = 'artist' AND sp.artist_id IS NOT NULL AND (
        (OLD.event_id IS NOT NULL AND sp.artist_id IN (SELECT e.artist_id FROM public.events e WHERE e.id = OLD.event_id))
        OR (OLD.event_id IS NULL AND sp.artist_id = COALESCE(OLD.artist_id, OLD.user_created_artist_id))
      )) OR
      (sp.participant_type = 'venue' AND sp.venue_id IS NOT NULL AND (
        (OLD.event_id IS NOT NULL AND sp.venue_id IN (SELECT e.venue_id FROM public.events e WHERE e.id = OLD.event_id))
        OR (OLD.event_id IS NULL AND sp.venue_id = COALESCE(OLD.venue_id, OLD.user_created_venue_id))
      ))
    );
  ELSIF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') AND NEW.is_draft = false THEN
    IF NEW.event_id IS NOT NULL THEN
      SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
      FROM public.scene_participants sp
      JOIN public.events e ON e.id = NEW.event_id
      WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
      AND (
        (sp.participant_type = 'artist' AND sp.artist_id IS NOT NULL AND sp.artist_id = e.artist_id) OR
        (sp.participant_type = 'venue' AND sp.venue_id IS NOT NULL AND sp.venue_id = e.venue_id) OR
        (sp.participant_type = 'city' AND e.venue_city = sp.text_value) OR
        (sp.participant_type = 'genre' AND e.genres IS NOT NULL AND e.genres @> ARRAY[sp.text_value])
      );
    ELSE
      SELECT ARRAY_AGG(DISTINCT sp.scene_id) INTO v_scene_ids
      FROM public.scene_participants sp
      WHERE sp.scene_id IN (SELECT id FROM public.scenes WHERE is_active = true)
      AND (
        (sp.participant_type = 'artist' AND sp.artist_id IS NOT NULL AND sp.artist_id = COALESCE(NEW.artist_id, NEW.user_created_artist_id)) OR
        (sp.participant_type = 'venue' AND sp.venue_id IS NOT NULL AND sp.venue_id = COALESCE(NEW.venue_id, NEW.user_created_venue_id))
      );
    END IF;
  END IF;

  IF v_scene_ids IS NOT NULL AND array_length(v_scene_ids, 1) > 0 THEN
    PERFORM public.calculate_scene_progress(v_user_id, unnest_scene_id)
    FROM UNNEST(v_scene_ids) AS unnest_scene_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.auto_update_scene_progress() IS
  'Auto-update scene progress when reviews or passport entries change. Handles event_id NULL via artist_id/user_created_artist_id and venue_id/user_created_venue_id.';

DROP TRIGGER IF EXISTS trigger_user_created_venues_updated_at ON public.user_created_venues;
CREATE TRIGGER trigger_user_created_venues_updated_at
  BEFORE UPDATE ON public.user_created_venues
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

COMMIT;
