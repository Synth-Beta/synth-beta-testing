-- Add attendees and met_on_synth columns to user_reviews table
-- This enables users to tag friends who attended concerts with them

-- Add attendees column (JSONB array storing both app users and phone invitations)
ALTER TABLE public.user_reviews 
ADD COLUMN IF NOT EXISTS attendees JSONB DEFAULT '[]'::jsonb;

-- Add met_on_synth column (track if users met/planned on Synth for admin analytics)
ALTER TABLE public.user_reviews 
ADD COLUMN IF NOT EXISTS met_on_synth BOOLEAN DEFAULT false;

-- Add index for querying reviews by attendees (useful for analytics and "attended with" features)
CREATE INDEX IF NOT EXISTS idx_user_reviews_attendees 
ON public.user_reviews USING GIN (attendees);

-- Add comment to document the column structure
COMMENT ON COLUMN public.user_reviews.attendees IS 
'Array of people who attended the concert. Format: [{"type":"user","user_id":"uuid","name":"Name","avatar_url":"..."},{"type":"phone","phone":"+1234567890","name":"Optional Name"}]';

COMMENT ON COLUMN public.user_reviews.met_on_synth IS 
'Indicates if the attendees met or planned this event through Synth. Used for admin analytics and tracking platform engagement.';
