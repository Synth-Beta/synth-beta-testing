-- ============================================================
-- MIGRATION 1: Core Music Tracking Tables
-- Creates the foundation tables for comprehensive music metadata tracking
-- All tables map directly to user UUID from auth.users
-- ============================================================

-- ============================================================
-- TABLE: user_artist_interactions
-- Every artist interaction mapped to user UUID
-- ============================================================
CREATE TABLE IF NOT EXISTS user_artist_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- USER MAPPING (REQUIRED)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- ARTIST MAPPING
  artist_id UUID REFERENCES artists(id) ON DELETE SET NULL,
  artist_name TEXT NOT NULL,
  jambase_artist_id TEXT,
  spotify_artist_id TEXT,
  apple_music_artist_id TEXT,
  
  -- INTERACTION DATA
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    'follow', 'unfollow', 'interest', 'review', 'attendance', 
    'search', 'view', 'streaming_top', 'streaming_recent'
  )),
  interaction_strength INT NOT NULL DEFAULT 5 CHECK (interaction_strength BETWEEN 1 AND 10),
  
  -- MUSIC METADATA
  genres TEXT[] DEFAULT '{}',
  popularity_score INT,
  
  -- SOURCE TRACKING (what triggered this interaction)
  source_entity_type TEXT,
  source_entity_id TEXT,
  
  -- METADATA
  metadata JSONB DEFAULT '{}',
  session_id UUID,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes optimized for user UUID lookups
CREATE INDEX IF NOT EXISTS idx_user_artist_int_user_id ON user_artist_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_artist_int_user_artist ON user_artist_interactions(user_id, artist_id);
CREATE INDEX IF NOT EXISTS idx_user_artist_int_user_type ON user_artist_interactions(user_id, interaction_type);
CREATE INDEX IF NOT EXISTS idx_user_artist_int_user_occurred ON user_artist_interactions(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_artist_int_genres ON user_artist_interactions USING GIN(genres);

COMMENT ON TABLE user_artist_interactions IS 'Tracks every user-artist interaction mapped to user UUID';
COMMENT ON COLUMN user_artist_interactions.user_id IS 'Foreign key to auth.users(id) - the user who performed this interaction';

-- ============================================================
-- TABLE: user_genre_interactions
-- Every genre exposure mapped to user UUID
-- ============================================================
CREATE TABLE IF NOT EXISTS user_genre_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- USER MAPPING (REQUIRED)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- GENRE DATA
  genre TEXT NOT NULL,
  subgenres TEXT[] DEFAULT '{}',
  
  -- INTERACTION DATA
  interaction_type TEXT NOT NULL,
  interaction_count INT NOT NULL DEFAULT 1,
  
  -- ARTIST CONTEXT (which artists exposed user to this genre)
  artist_names TEXT[] DEFAULT '{}',
  artist_ids UUID[] DEFAULT '{}',
  
  -- SOURCE TRACKING
  source_entity_type TEXT,
  source_entity_id TEXT,
  
  -- METADATA
  metadata JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for user UUID queries
CREATE INDEX IF NOT EXISTS idx_user_genre_int_user_id ON user_genre_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_genre_int_user_genre ON user_genre_interactions(user_id, genre);
CREATE INDEX IF NOT EXISTS idx_user_genre_int_user_occurred ON user_genre_interactions(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_genre_int_user_count ON user_genre_interactions(user_id, interaction_count DESC);

COMMENT ON TABLE user_genre_interactions IS 'Tracks every genre exposure per user';
COMMENT ON COLUMN user_genre_interactions.user_id IS 'Foreign key to auth.users(id) - the user exposed to this genre';

-- ============================================================
-- TABLE: user_song_interactions
-- Every song interaction mapped to user UUID
-- ============================================================
CREATE TABLE IF NOT EXISTS user_song_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- USER MAPPING (REQUIRED)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- SONG DATA
  song_id TEXT NOT NULL,
  song_name TEXT NOT NULL,
  artist_names TEXT[] DEFAULT '{}',
  artist_ids TEXT[] DEFAULT '{}',
  album_name TEXT,
  
  -- MUSIC METADATA
  genres TEXT[] DEFAULT '{}',
  popularity_score INT,
  duration_ms INT,
  
  -- INTERACTION DATA
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    'streamed', 'setlist_viewed', 'custom_setlist_added', 
    'review_mentioned', 'searched', 'top_track'
  )),
  played_at TIMESTAMPTZ,
  
  -- SOURCE TRACKING
  source_entity_type TEXT,
  source_entity_id TEXT,
  
  -- METADATA
  metadata JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for user UUID queries
