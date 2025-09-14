-- Fix profiles table schema to match current application needs
-- Add music_streaming_profile field
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS music_streaming_profile TEXT;

-- Remove snapchat_handle field (if it exists)
ALTER TABLE public.profiles 
DROP COLUMN IF EXISTS snapchat_handle;

-- Add comments for documentation
COMMENT ON COLUMN public.profiles.music_streaming_profile IS 'URL or handle for music streaming platform (Spotify, Apple Music, etc.)';

-- Ensure the instagram_handle field exists (should already exist from previous migration)
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS instagram_handle TEXT;

COMMENT ON COLUMN public.profiles.instagram_handle IS 'Instagram username without @ symbol';
