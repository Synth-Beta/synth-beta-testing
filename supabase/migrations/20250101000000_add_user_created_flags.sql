-- Migration to add is_user_created flag to track manually created data
-- This allows us to distinguish between API-sourced and user-created content

-- Add is_user_created column to artist_profile table
ALTER TABLE artist_profile 
ADD COLUMN IF NOT EXISTS is_user_created BOOLEAN DEFAULT FALSE;

-- Add is_user_created column to venue_profile table (if it exists)
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'venue_profile') THEN
    ALTER TABLE venue_profile 
    ADD COLUMN IF NOT EXISTS is_user_created BOOLEAN DEFAULT FALSE;
  END IF;
END $$;

-- Add is_user_created column to jambase_events table
ALTER TABLE jambase_events 
ADD COLUMN IF NOT EXISTS is_user_created BOOLEAN DEFAULT FALSE;

-- Add index for faster filtering of user-created content
CREATE INDEX IF NOT EXISTS idx_artist_profile_user_created ON artist_profile(is_user_created);
CREATE INDEX IF NOT EXISTS idx_jambase_events_user_created ON jambase_events(is_user_created);

-- Create index on venue_profile if table exists
DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'venue_profile') THEN
    CREATE INDEX IF NOT EXISTS idx_venue_profile_user_created ON venue_profile(is_user_created);
  END IF;
END $$;

-- Add comment to document the purpose
COMMENT ON COLUMN artist_profile.is_user_created IS 'Flag to indicate if this artist was manually created by a user (true) or sourced from JamBase API (false)';
COMMENT ON COLUMN jambase_events.is_user_created IS 'Flag to indicate if this event was manually created by a user (true) or sourced from JamBase API (false)';

-- Update existing records to have is_user_created = false (they are from API)
UPDATE artist_profile SET is_user_created = FALSE WHERE is_user_created IS NULL;
UPDATE jambase_events SET is_user_created = FALSE WHERE is_user_created IS NULL;

DO $$ 
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'venue_profile') THEN
    UPDATE venue_profile SET is_user_created = FALSE WHERE is_user_created IS NULL;
  END IF;
END $$;

