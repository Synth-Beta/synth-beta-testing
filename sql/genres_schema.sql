-- =============================================================================
-- GENRES NORMALIZATION SCHEMA (3NF)
-- Creates normalized genres table with join tables for artists and events.
-- Raw JamBase strings remain on artists.genres and events.genres for reference.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Normalization function: generates a consistent key for deduplication
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION normalize_genre_key(raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT lower(regexp_replace(trim(coalesce(raw, '')), '[-_\s]+', ' ', 'g'));
$$;

-- -----------------------------------------------------------------------------
-- Genres table: one row per unique normalized genre
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS genres (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,                     -- Display name (e.g., "Hip Hop")
  normalized_key TEXT NOT NULL UNIQUE,    -- Dedup key (e.g., "hip hop")
  slug TEXT NOT NULL UNIQUE,              -- URL-safe (e.g., "hip-hop")
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_genres_normalized_key ON genres(normalized_key);
CREATE INDEX IF NOT EXISTS idx_genres_slug ON genres(slug);
CREATE INDEX IF NOT EXISTS idx_genres_name ON genres(name);

-- -----------------------------------------------------------------------------
-- Artists-Genres join table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS artists_genres (
  artist_id UUID NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (artist_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_artists_genres_artist ON artists_genres(artist_id);
CREATE INDEX IF NOT EXISTS idx_artists_genres_genre ON artists_genres(genre_id);

-- -----------------------------------------------------------------------------
-- Events-Genres join table
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events_genres (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  genre_id UUID NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (event_id, genre_id)
);

CREATE INDEX IF NOT EXISTS idx_events_genres_event ON events_genres(event_id);
CREATE INDEX IF NOT EXISTS idx_events_genres_genre ON events_genres(genre_id);

-- -----------------------------------------------------------------------------
-- Helper function: upsert a single genre and return its ID
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION upsert_genre(raw_genre TEXT)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_normalized_key TEXT;
  v_genre_id UUID;
BEGIN
  -- Normalize the input
  v_normalized_key := normalize_genre_key(raw_genre);
  
  -- Skip empty or very short strings
  IF v_normalized_key IS NULL OR length(v_normalized_key) < 2 THEN
    RETURN NULL;
  END IF;
  
  -- Try to find existing genre
  SELECT id INTO v_genre_id FROM genres WHERE normalized_key = v_normalized_key;
  
  -- If not found, insert new genre
  IF v_genre_id IS NULL THEN
    INSERT INTO genres (name, normalized_key, slug)
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
-- Helper function: link an artist to normalized genres from raw array
-- Clears existing links and creates new ones based on the raw genres array.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_artist_genres(p_artist_id UUID, p_raw_genres TEXT[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_genre TEXT;
  v_genre_id UUID;
BEGIN
  -- Delete existing genre links for this artist
  DELETE FROM artists_genres WHERE artist_id = p_artist_id;
  
  -- Skip if no genres
  IF p_raw_genres IS NULL OR array_length(p_raw_genres, 1) IS NULL THEN
    RETURN;
  END IF;
  
  -- Insert new genre links
  FOREACH v_genre IN ARRAY p_raw_genres
  LOOP
    v_genre_id := upsert_genre(v_genre);
    IF v_genre_id IS NOT NULL THEN
      INSERT INTO artists_genres (artist_id, genre_id)
      VALUES (p_artist_id, v_genre_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- Helper function: link an event to normalized genres from raw array
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION sync_event_genres(p_event_id UUID, p_raw_genres TEXT[])
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_genre TEXT;
  v_genre_id UUID;
BEGIN
  -- Delete existing genre links for this event
  DELETE FROM events_genres WHERE event_id = p_event_id;
  
  -- Skip if no genres
  IF p_raw_genres IS NULL OR array_length(p_raw_genres, 1) IS NULL THEN
    RETURN;
  END IF;
  
  -- Insert new genre links
  FOREACH v_genre IN ARRAY p_raw_genres
  LOOP
    v_genre_id := upsert_genre(v_genre);
    IF v_genre_id IS NOT NULL THEN
      INSERT INTO events_genres (event_id, genre_id)
      VALUES (p_event_id, v_genre_id)
      ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END;
$$;

-- -----------------------------------------------------------------------------
-- RLS Policies (if RLS is enabled on your database)
-- -----------------------------------------------------------------------------
-- Genres: viewable by everyone
ALTER TABLE genres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Genres are viewable by everyone" ON genres;
CREATE POLICY "Genres are viewable by everyone" ON genres FOR SELECT USING (true);

-- Artists_genres: viewable by everyone
ALTER TABLE artists_genres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Artist genres are viewable by everyone" ON artists_genres;
CREATE POLICY "Artist genres are viewable by everyone" ON artists_genres FOR SELECT USING (true);

-- Events_genres: viewable by everyone
ALTER TABLE events_genres ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Event genres are viewable by everyone" ON events_genres;
CREATE POLICY "Event genres are viewable by everyone" ON events_genres FOR SELECT USING (true);
