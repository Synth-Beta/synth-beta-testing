-- Add onboarding tracking fields to users table
-- These fields track user progress through the onboarding flow

ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_skipped BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tour_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS location_city TEXT;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_users_onboarding_completed ON public.users(onboarding_completed);
CREATE INDEX IF NOT EXISTS idx_users_tour_completed ON public.users(tour_completed);
CREATE INDEX IF NOT EXISTS idx_users_location_city ON public.users(location_city);

-- Add helpful comments for documentation
COMMENT ON COLUMN public.users.onboarding_completed IS 'Whether the user has completed the onboarding flow';
COMMENT ON COLUMN public.users.onboarding_skipped IS 'Whether the user skipped the onboarding flow';
COMMENT ON COLUMN public.users.tour_completed IS 'Whether the user has completed the app tour';
COMMENT ON COLUMN public.users.location_city IS 'User city for local event discovery';

