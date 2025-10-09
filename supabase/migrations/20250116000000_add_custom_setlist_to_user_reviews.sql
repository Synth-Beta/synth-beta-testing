-- Add custom_setlist column to user_reviews table
-- This allows users to manually input their own setlist for a review
-- Stored separately from API-verified setlists (the 'setlist' column)

-- Add custom_setlist column to store user-created setlist data
ALTER TABLE public.user_reviews 
ADD COLUMN IF NOT EXISTS custom_setlist JSONB;

-- Add comment to document the custom_setlist field
COMMENT ON COLUMN public.user_reviews.custom_setlist IS 'User-created custom setlist data for personal review notes. Stored as array of objects with song_name, cover_artist (optional), notes (optional), and position. This is separate from verified API setlists.';

-- Create index for custom_setlist queries (if needed for performance)
CREATE INDEX IF NOT EXISTS idx_user_reviews_custom_setlist ON public.user_reviews USING GIN (custom_setlist);

-- Example structure for custom_setlist:
-- [
--   {
--     "song_name": "Song Title",
--     "cover_artist": "Original Artist Name (optional)",
--     "notes": "Special notes about this song (optional)",
--     "position": 1
--   },
--   ...
-- ]
