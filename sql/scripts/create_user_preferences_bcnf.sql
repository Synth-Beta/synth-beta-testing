-- ============================================
-- USER PREFERENCES SYSTEM - BCNF NORMALIZED
-- ============================================
-- This schema tracks music preferences in BCNF form:
-- 1. user_preference_signals - Fact table (one row per signal)
-- 2. user_preferences - Aggregated preferences (one row per user)
-- 3. Settings separated from preferences

-- ============================================
-- 1. CREATE SIGNAL TYPE ENUM
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preference_signal_type') THEN
    CREATE TYPE preference_signal_type AS ENUM (
      -- Artist signals
      'artist_follow',
      'artist_unfollow',
      'artist_search',
      'artist_review',
      
      -- Event signals
      'event_interest',
      'event_interest_removed',
      'event_attendance',
      'event_attendance_removed',
      'event_review_created',
      'event_review_updated',
      'event_review_deleted',
      'event_search',
      'event_ticket_click',
      
      -- Venue signals
      'venue_follow',
      'venue_unfollow',
      'venue_review',
      'venue_search',
      
      -- Streaming signals
      'streaming_spotify_connected',
      'streaming_apple_music_connected',
      'streaming_profile_synced',
      'streaming_top_track_short',
      'streaming_top_track_medium',
      'streaming_top_track_long',
      'streaming_top_artist_short',
      'streaming_top_artist_medium',
      'streaming_top_artist_long',
      'streaming_recent_play',
      'streaming_setlist_add',
      
      -- Genre signals
      'genre_search',
      'genre_manual_preference',
      'artist_manual_preference',
      'venue_manual_preference',
      
      -- Review content signals
      'review_rating_overall',
      'review_rating_artist_performance',
      'review_rating_production',
      'review_rating_venue',
      'review_rating_location',
      'review_rating_value',
      'review_reaction_emoji',
      'review_genre_tags',
      'review_mood_tags',
      'review_context_tags',
      'review_photos',
      'review_videos'
    );
  END IF;
END $$;

-- ============================================
-- 2. CREATE ENTITY TYPE ENUM
-- ============================================
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'preference_entity_type') THEN
    CREATE TYPE preference_entity_type AS ENUM (
      'artist',
      'event',
      'venue',
      'song',
      'genre',
      'review'
    );
  END IF;
END $$;

-- ============================================
-- 3. USER_PREFERENCE_SIGNALS TABLE (FACT TABLE)
-- ============================================
-- One row per preference signal - BCNF normalized
CREATE TABLE IF NOT EXISTS public.user_preference_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- WHO: User who generated this signal
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  
  -- WHAT: Type of signal (from enum)
  signal_type preference_signal_type NOT NULL,
  
  -- WHICH: Entity this signal relates to (polymorphic)
  entity_type preference_entity_type NOT NULL,
  entity_id UUID,  -- UUID for artist, event, venue, song, review
  entity_name TEXT,  -- Denormalized name for faster queries
  
  -- STRENGTH: Weight/strength of this signal (0-10+)
  -- Higher = stronger preference indication
  signal_weight NUMERIC(5,2) NOT NULL DEFAULT 1.0 CHECK (signal_weight >= 0),
  
  -- GENRE: Extracted genre(s) from this signal (for genre preference tracking)
  -- One row per genre if multiple genres (normalized)
  genre TEXT,
  
  -- CONTEXT: Additional signal context
  context JSONB DEFAULT '{}',
  -- Example context fields:
  -- - rating: numeric (for review ratings)
  -- - time_range: text (for streaming signals: short/medium/long)
  -- - search_query: text (for search signals)
  -- - tags: text[] (for review tags)
  
  -- TIMESTAMPS
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),  -- When signal occurred
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- CONSTRAINTS
  CONSTRAINT user_preference_signals_user_signal_entity_unique 
    UNIQUE(user_id, signal_type, entity_type, entity_id, occurred_at)
);

-- INDEXES for user_preference_signals
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_id 
  ON public.user_preference_signals(user_id);

CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_type 
  ON public.user_preference_signals(user_id, signal_type);

CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_entity 
  ON public.user_preference_signals(user_id, entity_type, entity_id);

CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_genre 
  ON public.user_preference_signals(user_id, genre) 
  WHERE genre IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_pref_signals_user_weight 
  ON public.user_preference_signals(user_id, signal_weight DESC, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_pref_signals_occurred 
  ON public.user_preference_signals(user_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_pref_signals_entity 
  ON public.user_preference_signals(entity_type, entity_id);

-- GIN index for context JSONB
CREATE INDEX IF NOT EXISTS idx_user_pref_signals_context 
  ON public.user_preference_signals USING GIN(context);

-- ============================================
-- 4. USER_PREFERENCES TABLE (AGGREGATED)
-- ============================================
-- One row per user - computed/aggregated preferences
-- This is derived from user_preference_signals

-- Create table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  
  -- COMPUTED PREFERENCE SCORES (updated via triggers/functions)
  -- Genre preferences: JSONB with genre -> score mapping
  -- Format: {"rock": 8.5, "jazz": 6.2, "edm": 4.1}
  genre_preference_scores JSONB DEFAULT '{}',
  
  -- Artist preferences: JSONB with artist_id -> score mapping
  -- Format: {"uuid-1": 9.0, "uuid-2": 7.5}
  artist_preference_scores JSONB DEFAULT '{}',
  
  -- Venue preferences: JSONB with venue_id -> score mapping
  -- Format: {"uuid-1": 8.0, "uuid-2": 6.0}
  venue_preference_scores JSONB DEFAULT '{}',
  
  -- Top genres (computed from signals, ordered by score)
  top_genres TEXT[] DEFAULT '{}',
  
  -- Top artists (computed from signals, ordered by score)
  top_artists UUID[] DEFAULT '{}',
  
  -- Top venues (computed from signals, ordered by score)
  top_venues UUID[] DEFAULT '{}',
  
  -- METADATA
  last_signal_at TIMESTAMPTZ,  -- Last signal that updated preferences
  signal_count INTEGER DEFAULT 0,  -- Total number of signals
  last_computed_at TIMESTAMPTZ,  -- When preferences were last computed
  
  -- TIMESTAMPS
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Add columns if they don't exist (for existing tables)
DO $$
BEGIN
  -- Add genre_preference_scores
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_preferences' 
    AND column_name = 'genre_preference_scores'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN genre_preference_scores JSONB DEFAULT '{}';
  END IF;

  -- Add artist_preference_scores
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_preferences' 
    AND column_name = 'artist_preference_scores'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN artist_preference_scores JSONB DEFAULT '{}';
  END IF;

  -- Add venue_preference_scores
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_preferences' 
    AND column_name = 'venue_preference_scores'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN venue_preference_scores JSONB DEFAULT '{}';
  END IF;

  -- Add top_genres
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_preferences' 
    AND column_name = 'top_genres'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN top_genres TEXT[] DEFAULT '{}';
  END IF;

  -- Add top_artists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_preferences' 
    AND column_name = 'top_artists'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN top_artists UUID[] DEFAULT '{}';
  END IF;

  -- Add top_venues
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_preferences' 
    AND column_name = 'top_venues'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN top_venues UUID[] DEFAULT '{}';
  END IF;

  -- Add last_signal_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_preferences' 
    AND column_name = 'last_signal_at'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN last_signal_at TIMESTAMPTZ;
  END IF;

  -- Add signal_count
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_preferences' 
    AND column_name = 'signal_count'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN signal_count INTEGER DEFAULT 0;
  END IF;

  -- Add last_computed_at
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'user_preferences' 
    AND column_name = 'last_computed_at'
  ) THEN
    ALTER TABLE public.user_preferences ADD COLUMN last_computed_at TIMESTAMPTZ;
  END IF;
END $$;

-- INDEXES for user_preferences
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id 
  ON public.user_preferences(user_id);

CREATE INDEX IF NOT EXISTS idx_user_preferences_genre_scores 
  ON public.user_preferences USING GIN(genre_preference_scores);

CREATE INDEX IF NOT EXISTS idx_user_preferences_artist_scores 
  ON public.user_preferences USING GIN(artist_preference_scores);

CREATE INDEX IF NOT EXISTS idx_user_preferences_venue_scores 
  ON public.user_preferences USING GIN(venue_preference_scores);

CREATE INDEX IF NOT EXISTS idx_user_preferences_top_genres 
  ON public.user_preferences USING GIN(top_genres);

CREATE INDEX IF NOT EXISTS idx_user_preferences_top_artists 
  ON public.user_preferences USING GIN(top_artists);

CREATE INDEX IF NOT EXISTS idx_user_preferences_top_venues 
  ON public.user_preferences USING GIN(top_venues);

-- ============================================
-- 5. USER_SETTINGS TABLE (SEPARATED FROM PREFERENCES)
-- ============================================
-- Settings are separate from preferences (different concern)
CREATE TABLE IF NOT EXISTS public.user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(user_id) ON DELETE CASCADE,
  
  -- Notification preferences
  notification_preferences JSONB DEFAULT '{}',
  -- Format: {"event_interest": true, "artist_follow": true, "venue_follow": false}
  
  -- Email preferences
  email_preferences JSONB DEFAULT '{}',
  -- Format: {"weekly_digest": true, "event_reminders": true}
  
  -- Privacy settings
  privacy_settings JSONB DEFAULT '{}',
  -- Format: {"profile_public": true, "reviews_public": true}
  
  -- TIMESTAMPS
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- INDEXES for user_settings
CREATE INDEX IF NOT EXISTS idx_user_settings_user_id 
  ON public.user_settings(user_id);

CREATE INDEX IF NOT EXISTS idx_user_settings_notifications 
  ON public.user_settings USING GIN(notification_preferences);

CREATE INDEX IF NOT EXISTS idx_user_settings_email 
  ON public.user_settings USING GIN(email_preferences);

CREATE INDEX IF NOT EXISTS idx_user_settings_privacy 
  ON public.user_settings USING GIN(privacy_settings);

-- ============================================
-- 6. ROW LEVEL SECURITY
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.user_preference_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies for user_preference_signals
DROP POLICY IF EXISTS "Users can view their own signals" ON public.user_preference_signals;
CREATE POLICY "Users can view their own signals"
ON public.user_preference_signals FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own signals" ON public.user_preference_signals;
CREATE POLICY "Users can create their own signals"
ON public.user_preference_signals FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all signals" ON public.user_preference_signals;
CREATE POLICY "Admins can view all signals"
ON public.user_preference_signals FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- RLS Policies for user_preferences
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.user_preferences;
CREATE POLICY "Users can view their own preferences"
ON public.user_preferences FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
CREATE POLICY "Users can update their own preferences"
ON public.user_preferences FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all preferences" ON public.user_preferences;
CREATE POLICY "Admins can view all preferences"
ON public.user_preferences FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- RLS Policies for user_settings
DROP POLICY IF EXISTS "Users can view their own settings" ON public.user_settings;
CREATE POLICY "Users can view their own settings"
ON public.user_settings FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own settings" ON public.user_settings;
CREATE POLICY "Users can update their own settings"
ON public.user_settings FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own settings" ON public.user_settings;
CREATE POLICY "Users can insert their own settings"
ON public.user_settings FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 7. TRIGGERS
-- ============================================

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
DROP TRIGGER IF EXISTS trigger_update_user_pref_signals_updated_at ON public.user_preference_signals;
CREATE TRIGGER trigger_update_user_pref_signals_updated_at
  BEFORE UPDATE ON public.user_preference_signals
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_user_preferences_updated_at ON public.user_preferences;
CREATE TRIGGER trigger_update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trigger_update_user_settings_updated_at ON public.user_settings;
CREATE TRIGGER trigger_update_user_settings_updated_at
  BEFORE UPDATE ON public.user_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- 8. FUNCTION: Compute user preferences from signals
-- ============================================
CREATE OR REPLACE FUNCTION compute_user_preferences(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_genre_scores JSONB := '{}';
  v_artist_scores JSONB := '{}';
  v_venue_scores JSONB := '{}';
  v_top_genres TEXT[] := '{}';
  v_top_artists UUID[] := '{}';
  v_top_venues UUID[] := '{}';
  v_signal_count INTEGER;
  v_last_signal_at TIMESTAMPTZ;
BEGIN
  -- Aggregate genre preference scores
  SELECT 
    jsonb_object_agg(genre, total_score)
  INTO v_genre_scores
  FROM (
    SELECT 
      genre,
      SUM(signal_weight) as total_score
    FROM public.user_preference_signals
    WHERE user_id = p_user_id
      AND genre IS NOT NULL
    GROUP BY genre
    ORDER BY total_score DESC
  ) genre_agg;

  -- Aggregate artist preference scores
  SELECT 
    jsonb_object_agg(entity_id::text, total_score)
  INTO v_artist_scores
  FROM (
    SELECT 
      entity_id,
      SUM(signal_weight) as total_score
    FROM public.user_preference_signals
    WHERE user_id = p_user_id
      AND entity_type = 'artist'
      AND entity_id IS NOT NULL
    GROUP BY entity_id
    ORDER BY total_score DESC
    LIMIT 100  -- Top 100 artists
  ) artist_agg;

  -- Aggregate venue preference scores
  SELECT 
    jsonb_object_agg(entity_id::text, total_score)
  INTO v_venue_scores
  FROM (
    SELECT 
      entity_id,
      SUM(signal_weight) as total_score
    FROM public.user_preference_signals
    WHERE user_id = p_user_id
      AND entity_type = 'venue'
      AND entity_id IS NOT NULL
    GROUP BY entity_id
    ORDER BY total_score DESC
    LIMIT 50  -- Top 50 venues
  ) venue_agg;

  -- Get top genres (ordered by score)
  SELECT ARRAY_AGG(genre ORDER BY score DESC)
  INTO v_top_genres
  FROM (
    SELECT 
      genre,
      SUM(signal_weight) as score
    FROM public.user_preference_signals
    WHERE user_id = p_user_id
      AND genre IS NOT NULL
    GROUP BY genre
    ORDER BY score DESC
    LIMIT 20  -- Top 20 genres
  ) top_genres;

  -- Get top artists (ordered by score)
  SELECT ARRAY_AGG(entity_id ORDER BY score DESC)
  INTO v_top_artists
  FROM (
    SELECT 
      entity_id,
      SUM(signal_weight) as score
    FROM public.user_preference_signals
    WHERE user_id = p_user_id
      AND entity_type = 'artist'
      AND entity_id IS NOT NULL
    GROUP BY entity_id
    ORDER BY score DESC
    LIMIT 50  -- Top 50 artists
  ) top_artists;

  -- Get top venues (ordered by score)
  SELECT ARRAY_AGG(entity_id ORDER BY score DESC)
  INTO v_top_venues
  FROM (
    SELECT 
      entity_id,
      SUM(signal_weight) as score
    FROM public.user_preference_signals
    WHERE user_id = p_user_id
      AND entity_type = 'venue'
      AND entity_id IS NOT NULL
    GROUP BY entity_id
    ORDER BY score DESC
    LIMIT 30  -- Top 30 venues
  ) top_venues;

  -- Get signal count and last signal time
  SELECT 
    COUNT(*),
    MAX(occurred_at)
  INTO v_signal_count, v_last_signal_at
  FROM public.user_preference_signals
  WHERE user_id = p_user_id;

  -- Insert or update user preferences
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
    last_computed_at
  ) VALUES (
    p_user_id,
    COALESCE(v_genre_scores, '{}'),
    COALESCE(v_artist_scores, '{}'),
    COALESCE(v_venue_scores, '{}'),
    COALESCE(v_top_genres, '{}'),
    COALESCE(v_top_artists, '{}'),
    COALESCE(v_top_venues, '{}'),
    v_last_signal_at,
    COALESCE(v_signal_count, 0),
    now()
  )
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
    updated_at = now();
END;
$$;

-- ============================================
-- 9. TRIGGER: Auto-compute preferences when signal is inserted
-- ============================================
CREATE OR REPLACE FUNCTION trigger_compute_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Compute preferences for the user (async via function)
  PERFORM compute_user_preferences(NEW.user_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_auto_compute_preferences ON public.user_preference_signals;
CREATE TRIGGER trigger_auto_compute_preferences
  AFTER INSERT OR UPDATE ON public.user_preference_signals
  FOR EACH ROW
  EXECUTE FUNCTION trigger_compute_preferences();

-- ============================================
-- 10. COMMENTS
-- ============================================
COMMENT ON TABLE public.user_preference_signals IS 
'Fact table tracking all music preference signals. One row per signal. BCNF normalized.';

COMMENT ON TABLE public.user_preferences IS 
'Aggregated/computed user preferences derived from user_preference_signals. One row per user.';

COMMENT ON TABLE public.user_settings IS 
'User settings (notifications, email, privacy) - separate from preferences.';

COMMENT ON COLUMN public.user_preference_signals.signal_weight IS 
'Weight/strength of preference signal (0-10+). Higher = stronger preference. Suggested weights: event_attendance=10, event_review=8, artist_follow=7, event_interest=5, song_streamed=3.';

COMMENT ON COLUMN public.user_preference_signals.genre IS 
'Extracted genre from signal. If signal relates to multiple genres, create one row per genre (normalized).';

COMMENT ON COLUMN public.user_preferences.genre_preference_scores IS 
'JSONB mapping genre -> aggregated score. Computed from user_preference_signals.';

COMMENT ON COLUMN public.user_preferences.artist_preference_scores IS 
'JSONB mapping artist_id -> aggregated score. Computed from user_preference_signals.';

COMMENT ON COLUMN public.user_preferences.venue_preference_scores IS 
'JSONB mapping venue_id -> aggregated score. Computed from user_preference_signals.';

