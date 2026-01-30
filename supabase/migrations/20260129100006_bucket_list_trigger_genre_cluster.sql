-- ============================================================
-- BUCKET LIST TRIGGER: set genre from artists_genres and context.cluster_path_slug
-- Personalization engine v5: normalize genre and add cluster to preference signals
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_preference_signals_on_bucket_list_add()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_genre TEXT;
  v_artist_genres TEXT[];
  v_signal_type TEXT := 'bucket_list';
  v_entity_type_text TEXT;
  v_entity_uuid UUID;
  v_genre_name TEXT;
  v_cluster_slug TEXT;
  v_normalized_key TEXT;
  v_context jsonb;
BEGIN
  SELECT e.entity_type, e.entity_uuid
  INTO v_entity_type_text, v_entity_uuid
  FROM public.entities e
  WHERE e.id = NEW.entity_id;

  IF v_entity_type_text IS NULL OR v_entity_uuid IS NULL THEN
    RAISE WARNING 'Entity not found for bucket_list item entity_id: %', NEW.entity_id;
    RETURN NEW;
  END IF;

  IF v_entity_type_text = 'artist' THEN
    -- Genre and cluster from artists_genres + genre_cluster_keys (normalized)
    SELECT g.name, ck.cluster_path_slug
    INTO v_genre_name, v_cluster_slug
    FROM public.artists_genres ag
    JOIN public.genres g ON g.id = ag.genre_id
    LEFT JOIN public.genre_cluster_keys ck ON ck.genre_id = g.id
    WHERE ag.artist_id = v_entity_uuid
    ORDER BY ck.cluster_path_slug NULLS LAST
    LIMIT 1;

    v_context := jsonb_build_object('source', 'bucket_list', 'added_at', NEW.added_at);
    IF v_cluster_slug IS NOT NULL THEN
      v_context := v_context || jsonb_build_object('cluster_path_slug', v_cluster_slug);
    END IF;

    BEGIN
      INSERT INTO public.user_preference_signals (
        user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at, updated_at
      ) VALUES (
        NEW.user_id,
        v_signal_type::public.preference_signal_type,
        v_entity_type_text::public.preference_entity_type,
        v_entity_uuid,
        NEW.entity_name,
        2.0,
        v_genre_name,
        v_context,
        NEW.added_at,
        NEW.added_at,
        NEW.added_at
      )
      ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
      DO UPDATE SET
        signal_weight = GREATEST(user_preference_signals.signal_weight, 2.0),
        genre = COALESCE(EXCLUDED.genre, user_preference_signals.genre),
        context = user_preference_signals.context || jsonb_build_object('bucket_list', true),
        updated_at = now();
    EXCEPTION WHEN invalid_text_representation THEN
      BEGIN
        INSERT INTO public.user_preference_signals (
          user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at, updated_at
        ) VALUES (
          NEW.user_id,
          'save'::public.preference_signal_type,
          v_entity_type_text::public.preference_entity_type,
          v_entity_uuid,
          NEW.entity_name,
          2.0,
          v_genre_name,
          v_context,
          NEW.added_at,
          NEW.added_at,
          NEW.added_at
        )
        ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at)
        DO UPDATE SET
          signal_weight = GREATEST(user_preference_signals.signal_weight, 2.0),
          genre = COALESCE(EXCLUDED.genre, user_preference_signals.genre),
          context = user_preference_signals.context || jsonb_build_object('bucket_list', true),
          updated_at = now();
      EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'Could not insert preference signal for bucket list item: %', SQLERRM;
      END;
    END;

    -- Inferred genre signals: use normalized genre name from genres table and cluster_path_slug
    SELECT genres INTO v_artist_genres
    FROM public.artists
    WHERE id = v_entity_uuid;

    IF v_artist_genres IS NOT NULL AND array_length(v_artist_genres, 1) > 0 THEN
      FOREACH v_genre IN ARRAY v_artist_genres
      LOOP
        v_normalized_key := lower(trim(regexp_replace(v_genre, '[-_\s]+', ' ', 'g')));
        SELECT g.name, (SELECT ck.cluster_path_slug FROM public.genre_cluster_keys ck WHERE ck.genre_id = g.id LIMIT 1)
        INTO v_genre_name, v_cluster_slug
        FROM public.genres g
        WHERE g.normalized_key = v_normalized_key
        LIMIT 1;
        v_genre_name := COALESCE(v_genre_name, v_genre);

        v_context := jsonb_build_object(
          'source', 'bucket_list',
          'inferred_from', NEW.entity_name,
          'entity_type', v_entity_type_text,
          'entity_id', v_entity_uuid
        );
        IF v_cluster_slug IS NOT NULL THEN
          v_context := v_context || jsonb_build_object('cluster_path_slug', v_cluster_slug);
        END IF;

        BEGIN
          INSERT INTO public.user_preference_signals (
            user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at, updated_at
          ) VALUES (
            NEW.user_id,
            v_signal_type::public.preference_signal_type,
            'genre'::public.preference_entity_type,
            NULL,
            v_genre_name,
            1.5,
            v_genre_name,
            v_context,
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
          BEGIN
            INSERT INTO public.user_preference_signals (
              user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at, updated_at
            ) VALUES (
              NEW.user_id,
              'save'::public.preference_signal_type,
              'genre'::public.preference_entity_type,
              NULL,
              v_genre_name,
              1.5,
              v_genre_name,
              v_context,
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
            RAISE WARNING 'Could not insert genre preference signal for bucket list item: %', SQLERRM;
          END;
        END;
      END LOOP;
    END IF;

  ELSIF v_entity_type_text = 'venue' THEN
    v_context := jsonb_build_object('source', 'bucket_list', 'added_at', NEW.added_at);
    BEGIN
      INSERT INTO public.user_preference_signals (
        user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at, updated_at
      ) VALUES (
        NEW.user_id,
        v_signal_type::public.preference_signal_type,
        v_entity_type_text::public.preference_entity_type,
        v_entity_uuid,
        NEW.entity_name,
        2.0,
        NULL,
        v_context,
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
      BEGIN
        INSERT INTO public.user_preference_signals (
          user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at, updated_at
        ) VALUES (
          NEW.user_id,
          'save'::public.preference_signal_type,
          v_entity_type_text::public.preference_entity_type,
          v_entity_uuid,
          NEW.entity_name,
          2.0,
          NULL,
          v_context,
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
        RAISE WARNING 'Could not insert preference signal for bucket list venue: %', SQLERRM;
      END;
    END;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.update_preference_signals_on_bucket_list_add IS 'Creates preference signals when items are added to bucket list. Sets genre from artists_genres (normalized) and context.cluster_path_slug for personalization engine v5.';
