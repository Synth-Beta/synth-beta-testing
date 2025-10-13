-- =====================================================
-- APPLY ONBOARDING MIGRATIONS
-- =====================================================
-- Run this in Supabase SQL Editor to fix the database error
-- This adds the required onboarding fields to the profiles table

-- Step 1: Add onboarding fields to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS onboarding_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS onboarding_skipped BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS tour_completed BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS location_city TEXT;

-- Step 2: Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_profiles_onboarding_completed ON public.profiles(onboarding_completed);
CREATE INDEX IF NOT EXISTS idx_profiles_tour_completed ON public.profiles(tour_completed);
CREATE INDEX IF NOT EXISTS idx_profiles_location_city ON public.profiles(location_city);

-- Step 3: Add helpful comments
COMMENT ON COLUMN public.profiles.onboarding_completed IS 'Whether the user has completed the onboarding flow';
COMMENT ON COLUMN public.profiles.onboarding_skipped IS 'Whether the user skipped the onboarding flow';
COMMENT ON COLUMN public.profiles.tour_completed IS 'Whether the user has completed the app tour';
COMMENT ON COLUMN public.profiles.location_city IS 'User city for local event discovery';

-- Step 4: Create user_music_tags table
CREATE TABLE IF NOT EXISTS public.user_music_tags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tag_type TEXT NOT NULL CHECK (tag_type IN ('genre', 'artist')),
  tag_value TEXT NOT NULL,
  tag_source TEXT NOT NULL DEFAULT 'manual' CHECK (tag_source IN ('manual', 'spotify')),
  weight INTEGER NOT NULL DEFAULT 5 CHECK (weight >= 1 AND weight <= 10),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, tag_type, tag_value)
);

-- Step 5: Create indexes for user_music_tags
CREATE INDEX IF NOT EXISTS idx_user_music_tags_user_id ON public.user_music_tags(user_id);
CREATE INDEX IF NOT EXISTS idx_user_music_tags_tag_type ON public.user_music_tags(tag_type);
CREATE INDEX IF NOT EXISTS idx_user_music_tags_tag_source ON public.user_music_tags(tag_source);
CREATE INDEX IF NOT EXISTS idx_user_music_tags_weight ON public.user_music_tags(weight DESC);

-- Step 6: Enable RLS on user_music_tags
ALTER TABLE public.user_music_tags ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS policies for user_music_tags
DROP POLICY IF EXISTS "Users can view their own music tags" ON public.user_music_tags;
CREATE POLICY "Users can view their own music tags" 
ON public.user_music_tags FOR SELECT 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own music tags" ON public.user_music_tags;
CREATE POLICY "Users can insert their own music tags" 
ON public.user_music_tags FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own music tags" ON public.user_music_tags;
CREATE POLICY "Users can update their own music tags" 
ON public.user_music_tags FOR UPDATE 
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own music tags" ON public.user_music_tags;
CREATE POLICY "Users can delete their own music tags" 
ON public.user_music_tags FOR DELETE 
USING (auth.uid() = user_id);

-- Step 8: Add comments to user_music_tags
COMMENT ON TABLE public.user_music_tags IS 'Stores user music preferences (genres and artists) from manual input or Spotify sync';
COMMENT ON COLUMN public.user_music_tags.tag_type IS 'Type of tag: genre or artist';
COMMENT ON COLUMN public.user_music_tags.tag_value IS 'The actual genre name or artist name';
COMMENT ON COLUMN public.user_music_tags.tag_source IS 'Source of the tag: manual input or Spotify sync';
COMMENT ON COLUMN public.user_music_tags.weight IS 'Importance ranking (1-10), higher weights get priority in recommendations';

-- Step 9: Create update trigger for user_music_tags
CREATE OR REPLACE FUNCTION public.update_user_music_tags_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_user_music_tags_updated_at ON public.user_music_tags;
CREATE TRIGGER trigger_user_music_tags_updated_at
  BEFORE UPDATE ON public.user_music_tags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_user_music_tags_updated_at();

-- Step 10: Create account_upgrade_requests table (or update if exists)
CREATE TABLE IF NOT EXISTS public.account_upgrade_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_account_type TEXT NOT NULL CHECK (requested_account_type IN ('venue', 'artist', 'creator')),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add missing columns if table already exists
ALTER TABLE public.account_upgrade_requests 
ADD COLUMN IF NOT EXISTS admin_notes TEXT,
ADD COLUMN IF NOT EXISTS processed_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS processed_at TIMESTAMPTZ;

-- Step 11: Create indexes for account_upgrade_requests
CREATE INDEX IF NOT EXISTS idx_account_upgrade_requests_user_id ON public.account_upgrade_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_account_upgrade_requests_status ON public.account_upgrade_requests(status);
CREATE INDEX IF NOT EXISTS idx_account_upgrade_requests_created_at ON public.account_upgrade_requests(created_at DESC);

-- Step 12: Enable RLS on account_upgrade_requests
ALTER TABLE public.account_upgrade_requests ENABLE ROW LEVEL SECURITY;

-- Step 13: Create RLS policies for account_upgrade_requests
DROP POLICY IF EXISTS "Users can view their own upgrade requests" ON public.account_upgrade_requests;
CREATE POLICY "Users can view their own upgrade requests"
ON public.account_upgrade_requests FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can create their own upgrade requests" ON public.account_upgrade_requests;
CREATE POLICY "Users can create their own upgrade requests"
ON public.account_upgrade_requests FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins can view all upgrade requests" ON public.account_upgrade_requests;
CREATE POLICY "Admins can view all upgrade requests"
ON public.account_upgrade_requests FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can update upgrade requests" ON public.account_upgrade_requests;
CREATE POLICY "Admins can update upgrade requests"
ON public.account_upgrade_requests FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- Step 14: Add comments to account_upgrade_requests
COMMENT ON TABLE public.account_upgrade_requests IS 'Stores user requests to upgrade their account type (e.g., fan to venue/artist)';
COMMENT ON COLUMN public.account_upgrade_requests.status IS 'Status of the request: pending, approved, or rejected';
COMMENT ON COLUMN public.account_upgrade_requests.admin_notes IS 'Notes from admin when processing the request';

-- Step 15: Create update trigger for account_upgrade_requests
CREATE OR REPLACE FUNCTION public.update_account_upgrade_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_account_upgrade_requests_updated_at ON public.account_upgrade_requests;
CREATE TRIGGER trigger_account_upgrade_requests_updated_at
  BEFORE UPDATE ON public.account_upgrade_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_account_upgrade_requests_updated_at();

-- DONE! Now new users can sign up without errors

