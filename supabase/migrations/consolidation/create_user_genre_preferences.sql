-- ============================================
-- CREATE USER_GENRE_PREFERENCES TABLE
-- ============================================
-- Unified table for tracking user genre preferences from all interaction types
-- Consolidates: user_genre_interactions, user_artist_interactions, 
--              user_song_interactions, event interests, reviews, attendance
-- Source tables (artists, events, venues) keep genres for fast filtering (denormalized)

CREATE TABLE IF NOT EXISTS public.user_genre_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- WHO: User whose preference this is
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  
  -- WHAT: The genre (individual genre, not array)
  genre TEXT NOT NULL,
  subgenre TEXT,  -- Optional subgenre classification
  
  -- HOW: What interaction/source created this preference signal
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    -- Event interactions
    'event_interest',      -- User marked event as interested/going
    'event_review',        -- User reviewed an event
    'event_attendance',    -- User attended an event (marked was_there)
    'event_like',          -- User liked an event
    'event_share',         -- User shared an event
    
    -- Artist interactions
    'artist_follow',       -- User followed an artist
    'artist_unfollow',     -- Negative signal
    'artist_review',       -- User reviewed an artist
    'artist_search',       -- User searched for artist
    'artist_view',         -- User viewed artist profile
    
    -- Song/Streaming interactions
    'song_streamed',       -- User streamed a song
    'song_top_track',      -- Song in user's top tracks
    'song_recent',         -- Recently played song
    'song_review_mentioned', -- Song mentioned in review
    'song_setlist_viewed', -- User viewed setlist with song
    'song_custom_setlist', -- User added song to custom setlist
    
    -- Venue interactions
    'venue_follow',        -- User followed a venue
    'venue_review',        -- User reviewed a venue
    'venue_attendance',    -- User attended event at venue
    
    -- Direct genre interactions (from old user_genre_interactions)
    'genre_exposure',      -- General genre exposure
    'genre_search',        -- User searched for genre
    
    -- Manual preferences
    'manual_preference'    -- User manually set preference
  )),
  
  -- SOURCE ENTITY: What entity triggered this preference (polymorphic)
  source_entity_type TEXT CHECK (source_entity_type IN (
    'event', 'artist', 'song', 'venue', 'review', 'streaming_profile', 'manual'
  )),
  source_entity_id UUID,   -- event_id, artist_id, review_id, etc.
  source_entity_name TEXT, -- Denormalized name for faster queries (event title, artist name, etc.)
  
  -- PREFERENCE STRENGTH: How strong is this preference signal
  preference_score NUMERIC(5,2) NOT NULL DEFAULT 1.0 CHECK (preference_score >= 0),
  -- Suggested weights by interaction_type:
  -- event_attendance: 10.0 (strongest)
  -- event_review: 8.0
  -- event_interest: 5.0
  -- artist_follow: 7.0
  -- song_streamed: 3.0
  -- song_top_track: 6.0
  -- venue_attendance: 7.0
  -- manual_preference: 9.0
  
  -- CONTEXT: Additional context about the preference
  context JSONB DEFAULT '{}',  -- Additional metadata (rating, interaction_strength, etc.)
  
  -- TIMESTAMPS
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- When the interaction occurred
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),   -- When this preference record was created
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),   -- Last update (for aggregation/de-duplication)
  
  -- METADATA: Store original table and ID for reference
  metadata JSONB DEFAULT '{}'  -- original_table, original_id, etc.
);

-- INDEXES
-- Primary lookup: user + genre
CREATE INDEX IF NOT EXISTS idx_user_genre_prefs_user_genre 
  ON public.user_genre_preferences(user_id, genre);

-- User preferences ordered by score
CREATE INDEX IF NOT EXISTS idx_user_genre_prefs_user_score 
  ON public.user_genre_preferences(user_id, preference_score DESC, occurred_at DESC);

-- Interaction type filtering
CREATE INDEX IF NOT EXISTS idx_user_genre_prefs_user_type 
  ON public.user_genre_preferences(user_id, interaction_type);

-- Source entity lookups
CREATE INDEX IF NOT EXISTS idx_user_genre_prefs_source_entity 
  ON public.user_genre_preferences(source_entity_type, source_entity_id);

-- Time-based queries
CREATE INDEX IF NOT EXISTS idx_user_genre_prefs_occurred 
  ON public.user_genre_preferences(user_id, occurred_at DESC);

-- Genre popularity (across all users)
CREATE INDEX IF NOT EXISTS idx_user_genre_prefs_genre_score 
  ON public.user_genre_preferences(genre, preference_score DESC);

-- Composite index for aggregation queries
CREATE INDEX IF NOT EXISTS idx_user_genre_prefs_user_genre_type 
  ON public.user_genre_preferences(user_id, genre, interaction_type, occurred_at DESC);

-- Enable RLS
ALTER TABLE public.user_genre_preferences ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES
-- Users can view their own preferences
DROP POLICY IF EXISTS "Users can view their own genre preferences" ON public.user_genre_preferences;
CREATE POLICY "Users can view their own genre preferences"
ON public.user_genre_preferences FOR SELECT
USING (auth.uid() = user_id);

-- Users can insert their own preferences (via triggers/functions)
DROP POLICY IF EXISTS "Users can create their own genre preferences" ON public.user_genre_preferences;
CREATE POLICY "Users can create their own genre preferences"
ON public.user_genre_preferences FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own preferences
DROP POLICY IF EXISTS "Users can update their own genre preferences" ON public.user_genre_preferences;
CREATE POLICY "Users can update their own genre preferences"
ON public.user_genre_preferences FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admins can view all preferences
DROP POLICY IF EXISTS "Admins can view all genre preferences" ON public.user_genre_preferences;
CREATE POLICY "Admins can view all genre preferences"
ON public.user_genre_preferences FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- FUNCTION: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_genre_preferences_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGER: Auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_user_genre_preferences_updated_at ON public.user_genre_preferences;
CREATE TRIGGER trigger_update_user_genre_preferences_updated_at
  BEFORE UPDATE ON public.user_genre_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_user_genre_preferences_updated_at();

-- COMMENTS
COMMENT ON TABLE public.user_genre_preferences IS 
'Unified table tracking user genre preferences from all interaction types (events, artists, songs, venues, reviews, streaming). Source tables (artists, events, venues) maintain genres for fast filtering (denormalized).';

COMMENT ON COLUMN public.user_genre_preferences.genre IS 
'Individual genre name (not array) - one row per genre per interaction';

COMMENT ON COLUMN public.user_genre_preferences.preference_score IS 
'Weight/strength of preference signal (0-10+). Higher = stronger preference. Aggregated scores determine user genre preferences.';

COMMENT ON COLUMN public.user_genre_preferences.occurred_at IS 
'When the original interaction occurred (e.g., when user streamed song, marked event interested, etc.)';

