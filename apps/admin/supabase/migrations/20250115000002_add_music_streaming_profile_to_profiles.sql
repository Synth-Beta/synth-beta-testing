-- Add music streaming profile field to profiles table
ALTER TABLE profiles 
ADD COLUMN music_streaming_profile TEXT;

-- Add comment to document the field
COMMENT ON COLUMN profiles.music_streaming_profile IS 'URL or handle for music streaming platform (Spotify, Apple Music, etc.)';
