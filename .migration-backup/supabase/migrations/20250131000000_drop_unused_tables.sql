-- ============================================
-- DROP UNUSED TABLES: events and artist_profile
-- ============================================
-- These tables were created but are not used in the application

-- Drop events table (if it exists)
DROP TABLE IF EXISTS public.events CASCADE;

-- Drop artist_profile table (if it exists)
DROP TABLE IF EXISTS public.artist_profile CASCADE;

-- Verification queries (run these in Supabase SQL Editor to confirm tables were dropped)
-- SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name IN ('events', 'artist_profile');

