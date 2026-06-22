-- =============================================================================
-- Genre pipeline (core): genres, artists_genres, events_genres, helpers
-- Prerequisite for 20260129* (calendar umbrella, event_clusters, user_cluster_affinity, feed v3, etc.)
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Normalization function: generates a consistent key for deduplication
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_genre_key(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(trim(coalesce(raw, '')), '[-_\s]+', ' ', 'g'));
$$;

-- -----------------------------------------------------------------------------
-- Genres table: one row per unique normalized genre
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.genres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  normalized_key TEXT NOT NULL UNIQUE,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_genres_normalized_key ON public.genres(normalized_key);
CREATE INDEX IF NOT EXISTS idx_genres_slug ON public.genres(slug);
CREATE INDEX IF NOT EXISTS idx_genres_name ON public.genres(name);

-- -----------------------------------------------------------------------------
-- Artists-Genres join table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.artists_genres (
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  genre_id UUID NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (artist_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_artists_genres_artist ON public.artists_genres(artist_id);
CREATE INDEX IF NOT EXISTS idx_artists_genres_genre ON public.artists_genres(genre_id);

-- -----------------------------------------------------------------------------
-- Events-Genres join table (references events.id from concerts/events table)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.events_genres (
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  genre_id UUID NOT NULL REFERENCES public.genres(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_events_genres_event ON public.events_genres(event_id);
CREATE INDEX IF NOT EXISTS idx_events_genres_genre ON public.events_genres(genre_id);

-- -----------------------------------------------------------------------------
-- Helper: upsert a single genre and return its ID
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_genre(raw_genre TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_normalized_key TEXT;
  v_genre_id UUID;
BEGIN
  v_normalized_key := public.normalize_genre_key(raw_genre);
  IF v_normalized_key IS NULL OR length(v_normalized_key) < 2 THEN
    RETURN NULL;
  END IF;
  SELECT id INTO v_genre_id FROM public.genres WHERE normalized_key = v_normalized_key;
  IF v_genre_id IS NULL THEN
    INSERT INTO public.genres (name, normalized_key, slug)
    VALUES (
      initcap(v_normalized_key),
      v_normalized_key,
      replace(v_normalized_key, ' ', '-')
    )
    ON CONFLICT (normalized_key) DO UPDATE SET name = EXCLUDED.name
    RETURNING id INTO v_genre_id;
  END IF;
  RETURN v_genre_id;
END;
$$;

-- -----------------------------------------------------------------------------
-- Helper: link an artist to normalized genres from raw array
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_artist_genres(p_artist_id UUID, p_raw_genres TEXT[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_genre TEXT;
  v_genre_id UUID;
BEGIN
  DELETE FROM public.artists_genres WHERE artist_id = p_artist_id;
  IF p_raw_genres IS NULL OR array_length(p_raw_genres, 1) IS NULL THEN
    RETURN;
  END IF;
  FOREACH v_genre IN ARRAY p_raw_genres
  LOOP
    v_genre_id := public.upsert_genre(v_genre);
    IF v_genre_id IS NOT NULL THEN
      INSERT INTO public.artists_genres (artist_id, genre_id)
      VALUES (p_artist_id, v_genre_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- Helper: link an event to normalized genres from raw array
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_event_genres(p_event_id UUID, p_raw_genres TEXT[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_genre TEXT;
  v_genre_id UUID;
BEGIN
  DELETE FROM public.events_genres WHERE event_id = p_event_id;
  IF p_raw_genres IS NULL OR array_length(p_raw_genres, 1) IS NULL THEN
    RETURN;
  END IF;
  FOREACH v_genre IN ARRAY p_raw_genres
  LOOP
    v_genre_id := public.upsert_genre(v_genre);
    IF v_genre_id IS NOT NULL THEN
      INSERT INTO public.events_genres (event_id, genre_id)
      VALUES (p_event_id, v_genre_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.genres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Genres are viewable by everyone" ON public.genres;
CREATE POLICY "Genres are viewable by everyone" ON public.genres FOR SELECT USING (true);

ALTER TABLE public.artists_genres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Artist genres are viewable by everyone" ON public.artists_genres;
CREATE POLICY "Artist genres are viewable by everyone" ON public.artists_genres FOR SELECT USING (true);

ALTER TABLE public.events_genres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Event genres are viewable by everyone" ON public.events_genres;
CREATE POLICY "Event genres are viewable by everyone" ON public.events_genres FOR SELECT USING (true);
