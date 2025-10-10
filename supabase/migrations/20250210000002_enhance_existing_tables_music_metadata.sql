-- ============================================================
-- MIGRATION 2: Enhance Existing Tables with Music Metadata
-- Add music tracking columns to existing tables
-- All tables already have user_id UUID FK to auth.users
-- ============================================================

-- Enhance user_jambase_events with music metadata
ALTER TABLE user_jambase_events 
ADD COLUMN IF NOT EXISTS artist_name TEXT;

ALTER TABLE user_jambase_events 
ADD COLUMN IF NOT EXISTS artist_genres TEXT[] DEFAULT '{}';

ALTER TABLE user_jambase_events 
ADD COLUMN IF NOT EXISTS venue_name TEXT;

ALTER TABLE user_jambase_events 
ADD COLUMN IF NOT EXISTS music_metadata JSONB DEFAULT '{}';

ALTER TABLE user_jambase_events 
ADD COLUMN IF NOT EXISTS music_captured BOOLEAN DEFAULT false;

ALTER TABLE user_jambase_events 
ADD COLUMN IF NOT EXISTS music_captured_at TIMESTAMPTZ;

-- Verify FK exists for user_jambase_events
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_jambase_events_user_id_fkey'
      AND table_name = 'user_jambase_events'
  ) THEN
    ALTER TABLE user_jambase_events 
    ADD CONSTRAINT user_jambase_events_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Enhance user_reviews with music metadata
ALTER TABLE user_reviews 
ADD COLUMN IF NOT EXISTS artist_names TEXT[] DEFAULT '{}';

ALTER TABLE user_reviews 
ADD COLUMN IF NOT EXISTS extracted_genres TEXT[] DEFAULT '{}';

ALTER TABLE user_reviews 
ADD COLUMN IF NOT EXISTS setlist_songs TEXT[] DEFAULT '{}';

ALTER TABLE user_reviews 
ADD COLUMN IF NOT EXISTS music_metadata JSONB DEFAULT '{}';

ALTER TABLE user_reviews 
ADD COLUMN IF NOT EXISTS music_captured BOOLEAN DEFAULT false;

-- Verify FK exists for user_reviews
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_reviews_user_id_fkey'
      AND table_name = 'user_reviews'
  ) THEN
    ALTER TABLE user_reviews 
    ADD CONSTRAINT user_reviews_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Enhance artist_follows with music metadata
ALTER TABLE artist_follows 
ADD COLUMN IF NOT EXISTS artist_genres TEXT[] DEFAULT '{}';

ALTER TABLE artist_follows 
ADD COLUMN IF NOT EXISTS artist_popularity INT;

ALTER TABLE artist_follows 
ADD COLUMN IF NOT EXISTS music_metadata JSONB DEFAULT '{}';

ALTER TABLE artist_follows 
ADD COLUMN IF NOT EXISTS music_captured BOOLEAN DEFAULT false;

-- Enhance venue_follows with music metadata
ALTER TABLE venue_follows 
ADD COLUMN IF NOT EXISTS venue_typical_genres TEXT[] DEFAULT '{}';

ALTER TABLE venue_follows 
ADD COLUMN IF NOT EXISTS music_metadata JSONB DEFAULT '{}';

ALTER TABLE venue_follows 
ADD COLUMN IF NOT EXISTS music_captured BOOLEAN DEFAULT false;

-- Enhance user_swipes with music metadata
ALTER TABLE user_swipes 
ADD COLUMN IF NOT EXISTS event_artist_name TEXT;

ALTER TABLE user_swipes 
ADD COLUMN IF NOT EXISTS event_genres TEXT[] DEFAULT '{}';

ALTER TABLE user_swipes 
ADD COLUMN IF NOT EXISTS music_context JSONB DEFAULT '{}';

-- Add helpful comments
COMMENT ON COLUMN user_jambase_events.music_metadata IS 'Captured music metadata from event for this user interaction';
COMMENT ON COLUMN user_reviews.music_metadata IS 'Captured music metadata from review for this user';
COMMENT ON COLUMN artist_follows.music_metadata IS 'Captured artist metadata at time of follow';
COMMENT ON COLUMN venue_follows.music_metadata IS 'Captured venue music context at time of follow';

