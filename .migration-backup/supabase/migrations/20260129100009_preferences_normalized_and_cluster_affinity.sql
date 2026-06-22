-- ============================================================
-- Preferences normalized + cluster affinity from signals
-- 1. Shared normalize_genre_key / resolve_genre_to_canonical
-- 2. refresh_user_cluster_affinity also from user_preference_signals
-- 3. Normalize existing signals and refresh prefs/affinity
-- ============================================================
-- Requires: genres, genre_cluster_keys (view), user_preference_signals, user_cluster_affinity
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. Shared genre normalization (match sql/genres_schema.sql)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_genre_key(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(trim(coalesce(raw, '')), '[-_\s]+', ' ', 'g'));
$$;

COMMENT ON FUNCTION public.normalize_genre_key IS 'Single canonical key for genre lookup (lower, trim, collapse spaces/dashes). Use with genres.normalized_key.';

-- Resolve raw genre string to canonical genres.name (with fallback for "jamband" vs "jam band")
CREATE OR REPLACE FUNCTION public.resolve_genre_to_canonical(raw_genre TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
AS $$
  SELECT g.name
  FROM public.genres g
  WHERE g.normalized_key = public.normalize_genre_key(raw_genre)
     OR replace(g.normalized_key, ' ', '') = replace(public.normalize_genre_key(raw_genre), ' ', '')
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.resolve_genre_to_canonical IS 'Returns genres.name for a raw genre string; matches normalized_key or key with spaces removed.';

-- ---------------------------------------------------------------------------
-- 2. auto_generate_genre_signals: use resolve_genre_to_canonical when genre set
-- ---------------------------------------------------------------------------
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
  IF NEW.genre IS NOT NULL THEN
    v_genre_name := public.resolve_genre_to_canonical(NEW.genre);
    IF v_genre_name IS NOT NULL THEN
      NEW.genre := v_genre_name;
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.entity_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.entity_type = 'artist' THEN
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
      IF v_cluster_slug IS NOT NULL AND NEW.context IS NOT NULL THEN
        NEW.context := NEW.context || jsonb_build_object('cluster_path_slug', v_cluster_slug);
      ELSIF v_cluster_slug IS NOT NULL THEN
        NEW.context := jsonb_build_object('cluster_path_slug', v_cluster_slug);
      END IF;
    END IF;
  ELSIF NEW.entity_type = 'event' THEN
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
      IF v_cluster_slug IS NOT NULL AND NEW.context IS NOT NULL THEN
        NEW.context := NEW.context || jsonb_build_object('cluster_path_slug', v_cluster_slug);
      ELSIF v_cluster_slug IS NOT NULL THEN
        NEW.context := jsonb_build_object('cluster_path_slug', v_cluster_slug);
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. refresh_user_preferences_v5: aggregate by canonical genre (use resolve)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refresh_user_preferences_v5(p_user_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  WITH users_to_refresh AS (
    SELECT DISTINCT ups.user_id AS uid
    FROM public.user_preference_signals ups
    WHERE p_user_id IS NULL OR ups.user_id = p_user_id
  ),
  sig_stats AS (
    SELECT
      ups.user_id,
      max(ups.occurred_at) AS last_signal_at,
      count(*)::integer AS signal_count
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    GROUP BY ups.user_id
  ),
  -- Resolve each signal's genre to canonical name (genres.name) so "pop"/"Pop"/"jamband"/"Jam Band" collapse
  genre_by_user AS (
    SELECT
      ups.user_id,
      COALESCE(public.resolve_genre_to_canonical(ups.genre), ups.genre) AS canonical_genre,
      sum(ups.signal_weight)::numeric AS score
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    WHERE ups.genre IS NOT NULL
    GROUP BY ups.user_id, COALESCE(public.resolve_genre_to_canonical(ups.genre), ups.genre)
  ),
  genre_agg AS (
    SELECT
      user_id,
      jsonb_object_agg(canonical_genre, score) AS scores,
      (SELECT array_agg(g.canonical_genre ORDER BY g.score DESC) FROM (
        SELECT canonical_genre, score FROM genre_by_user g2 WHERE g2.user_id = genre_by_user.user_id ORDER BY score DESC LIMIT 20
      ) g) AS top_list
    FROM genre_by_user
    GROUP BY user_id
  ),
  artist_by_user AS (
    SELECT user_id, entity_id, sum(signal_weight)::numeric AS score
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    WHERE ups.entity_type = 'artist' AND ups.entity_id IS NOT NULL
    GROUP BY ups.user_id, ups.entity_id
  ),
  artist_agg AS (
    SELECT
      user_id,
      jsonb_object_agg(entity_id::text, score) AS scores,
      (SELECT array_agg(a.entity_id ORDER BY a.score DESC) FROM (
        SELECT entity_id, score FROM artist_by_user a2 WHERE a2.user_id = artist_by_user.user_id ORDER BY score DESC LIMIT 50
      ) a) AS top_list
    FROM artist_by_user
    GROUP BY user_id
  ),
  venue_by_user AS (
    SELECT user_id, entity_id, sum(signal_weight)::numeric AS score
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    WHERE ups.entity_type = 'venue' AND ups.entity_id IS NOT NULL
    GROUP BY ups.user_id, ups.entity_id
  ),
  venue_agg AS (
    SELECT
      user_id,
      jsonb_object_agg(entity_id::text, score) AS scores,
      (SELECT array_agg(v.entity_id ORDER BY v.score DESC) FROM (
        SELECT entity_id, score FROM venue_by_user v2 WHERE v2.user_id = venue_by_user.user_id ORDER BY score DESC LIMIT 50
      ) v) AS top_list
    FROM venue_by_user
    GROUP BY user_id
  ),
  combined AS (
    SELECT
      u.uid AS user_id,
      ss.last_signal_at,
      ss.signal_count,
      COALESCE(ga.scores, '{}'::jsonb) AS genre_preference_scores,
      COALESCE(ga.top_list, '{}'::text[]) AS top_genres,
      COALESCE(aa.scores, '{}'::jsonb) AS artist_preference_scores,
      COALESCE(aa.top_list, '{}'::uuid[]) AS top_artists,
      COALESCE(va.scores, '{}'::jsonb) AS venue_preference_scores,
      COALESCE(va.top_list, '{}'::uuid[]) AS top_venues
    FROM users_to_refresh u
    LEFT JOIN sig_stats ss ON ss.user_id = u.uid
    LEFT JOIN genre_agg ga ON ga.user_id = u.uid
    LEFT JOIN artist_agg aa ON aa.user_id = u.uid
    LEFT JOIN venue_agg va ON va.user_id = u.uid
  )
  INSERT INTO public.user_preferences (
    user_id,
    genre_preference_scores,
    artist_preference_scores,
    venue_preference_scores,
    top_genres,
    top_artists,
    top_venues,
    last_signal_at,
    signal_count,
    last_computed_at,
    updated_at
  )
  SELECT
    c.user_id,
    c.genre_preference_scores,
    c.artist_preference_scores,
    c.venue_preference_scores,
    c.top_genres,
    c.top_artists,
    c.top_venues,
    c.last_signal_at,
    COALESCE(c.signal_count, 0),
    now(),
    now()
  FROM combined c
  ON CONFLICT (user_id) DO UPDATE SET
    genre_preference_scores = EXCLUDED.genre_preference_scores,
    artist_preference_scores = EXCLUDED.artist_preference_scores,
    venue_preference_scores = EXCLUDED.venue_preference_scores,
    top_genres = EXCLUDED.top_genres,
    top_artists = EXCLUDED.top_artists,
    top_venues = EXCLUDED.top_venues,
    last_signal_at = EXCLUDED.last_signal_at,
    signal_count = EXCLUDED.signal_count,
    last_computed_at = now(),
    updated_at = now();

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

-- ---------------------------------------------------------------------------
-- 4. refresh_user_cluster_affinity: also add affinity from user_preference_signals
--    (context.cluster_path_slug + genre -> genre_cluster_keys) so preferences hook to clusters
--    (Drop first because we change return type from void to integer.)
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.refresh_user_cluster_affinity();

CREATE OR REPLACE FUNCTION public.refresh_user_cluster_affinity()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  DELETE FROM public.user_cluster_affinity;

  -- From event interests (going/maybe)
  INSERT INTO public.user_cluster_affinity (user_id, cluster_path_slug, country, score, updated_at)
  SELECT
    uer.user_id,
    ec.cluster_path_slug,
    COALESCE(trim(ec.country), ''),
    count(*)::NUMERIC AS score,
    now() AS updated_at
  FROM public.user_event_relationships uer
  JOIN public.event_clusters ec ON ec.event_id = uer.event_id
  WHERE uer.relationship_type IN ('going', 'maybe')
  GROUP BY uer.user_id, ec.cluster_path_slug, COALESCE(trim(ec.country), '');

  -- From user_preference_signals: context.cluster_path_slug (explicit on signal)
  INSERT INTO public.user_cluster_affinity (user_id, cluster_path_slug, country, score, updated_at)
  SELECT
    ups.user_id,
    trim(ups.context->>'cluster_path_slug') AS cluster_path_slug,
    COALESCE(trim(ups.context->>'country'), ''),
    sum(ups.signal_weight)::NUMERIC AS score,
    now() AS updated_at
  FROM public.user_preference_signals ups
  WHERE ups.context IS NOT NULL
    AND ups.context ? 'cluster_path_slug'
    AND trim(ups.context->>'cluster_path_slug') <> ''
  GROUP BY ups.user_id, trim(ups.context->>'cluster_path_slug'), COALESCE(trim(ups.context->>'country'), '')
  ON CONFLICT (user_id, cluster_path_slug, country) DO UPDATE SET
    score = public.user_cluster_affinity.score + EXCLUDED.score,
    updated_at = now();

  -- From user_preference_signals: genre -> genre_cluster_keys (no country; use '')
  IF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'genre_cluster_keys') THEN
    INSERT INTO public.user_cluster_affinity (user_id, cluster_path_slug, country, score, updated_at)
    SELECT
      ups.user_id,
      ck.cluster_path_slug,
      '',
      sum(ups.signal_weight)::NUMERIC AS score,
      now() AS updated_at
    FROM public.user_preference_signals ups
    JOIN public.genres g ON g.name = ups.genre
       OR g.normalized_key = public.normalize_genre_key(ups.genre)
       OR replace(g.normalized_key, ' ', '') = replace(public.normalize_genre_key(ups.genre), ' ', '')
    JOIN public.genre_cluster_keys ck ON ck.genre_id = g.id
    WHERE ups.genre IS NOT NULL
    GROUP BY ups.user_id, ck.cluster_path_slug
    ON CONFLICT (user_id, cluster_path_slug, country) DO UPDATE SET
      score = public.user_cluster_affinity.score + EXCLUDED.score,
      updated_at = now();
  END IF;

  SELECT count(*)::integer INTO v_count FROM public.user_cluster_affinity;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.refresh_user_cluster_affinity IS
  'Repopulate user_cluster_affinity from event interests (going/maybe) and from user_preference_signals (context.cluster_path_slug + genre->genre_cluster_keys). Returns row count. Run after taxonomy rebuild or periodically.';

GRANT EXECUTE ON FUNCTION public.refresh_user_cluster_affinity() TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Bucket list trigger: use resolve_genre_to_canonical for inferred genres
-- ---------------------------------------------------------------------------
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
    END;

    SELECT genres INTO v_artist_genres
    FROM public.artists
    WHERE id = v_entity_uuid;

    IF v_artist_genres IS NOT NULL AND array_length(v_artist_genres, 1) > 0 THEN
      FOREACH v_genre IN ARRAY v_artist_genres
      LOOP
        v_genre_name := public.resolve_genre_to_canonical(v_genre);
        v_genre_name := COALESCE(v_genre_name, v_genre);
        v_cluster_slug := (SELECT ck.cluster_path_slug FROM public.genres g JOIN public.genre_cluster_keys ck ON ck.genre_id = g.id WHERE g.name = v_genre_name LIMIT 1);

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
    END;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Review trigger: use resolve_genre_to_canonical for genre signals
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.capture_review_music_data()
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
  v_genre_name TEXT;
  v_cluster_slug TEXT;
  v_occurred_at timestamptz;
  v_genre_ord int := 0;
BEGIN
  IF NEW.is_draft THEN
    RETURN NEW;
  END IF;

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
  v_review_row := to_jsonb(NEW);

  IF v_review_row ? 'genre_tags' AND jsonb_typeof(v_review_row->'genre_tags') = 'array' THEN
    SELECT array_agg(elem.value)
    INTO v_review_genre_tags
    FROM jsonb_array_elements_text(v_review_row->'genre_tags') AS elem(value);
  END IF;

  v_all_genres := v_event_record.genres || COALESCE(v_review_genre_tags, ARRAY[]::TEXT[]);

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

  IF v_event_record.artist_name IS NOT NULL AND v_artist_uuid IS NOT NULL THEN
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
      v_event_record.artist_name,
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
      v_genre_name := public.resolve_genre_to_canonical(v_genre);
      v_genre_name := COALESCE(v_genre_name, v_genre);
      v_cluster_slug := (SELECT ck.cluster_path_slug FROM public.genres g JOIN public.genre_cluster_keys ck ON ck.genre_id = g.id WHERE g.name = v_genre_name LIMIT 1);

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

-- ---------------------------------------------------------------------------
-- 7. Normalize existing user_preference_signals.genre to canonical genres.name
-- ---------------------------------------------------------------------------
UPDATE public.user_preference_signals ups
SET genre = public.resolve_genre_to_canonical(ups.genre), updated_at = now()
WHERE ups.genre IS NOT NULL
  AND public.resolve_genre_to_canonical(ups.genre) IS NOT NULL
  AND ups.genre IS DISTINCT FROM public.resolve_genre_to_canonical(ups.genre);

-- ---------------------------------------------------------------------------
-- 8. Recompute user_preferences and user_cluster_affinity
-- ---------------------------------------------------------------------------
SELECT public.refresh_user_preferences_v5(NULL);
SELECT public.refresh_user_cluster_affinity();