CREATE INDEX IF NOT EXISTS idx_user_song_int_user_id ON user_song_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_song_int_user_song ON user_song_interactions(user_id, song_id);
CREATE INDEX IF NOT EXISTS idx_user_song_int_user_type ON user_song_interactions(user_id, interaction_type);
CREATE INDEX IF NOT EXISTS idx_user_song_int_user_occurred ON user_song_interactions(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_song_int_artists ON user_song_interactions USING GIN(artist_ids);

COMMENT ON TABLE user_song_interactions IS 'Tracks every song interaction per user';
COMMENT ON COLUMN user_song_interactions.user_id IS 'Foreign key to auth.users(id) - the user who interacted with this song';

-- ============================================================
-- TABLE: user_venue_interactions
-- Every venue interaction mapped to user UUID
-- ============================================================
CREATE TABLE IF NOT EXISTS user_venue_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- USER MAPPING (REQUIRED)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- VENUE MAPPING
  venue_id UUID REFERENCES venues(id) ON DELETE SET NULL,
  venue_name TEXT NOT NULL,
  
  -- INTERACTION DATA
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    'follow', 'unfollow', 'interest', 'review', 'attendance', 'search', 'view'
  )),
  interaction_strength INT NOT NULL DEFAULT 5 CHECK (interaction_strength BETWEEN 1 AND 10),
  
  -- MUSIC CONTEXT (what music is associated with this venue)
  typical_genres TEXT[] DEFAULT '{}',
  artists_seen_here TEXT[] DEFAULT '{}',
  event_count_at_venue INT DEFAULT 0,
  
  -- SOURCE TRACKING
  source_entity_type TEXT,
  source_entity_id TEXT,
  
  -- METADATA
  metadata JSONB DEFAULT '{}',
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for user UUID queries
CREATE INDEX IF NOT EXISTS idx_user_venue_int_user_id ON user_venue_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_venue_int_user_venue ON user_venue_interactions(user_id, venue_id);
CREATE INDEX IF NOT EXISTS idx_user_venue_int_user_type ON user_venue_interactions(user_id, interaction_type);
CREATE INDEX IF NOT EXISTS idx_user_venue_int_user_occurred ON user_venue_interactions(user_id, occurred_at DESC);

COMMENT ON TABLE user_venue_interactions IS 'Tracks every venue interaction per user';
COMMENT ON COLUMN user_venue_interactions.user_id IS 'Foreign key to auth.users(id) - the user who interacted with this venue';

-- ============================================================
-- TABLE: music_preference_signals (Aggregated)
-- Calculated preference scores per user UUID
-- ============================================================
CREATE TABLE IF NOT EXISTS music_preference_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- USER MAPPING (REQUIRED)
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- PREFERENCE DATA
  preference_type TEXT NOT NULL CHECK (preference_type IN (
    'genre', 'subgenre', 'artist', 'venue', 'era', 'style', 'mood'
  )),
  preference_value TEXT NOT NULL,
  
  -- SCORING
  preference_score NUMERIC NOT NULL DEFAULT 0,
  interaction_count INT NOT NULL DEFAULT 0,
  
  -- INTERACTION BREAKDOWN
  interaction_types JSONB DEFAULT '{}',
  
  -- TEMPORAL DATA
  first_interaction TIMESTAMPTZ NOT NULL,
  last_interaction TIMESTAMPTZ NOT NULL,
  
  -- TREND ANALYSIS
  trend TEXT CHECK (trend IN ('increasing', 'stable', 'decreasing')),
  confidence NUMERIC DEFAULT 0.5 CHECK (confidence BETWEEN 0 AND 1),
  
  -- METADATA
  metadata JSONB DEFAULT '{}',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Each user has unique preference entries
  UNIQUE(user_id, preference_type, preference_value)
);

-- Indexes for user UUID queries
CREATE INDEX IF NOT EXISTS idx_music_pref_user_id ON music_preference_signals(user_id);
CREATE INDEX IF NOT EXISTS idx_music_pref_user_type ON music_preference_signals(user_id, preference_type);
CREATE INDEX IF NOT EXISTS idx_music_pref_user_type_value ON music_preference_signals(user_id, preference_type, preference_value);
CREATE INDEX IF NOT EXISTS idx_music_pref_user_score ON music_preference_signals(user_id, preference_score DESC);
CREATE INDEX IF NOT EXISTS idx_music_pref_user_updated ON music_preference_signals(user_id, updated_at DESC);

