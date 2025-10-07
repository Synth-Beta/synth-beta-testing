-- Fix profiles table schema to match the application
-- Run this in your Supabase SQL Editor

-- Step 1: Add the missing music_streaming_profile column
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS music_streaming_profile TEXT;

-- Step 2: Remove the old snapchat_handle column
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS snapchat_handle;

-- Step 3: Add helpful comments
COMMENT ON COLUMN public.profiles.music_streaming_profile IS 'URL or handle for music streaming platform (Spotify, Apple Music, etc.)';
COMMENT ON COLUMN public.profiles.instagram_handle IS 'Instagram username without @ symbol';

-- Step 4: Verify the changes
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND table_schema = 'public'
ORDER BY ordinal_position;
