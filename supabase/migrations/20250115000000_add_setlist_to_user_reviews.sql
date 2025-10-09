-- Add setlist support to user_reviews table
-- This allows users to attach setlist data to their reviews

-- Add setlist column to store the selected setlist data
ALTER TABLE public.user_reviews 
ADD COLUMN IF NOT EXISTS setlist JSONB;

-- Add comment to document the setlist field
COMMENT ON COLUMN public.user_reviews.setlist IS 'Selected setlist data from Setlist.fm API, stored as JSONB for flexibility';

-- Create index for setlist queries (if needed for performance)
CREATE INDEX IF NOT EXISTS idx_user_reviews_setlist ON public.user_reviews USING GIN (setlist);

-- Update the updated_at trigger to include setlist changes
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Ensure the trigger exists for user_reviews
DROP TRIGGER IF EXISTS update_user_reviews_updated_at ON public.user_reviews;
CREATE TRIGGER update_user_reviews_updated_at
    BEFORE UPDATE ON public.user_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