COMMENT ON TABLE music_preference_signals IS 'Aggregated music preference scores per user, calculated from all interactions';
COMMENT ON COLUMN music_preference_signals.user_id IS 'Foreign key to auth.users(id) - the user whose preferences these are';

-- ============================================================
-- TABLE: artist_genre_mapping
-- Artist to genre relationship tracking (shared data)
-- ============================================================
CREATE TABLE IF NOT EXISTS artist_genre_mapping (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artist_id UUID REFERENCES artists(id) ON DELETE CASCADE,
  artist_name TEXT NOT NULL,
  jambase_artist_id TEXT,
  spotify_artist_id TEXT,
  apple_music_artist_id TEXT,
  
  -- GENRE DATA
  genres TEXT[] DEFAULT '{}',
  subgenres TEXT[] DEFAULT '{}',
  genre_confidence JSONB DEFAULT '{}',
  
  -- SOURCE
  source TEXT CHECK (source IN ('jambase', 'spotify', 'apple-music', 'manual')),
  last_updated TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  UNIQUE(artist_id)
);

CREATE INDEX IF NOT EXISTS idx_artist_genre_map_artist ON artist_genre_mapping(artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_genre_map_genres ON artist_genre_mapping USING GIN(genres);
CREATE INDEX IF NOT EXISTS idx_artist_genre_map_spotify ON artist_genre_mapping(spotify_artist_id) WHERE spotify_artist_id IS NOT NULL;

COMMENT ON TABLE artist_genre_mapping IS 'Maps artists to their genres (shared reference data, not user-specific)';

-- ============================================================
-- Enable RLS on all user-specific tables
-- ============================================================
ALTER TABLE user_artist_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_genre_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_song_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_venue_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_preference_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE artist_genre_mapping ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- RLS Policies: Users can only see their own data
-- Drop existing policies first to avoid conflicts
-- ============================================================

-- Drop all existing policies if they exist
DROP POLICY IF EXISTS user_artist_interactions_select_own ON user_artist_interactions;
DROP POLICY IF EXISTS user_artist_interactions_insert_own ON user_artist_interactions;
DROP POLICY IF EXISTS user_genre_interactions_select_own ON user_genre_interactions;
DROP POLICY IF EXISTS user_genre_interactions_insert_own ON user_genre_interactions;
DROP POLICY IF EXISTS user_song_interactions_select_own ON user_song_interactions;
DROP POLICY IF EXISTS user_song_interactions_insert_own ON user_song_interactions;
DROP POLICY IF EXISTS user_venue_interactions_select_own ON user_venue_interactions;
DROP POLICY IF EXISTS user_venue_interactions_insert_own ON user_venue_interactions;
DROP POLICY IF EXISTS music_preference_signals_select_own ON music_preference_signals;
DROP POLICY IF EXISTS music_preference_signals_insert_own ON music_preference_signals;
DROP POLICY IF EXISTS music_preference_signals_update_own ON music_preference_signals;
DROP POLICY IF EXISTS artist_genre_mapping_select_all ON artist_genre_mapping;

-- Create policies
-- user_artist_interactions policies
CREATE POLICY user_artist_interactions_select_own 
ON user_artist_interactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY user_artist_interactions_insert_own
ON user_artist_interactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- user_genre_interactions policies
CREATE POLICY user_genre_interactions_select_own
ON user_genre_interactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY user_genre_interactions_insert_own
ON user_genre_interactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- user_song_interactions policies
CREATE POLICY user_song_interactions_select_own
ON user_song_interactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY user_song_interactions_insert_own
ON user_song_interactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- user_venue_interactions policies
CREATE POLICY user_venue_interactions_select_own
ON user_venue_interactions FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY user_venue_interactions_insert_own
ON user_venue_interactions FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- music_preference_signals policies
CREATE POLICY music_preference_signals_select_own
ON music_preference_signals FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY music_preference_signals_insert_own
ON music_preference_signals FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY music_preference_signals_update_own
ON music_preference_signals FOR UPDATE
USING (auth.uid() = user_id);

-- artist_genre_mapping - public read for all authenticated users
CREATE POLICY artist_genre_mapping_select_all
ON artist_genre_mapping FOR SELECT
TO authenticated USING (true);

