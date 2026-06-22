-- Add music_streaming_service column to users table
-- This allows users to explicitly specify their preferred streaming service (Spotify or Apple Music)
-- instead of relying on auto-detection from the profile URL/username

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS music_streaming_service TEXT 
CHECK (music_streaming_service IS NULL OR music_streaming_service IN ('spotify', 'apple_music'));

-- Add a comment to document the column
COMMENT ON COLUMN public.users.music_streaming_service IS 'User''s preferred music streaming service: spotify or apple_music. Used to generate the correct profile link.';
