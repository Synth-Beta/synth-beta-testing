-- ============================================
-- Fix Missing RLS Policies
-- ============================================
-- This script enables RLS on tables that are missing it.
-- Run the verify-rls-policies.sql script first to identify which tables need RLS.
--
-- IMPORTANT: Review each table before enabling RLS to ensure proper policies are created.
-- ============================================

-- First, identify tables without RLS
-- Run this query to see which tables need RLS enabled:
SELECT 
  tablename,
  'Missing RLS' as issue
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;

-- ============================================
-- Common tables that might need RLS:
-- ============================================

-- Example: If you have a 'jambase_events' table (read-only reference data)
-- You might want to allow public read access but restrict writes:
/*
ALTER TABLE public.jambase_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view events"
ON public.jambase_events FOR SELECT
USING (true);

CREATE POLICY "Only service role can modify events"
ON public.jambase_events FOR ALL
USING (auth.role() = 'service_role');
*/

-- Example: If you have an 'artists' table (reference data)
/*
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view artists"
ON public.artists FOR SELECT
USING (true);

CREATE POLICY "Only service role can modify artists"
ON public.artists FOR ALL
USING (auth.role() = 'service_role');
*/

-- Example: If you have a 'venues' table (reference data)
/*
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view venues"
ON public.venues FOR SELECT
USING (true);

CREATE POLICY "Only service role can modify venues"
ON public.venues FOR ALL
USING (auth.role() = 'service_role');
*/

-- ============================================
-- IMPORTANT NOTES:
-- ============================================
-- 1. Reference data tables (events, artists, venues) can have public SELECT policies
-- 2. User data tables MUST restrict access to owner or admins
-- 3. System tables (device_tokens, push_notification_queue) should be service_role only
-- 4. Always test policies after creating them
-- 5. Use the verify-rls-policies.sql script to verify changes
-- ============================================

-- After enabling RLS, verify with:
-- SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true;




