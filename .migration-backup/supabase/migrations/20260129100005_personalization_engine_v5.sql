-- ============================================================
-- PERSONALIZATION ENGINE V5
-- user_preference_signals + user_preferences schema, trigger,
-- backfill, and refresh_user_preferences_v5
-- ============================================================
-- Requires: genres, artists_genres, events_genres, genre_cluster_keys,
-- event_clusters, artist_clusters, user_event_relationships, users
-- ============================================================

-- ---------------------------------------------------------------------------
-- 1. ENUMS (create if not exist)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preference_signal_type') THEN
    CREATE TYPE public.preference_signal_type AS ENUM (
      'save',
      'interest',
      'follow',
      'view',
      'genre_manual_preference',
      'artist_manual_preference',
      'streaming_profile_synced',
      'bucket_list',
      'review',
      'attendance'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preference_entity_type') THEN
    CREATE TYPE public.preference_entity_type AS ENUM (
      'artist',
      'venue',
      'event',
      'genre'
    );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. user_preference_signals TABLE (create if not exist)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_preference_signals (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  signal_type public.preference_signal_type NOT NULL,
  entity_type public.preference_entity_type NOT NULL,
  entity_id uuid NULL,
  entity_name text NULL,
  signal_weight numeric(5, 2) NOT NULL DEFAULT 1.0,
  genre text NULL,
  context jsonb NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_preference_signals_pkey PRIMARY KEY (id),
  CONSTRAINT user_preference_signals_user_signal_entity_unique UNIQUE (
    user_id,
    signal_type,
    entity_type,
    entity_id,
    occurred_at
  ),
  CONSTRAINT user_preference_signals_signal_weight_check CHECK (signal_weight >= 0::numeric)
);

-- FK: use public.users(user_id) for business logic
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public' AND table_name = 'user_preference_signals'
      AND constraint_name = 'user_preference_signals_user_id_fkey'
  ) THEN
    ALTER TABLE public.user_preference_signals
      ADD CONSTRAINT user_preference_signals_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    -- users table might not exist in some envs; allow auth.users(id) fallback
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_schema = 'public' AND table_name = 'user_preference_signals'
        AND constraint_name = 'user_preference_signals_user_id_fkey'
    ) THEN
      ALTER TABLE public.user_preference_signals
        ADD CONSTRAINT user_preference_signals_user_id_fkey
        FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_id ON public.user_preference_signals USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_type ON public.user_preference_signals USING btree (user_id, signal_type);
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_entity ON public.user_preference_signals USING btree (user_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_genre ON public.user_preference_signals USING btree (user_id, genre) WHERE genre IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_weight ON public.user_preference_signals USING btree (user_id, signal_weight DESC, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_occurred ON public.user_preference_signals USING btree (user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_entity ON public.user_preference_signals USING btree (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_context ON public.user_preference_signals USING gin (context);

COMMENT ON TABLE public.user_preference_signals IS 'Personalization signals with genre and optional cluster. Aggregated into user_preferences by refresh_user_preferences_v5.';

-- ---------------------------------------------------------------------------
-- 3. user_preferences: add new columns if missing
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_preferences') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'genre_preference_scores') THEN
      ALTER TABLE public.user_preferences ADD COLUMN genre_preference_scores jsonb NULL DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'artist_preference_scores') THEN
      ALTER TABLE public.user_preferences ADD COLUMN artist_preference_scores jsonb NULL DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'venue_preference_scores') THEN
      ALTER TABLE public.user_preferences ADD COLUMN venue_preference_scores jsonb NULL DEFAULT '{}'::jsonb;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'top_genres') THEN
      ALTER TABLE public.user_preferences ADD COLUMN top_genres text[] NULL DEFAULT '{}'::text[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'top_artists') THEN
      ALTER TABLE public.user_preferences ADD COLUMN top_artists uuid[] NULL DEFAULT '{}'::uuid[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'top_venues') THEN
      ALTER TABLE public.user_preferences ADD COLUMN top_venues uuid[] NULL DEFAULT '{}'::uuid[];
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'last_signal_at') THEN
      ALTER TABLE public.user_preferences ADD COLUMN last_signal_at timestamptz NULL;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'signal_count') THEN
      ALTER TABLE public.user_preferences ADD COLUMN signal_count integer NULL DEFAULT 0;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'user_preferences' AND column_name = 'last_computed_at') THEN
      ALTER TABLE public.user_preferences ADD COLUMN last_computed_at timestamptz NULL;
    END IF;
    -- Ensure unique on user_id for ON CONFLICT (user_id)
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.user_preferences'::regclass AND conname LIKE '%user_id%' AND contype = 'u') THEN
      CREATE UNIQUE INDEX IF NOT EXISTS idx_user_preferences_user_id_unique ON public.user_preferences (user_id);
    END IF;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. update_updated_at_column (if not exist)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_user_preference_signals_updated_at ON public.user_preference_signals;
