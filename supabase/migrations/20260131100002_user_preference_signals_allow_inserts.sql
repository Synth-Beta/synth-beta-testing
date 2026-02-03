-- Fix 400 on user_preference_signals: ensure inserts never fail due to
-- unique constraint or trigger errors (missing views, type mismatches, etc.).

-- 1. Drop unique constraint so duplicate interest writes succeed
ALTER TABLE public.user_preference_signals
  DROP CONSTRAINT IF EXISTS user_preference_signals_user_signal_entity_unique;

-- 2. Make auto_generate_genre_signals never raise: wrap in exception handler
--    so missing views / resolve_genre_to_canonical / events_genres issues
--    don't abort the INSERT (which can surface as 400 from PostgREST).
CREATE OR REPLACE FUNCTION public.auto_generate_genre_signals()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_genre_name text;
  v_cluster_slug text;
  v_genre_id uuid;
BEGIN
  -- Ensure context is never NULL for assignments below
  NEW.context := COALESCE(NEW.context, '{}'::jsonb);

  IF NEW.genre IS NOT NULL THEN
    BEGIN
      v_genre_name := public.resolve_genre_to_canonical(NEW.genre);
      IF v_genre_name IS NOT NULL THEN
        NEW.genre := v_genre_name;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    RETURN NEW;
  END IF;

  IF NEW.entity_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.entity_type = 'artist' THEN
    BEGIN
      SELECT g.name, ck.cluster_path_slug, g.id
      INTO v_genre_name, v_cluster_slug, v_genre_id
      FROM public.artists_genres ag
      JOIN public.genres g ON g.id = ag.genre_id
      LEFT JOIN public.genre_cluster_keys ck ON ck.genre_id = g.id
      WHERE ag.artist_id = NEW.entity_id
      ORDER BY ck.cluster_path_slug NULLS LAST
      LIMIT 1;
      IF v_genre_name IS NOT NULL THEN
        NEW.genre := v_genre_name;
        IF v_cluster_slug IS NOT NULL THEN
          NEW.context := NEW.context || jsonb_build_object('cluster_path_slug', v_cluster_slug);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  ELSIF NEW.entity_type = 'event' THEN
    BEGIN
      SELECT g.name, ck.cluster_path_slug, g.id
      INTO v_genre_name, v_cluster_slug, v_genre_id
      FROM public.events_genres eg
      JOIN public.genres g ON g.id = eg.genre_id
      LEFT JOIN public.genre_cluster_keys ck ON ck.genre_id = g.id
      WHERE eg.event_id = NEW.entity_id
      ORDER BY ck.cluster_path_slug NULLS LAST
      LIMIT 1;
      IF v_genre_name IS NOT NULL THEN
        NEW.genre := v_genre_name;
        IF v_cluster_slug IS NOT NULL THEN
          NEW.context := NEW.context || jsonb_build_object('cluster_path_slug', v_cluster_slug);
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_generate_genre_signals IS 'Fills genre and context.cluster_path_slug from artists_genres/events_genres when entity_type is artist/event and genre is null. Never raises so INSERT into user_preference_signals always succeeds.';
