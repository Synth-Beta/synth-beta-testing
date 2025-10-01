-- ============================================================================
-- MANUAL USER INPUT SETUP - SQL TO RUN IN SUPABASE SQL EDITOR
-- ============================================================================
-- This SQL adds support for users to manually create artists, venues, and events
-- when JamBase and Supabase don't have the data they're looking for.
--
-- INSTRUCTIONS:
-- 1. Go to your Supabase Dashboard: https://supabase.com/dashboard
-- 2. Select your project: plusone-event-crew
-- 3. Navigate to SQL Editor (left sidebar)
-- 4. Copy and paste this entire file
-- 5. Click "Run" to execute
-- ============================================================================

-- Add is_user_created column to artists table
ALTER TABLE public.artists 
ADD COLUMN IF NOT EXISTS is_user_created BOOLEAN DEFAULT FALSE;

-- Add bio column to artists table for descriptions
ALTER TABLE public.artists 
ADD COLUMN IF NOT EXISTS bio TEXT;

-- Add genres column to artists table
ALTER TABLE public.artists 
ADD COLUMN IF NOT EXISTS genres TEXT[];

-- Add is_user_created column to venues table
ALTER TABLE public.venues 
ADD COLUMN IF NOT EXISTS is_user_created BOOLEAN DEFAULT FALSE;

-- Add is_user_created column to jambase_events table
ALTER TABLE public.jambase_events 
ADD COLUMN IF NOT EXISTS is_user_created BOOLEAN DEFAULT FALSE;

-- Add indexes for faster filtering of user-created content
CREATE INDEX IF NOT EXISTS idx_artists_user_created 
ON public.artists(is_user_created) 
WHERE is_user_created = TRUE;

CREATE INDEX IF NOT EXISTS idx_venues_user_created 
ON public.venues(is_user_created) 
WHERE is_user_created = TRUE;

CREATE INDEX IF NOT EXISTS idx_jambase_events_user_created 
ON public.jambase_events(is_user_created) 
WHERE is_user_created = TRUE;

-- Add comments to document the purpose
COMMENT ON COLUMN public.artists.is_user_created IS 
'Flag to indicate if this artist was manually created by a user (true) or sourced from JamBase API (false)';

COMMENT ON COLUMN public.artists.bio IS 
'Biography or description of the artist';

COMMENT ON COLUMN public.artists.genres IS 
'Array of genre tags for the artist';

COMMENT ON COLUMN public.venues.is_user_created IS 
'Flag to indicate if this venue was manually created by a user (true) or sourced from JamBase API (false)';

COMMENT ON COLUMN public.jambase_events.is_user_created IS 
'Flag to indicate if this event was manually created by a user (true) or sourced from JamBase API (false)';

-- Update existing records to have is_user_created = false (they are from API)
UPDATE public.artists 
SET is_user_created = FALSE 
WHERE is_user_created IS NULL;

UPDATE public.venues 
SET is_user_created = FALSE 
WHERE is_user_created IS NULL;

UPDATE public.jambase_events 
SET is_user_created = FALSE 
WHERE is_user_created IS NULL;

-- ============================================================================
-- VERIFICATION QUERIES - Run these to confirm the changes
-- ============================================================================

-- Check artists table structure
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'artists' 
  AND column_name IN ('is_user_created', 'bio', 'genres');

-- Check venues table structure
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'venues' 
  AND column_name = 'is_user_created';

-- Check jambase_events table structure  
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jambase_events' 
  AND column_name = 'is_user_created';

-- Check indexes were created
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('artists', 'venues', 'jambase_events')
  AND indexname LIKE '%user_created%';

-- Count existing records (should all be API-sourced, is_user_created = false)
SELECT 
  'artists' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE is_user_created = TRUE) as user_created,
  COUNT(*) FILTER (WHERE is_user_created = FALSE) as api_sourced
FROM public.artists
UNION ALL
SELECT 
  'venues' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE is_user_created = TRUE) as user_created,
  COUNT(*) FILTER (WHERE is_user_created = FALSE) as api_sourced
FROM public.venues
UNION ALL
SELECT 
  'jambase_events' as table_name,
  COUNT(*) as total_records,
  COUNT(*) FILTER (WHERE is_user_created = TRUE) as user_created,
  COUNT(*) FILTER (WHERE is_user_created = FALSE) as api_sourced
FROM public.jambase_events;

-- ============================================================================
-- SUCCESS MESSAGE
-- ============================================================================
-- If all queries ran successfully, your database is now ready to support
-- user-created content! Users can now:
-- 
-- 1. Add artists manually when search returns no results
-- 2. Add venues manually when search returns no results  
-- 3. Add events manually with custom details
--
-- All user-created content will be flagged with is_user_created = TRUE
-- for easy filtering and reporting.
-- ============================================================================