CREATE TRIGGER trigger_user_preference_signals_updated_at
  BEFORE UPDATE ON public.user_preference_signals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ---------------------------------------------------------------------------
-- 5. auto_generate_genre_signals: fill genre (and cluster) when entity_id set, genre null
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
  v_normalized_key text;
BEGIN
  -- If genre is already set, normalize to canonical genres.name via normalized_key
  IF NEW.genre IS NOT NULL THEN
    v_normalized_key := lower(trim(regexp_replace(NEW.genre, '[-_\s]+', ' ', 'g')));
    SELECT g.name INTO v_genre_name
    FROM public.genres g
    WHERE g.normalized_key = v_normalized_key
    LIMIT 1;
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

DROP TRIGGER IF EXISTS trigger_auto_generate_genre_signals ON public.user_preference_signals;
CREATE TRIGGER trigger_auto_generate_genre_signals
  BEFORE INSERT ON public.user_preference_signals
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_generate_genre_signals();

COMMENT ON FUNCTION public.auto_generate_genre_signals IS 'Fills genre and context.cluster_path_slug from artists_genres/events_genres when entity_type is artist/event and genre is null.';

-- ---------------------------------------------------------------------------
-- 6. refresh_user_preferences_v5: aggregate user_preference_signals -> user_preferences
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
  -- Resolve raw genre to canonical genres.name via genres.normalized_key so "pop"/"Pop"/"POP" collapse to one
  genre_by_user AS (
    SELECT
      ups.user_id,
      COALESCE(g.name, ups.genre) AS canonical_genre,
      sum(ups.signal_weight)::numeric AS score
    FROM public.user_preference_signals ups
    JOIN users_to_refresh u ON u.uid = ups.user_id
    LEFT JOIN public.genres g ON g.normalized_key = lower(trim(regexp_replace(ups.genre, '[-_\s]+', ' ', 'g')))
    WHERE ups.genre IS NOT NULL
    GROUP BY ups.user_id, COALESCE(g.name, ups.genre)
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
    last_computed_at = EXCLUDED.last_computed_at,
    updated_at = EXCLUDED.updated_at;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.refresh_user_preferences_v5 IS 'Aggregates user_preference_signals into user_preferences (genre/artist/venue scores and top_* arrays). Run for one user or all (p_user_id NULL).';

GRANT EXECUTE ON FUNCTION public.refresh_user_preferences_v5(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Backfill: existing user_preference_signals — set genre/cluster from entities
-- ---------------------------------------------------------------------------
-- Genre from first artist genre (artists_genres + genres)
UPDATE public.user_preference_signals ups
SET genre = sub.name, updated_at = now()
FROM (
  SELECT ag.artist_id, g.name,
    row_number() OVER (PARTITION BY ag.artist_id ORDER BY g.name) AS rn
  FROM public.artists_genres ag
  JOIN public.genres g ON g.id = ag.genre_id
) sub
WHERE ups.entity_type = 'artist' AND ups.entity_id = sub.artist_id AND sub.rn = 1 AND ups.genre IS NULL;

-- Cluster in context for artists (one cluster per artist)
UPDATE public.user_preference_signals ups
SET context = COALESCE(ups.context, '{}'::jsonb) || jsonb_build_object('cluster_path_slug', ac.cluster_path_slug), updated_at = now()
FROM (SELECT DISTINCT ON (artist_id) artist_id, cluster_path_slug FROM public.artist_clusters) ac
WHERE ups.entity_type = 'artist' AND ac.artist_id = ups.entity_id
  AND (NOT (COALESCE(ups.context, '{}'::jsonb) ? 'cluster_path_slug'));

-- Genre from first event genre
UPDATE public.user_preference_signals ups
SET genre = sub.name, updated_at = now()
FROM (
  SELECT eg.event_id, g.name,
    row_number() OVER (PARTITION BY eg.event_id ORDER BY g.name) AS rn
  FROM public.events_genres eg
  JOIN public.genres g ON g.id = eg.genre_id
) sub
WHERE ups.entity_type = 'event' AND ups.entity_id = sub.event_id AND sub.rn = 1 AND ups.genre IS NULL;

-- Cluster in context for events (one cluster per event)
UPDATE public.user_preference_signals ups
SET context = COALESCE(ups.context, '{}'::jsonb) || jsonb_build_object('cluster_path_slug', ec.cluster_path_slug), updated_at = now()
FROM (SELECT DISTINCT ON (event_id) event_id, cluster_path_slug FROM public.event_clusters) ec
WHERE ups.entity_type = 'event' AND ec.event_id = ups.entity_id
  AND (NOT (COALESCE(ups.context, '{}'::jsonb) ? 'cluster_path_slug'));

-- ---------------------------------------------------------------------------
-- 8. Backfill from user_artist_interactions and user_genre_interactions (if tables exist)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_artist_interactions') THEN
    INSERT INTO public.user_preference_signals (
      user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at, updated_at
    )
    SELECT
      uai.user_id,
      CASE uai.interaction_type
        WHEN 'review' THEN 'review'::public.preference_signal_type
        WHEN 'follow' THEN 'follow'::public.preference_signal_type
        WHEN 'interest' THEN 'interest'::public.preference_signal_type
        WHEN 'streaming_top' THEN 'streaming_profile_synced'::public.preference_signal_type
        WHEN 'streaming_recent' THEN 'streaming_profile_synced'::public.preference_signal_type
        WHEN 'attendance' THEN 'attendance'::public.preference_signal_type
        WHEN 'view' THEN 'view'::public.preference_signal_type
        ELSE 'interest'::public.preference_signal_type
      END,
      'artist'::public.preference_entity_type,
      uai.artist_id,
      uai.artist_name,
      LEAST(COALESCE(uai.interaction_strength, 5)::numeric / 2.0, 5.0),
      (SELECT g.name FROM public.artists_genres ag JOIN public.genres g ON g.id = ag.genre_id WHERE ag.artist_id = uai.artist_id LIMIT 1),
      jsonb_build_object('source', 'user_artist_interactions', 'interaction_type', uai.interaction_type),
      uai.occurred_at,
      uai.occurred_at,
      now()
    FROM public.user_artist_interactions uai
    WHERE uai.artist_id IS NOT NULL
    ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_genre_interactions') THEN
    INSERT INTO public.user_preference_signals (
      user_id, signal_type, entity_type, entity_id, entity_name, signal_weight, genre, context, occurred_at, created_at, updated_at
    )
    SELECT
      ugi.user_id,
      CASE ugi.interaction_type
        WHEN 'review' THEN 'review'::public.preference_signal_type
        WHEN 'streaming_top' THEN 'streaming_profile_synced'::public.preference_signal_type
        ELSE 'interest'::public.preference_signal_type
      END,
      'genre'::public.preference_entity_type,
      NULL,
      COALESCE(g.name, ugi.genre),
      LEAST(COALESCE(ugi.interaction_count, 1)::numeric, 5.0),
      COALESCE(g.name, ugi.genre),
      jsonb_build_object('source', 'user_genre_interactions', 'interaction_type', ugi.interaction_type),
      ugi.occurred_at,
      ugi.occurred_at,
      now()
    FROM public.user_genre_interactions ugi
    LEFT JOIN public.genres g ON g.normalized_key = lower(trim(regexp_replace(ugi.genre, '[-_\s]+', ' ', 'g')))
    ON CONFLICT (user_id, signal_type, entity_type, entity_id, occurred_at) DO NOTHING;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 9. Normalize existing user_preference_signals.genre to canonical genres.name
-- ---------------------------------------------------------------------------
UPDATE public.user_preference_signals ups
SET genre = g.name, updated_at = now()
FROM public.genres g
WHERE ups.genre IS NOT NULL
  AND g.normalized_key = lower(trim(regexp_replace(ups.genre, '[-_\s]+', ' ', 'g')))
  AND ups.genre IS DISTINCT FROM g.name;

-- Run refresh_user_cluster_affinity and refresh_user_preferences_v5 (optional; can be run manually)
SELECT public.refresh_user_cluster_affinity();
SELECT public.refresh_user_preferences_v5(NULL);
