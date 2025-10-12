-- Add onboarding tracking fields to profiles table
-- These fields track user progress through the onboarding flow

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_skipped BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tour_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS location_city TEXT;

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed ON public.profiles(onboarding_completed);
CREATE INDEX IF NOT EXISTS idx_profiles_tour_completed ON public.profiles(tour_completed);
CREATE INDEX IF NOT EXISTS idx_profiles_location_city ON public.profiles(location_city);

-- Add helpful comments for documentation
COMMENT ON COLUMN public.profiles.onboarding_completed IS 'Whether the user has completed the onboarding flow';
COMMENT ON COLUMN public.profiles.onboarding_skipped IS 'Whether the user skipped the onboarding flow';
COMMENT ON COLUMN public.profiles.tour_completed IS 'Whether the user has completed the app tour';
COMMENT ON COLUMN public.profiles.location_city IS 'User city for local event discovery';

