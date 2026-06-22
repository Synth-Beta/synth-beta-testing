-- Add custom_setlist column to reviews table (nullable)
-- Stores user-created setlists; setlist column stores API-verified setlist.fm data

ALTER TABLE public.reviews
ADD COLUMN IF NOT EXISTS custom_setlist JSONB NULL;

COMMENT ON COLUMN public.reviews.custom_setlist IS 'User-created custom setlists (nullable). API-verified setlists are stored in setlist column.';
