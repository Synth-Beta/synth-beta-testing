-- Fix interested events visibility and artist_profile table issues
-- This migration addresses two main problems:
-- 1. RLS policies are too restrictive for user_jambase_events
-- 2. artist_profile table schema cache issue

-- First, fix the RLS policies for user_jambase_events
-- The current policy only allows users to see their own events
-- We need to allow users to see other users' interested events for the app to work

-- Drop the existing restrictive policy
DROP POLICY IF EXISTS "Users can view their own JamBase event associations" ON user_jambase_events;

-- Create a new policy that allows authenticated users to see all interested events
-- This is necessary for the app's core functionality (seeing who's interested in events)
CREATE POLICY "Authenticated users can view all JamBase event associations" 
ON user_jambase_events 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Keep the existing INSERT, UPDATE, DELETE policies for user's own events
-- These should remain restrictive for security

-- Ensure artist_profile table is properly accessible
-- Refresh the schema cache by recreating the table's permissions
ALTER TABLE public.artist_profile ENABLE ROW LEVEL SECURITY;

-- Drop and recreate the RLS policies for artist_profile to refresh schema cache
DROP POLICY IF EXISTS "Artist profiles are viewable by everyone" ON public.artist_profile;
DROP POLICY IF EXISTS "Authenticated users can create artist profiles" ON public.artist_profile;
DROP POLICY IF EXISTS "Authenticated users can update artist profiles" ON public.artist_profile;
DROP POLICY IF EXISTS "Authenticated users can delete artist profiles" ON public.artist_profile;

-- Recreate the policies
CREATE POLICY "Artist profiles are viewable by everyone" 
ON public.artist_profile 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create artist profiles" 
ON public.artist_profile 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can update artist profiles" 
ON public.artist_profile 
FOR UPDATE 
USING (auth.role() = 'authenticated');

CREATE POLICY "Authenticated users can delete artist profiles" 
ON public.artist_profile 
FOR DELETE 
USING (auth.role() = 'authenticated');

-- Grant explicit permissions to ensure the table is accessible
GRANT SELECT ON public.artist_profile TO authenticated;
GRANT SELECT ON public.artist_profile TO anon;
GRANT INSERT, UPDATE, DELETE ON public.artist_profile TO authenticated;

-- Also ensure user_jambase_events has proper permissions
GRANT SELECT ON public.user_jambase_events TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.user_jambase_events TO authenticated;
