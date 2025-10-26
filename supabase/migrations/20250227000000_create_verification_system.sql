-- ============================================
-- VERIFICATION SYSTEM
-- ============================================
-- This migration adds verification system fields and auto-verification logic
-- Uses existing infrastructure (no new tables)

-- Step 1: Add verification tracking columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS verification_criteria_met JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS verified_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Step 2: Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_profiles_trust_score ON public.profiles(trust_score);
CREATE INDEX IF NOT EXISTS idx_profiles_verified_at ON public.profiles(verified_at);
CREATE INDEX IF NOT EXISTS idx_profiles_verified_by ON public.profiles(verified_by);

-- Step 3: Add comments for documentation
COMMENT ON COLUMN public.profiles.verification_criteria_met IS 'JSONB tracking which trust criteria have been met for user verification';
COMMENT ON COLUMN public.profiles.trust_score IS 'Trust score from 0-100 based on user activity and engagement';
COMMENT ON COLUMN public.profiles.verified_at IS 'Timestamp when the user was verified';
COMMENT ON COLUMN public.profiles.verified_by IS 'User ID of admin who manually verified (NULL for auto-verification)';

-- Step 4: Create function to auto-verify creator and business accounts
CREATE OR REPLACE FUNCTION public.auto_verify_creator_business_accounts()
RETURNS TRIGGER AS $$
DECLARE
  has_artist_profile BOOLEAN;
  has_venue_profile BOOLEAN;
  has_business_info BOOLEAN;
BEGIN
  -- Only process creator and business accounts
  IF NEW.account_type NOT IN ('creator', 'business') THEN
    RETURN NEW;
  END IF;

  -- Check for creator verification (has artist follows or claimed artist)
  IF NEW.account_type = 'creator' THEN
    -- Check if user follows any artists (indicator of artist account)
    SELECT EXISTS (
      SELECT 1 FROM public.artist_follows
      WHERE user_id = NEW.user_id
      LIMIT 1
    ) INTO has_artist_profile;

    -- Auto-verify creators who have engaged with artist features
    IF has_artist_profile THEN
      NEW.verified := true;
      NEW.verification_level := 'identity';
      IF NEW.verified_at IS NULL THEN
        NEW.verified_at := NOW();
      END IF;
    END IF;
  END IF;

  -- Check for business verification (has venue follows or business info)
  IF NEW.account_type = 'business' THEN
    -- Check if user follows any venues
    SELECT EXISTS (
      SELECT 1 FROM public.venue_follows
      WHERE user_id = NEW.user_id
      LIMIT 1
    ) INTO has_venue_profile;

    -- Check if business_info is populated
    has_business_info := (NEW.business_info IS NOT NULL AND NEW.business_info != '{}');

    -- Auto-verify business accounts with venue follows or business info
    IF has_venue_profile OR has_business_info THEN
      NEW.verified := true;
      NEW.verification_level := 'business';
      IF NEW.verified_at IS NULL THEN
        NEW.verified_at := NOW();
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 5: Create trigger for auto-verification
DROP TRIGGER IF EXISTS trigger_auto_verify_creator_business ON public.profiles;
CREATE TRIGGER trigger_auto_verify_creator_business
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_verify_creator_business_accounts();

-- Step 6: Create function to calculate and update user trust scores
CREATE OR REPLACE FUNCTION public.calculate_user_trust_score(p_user_id UUID)
RETURNS INTEGER AS $$
DECLARE
  v_score INTEGER := 0;
  v_criteria JSONB := '{}';
  v_review_count INTEGER;
  v_friend_count INTEGER;
  v_event_count INTEGER;
  v_attended_count INTEGER;
  v_account_age_days INTEGER;
  v_profile RECORD;
BEGIN
  -- Get profile data
  SELECT * INTO v_profile
  FROM public.profiles
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Only calculate for user accounts
  IF v_profile.account_type != 'user' THEN
    RETURN 100;
  END IF;

  -- Calculate account age in days
  v_account_age_days := EXTRACT(DAY FROM (NOW() - v_profile.created_at));

  -- Count reviews
  SELECT COUNT(*) INTO v_review_count
  FROM public.user_reviews
  WHERE user_id = p_user_id;

  -- Count friends
  SELECT COUNT(*) INTO v_friend_count
  FROM public.friends
  WHERE (user1_id = p_user_id OR user2_id = p_user_id);

  -- Count event interests
  SELECT COUNT(*) INTO v_event_count
  FROM public.user_jambase_events
  WHERE user_id = p_user_id;

  -- Count attended events (reviews where user actually attended)
  SELECT COUNT(*) INTO v_attended_count
  FROM public.user_reviews
  WHERE user_id = p_user_id
  AND was_there = true;

  -- Build criteria object and calculate score
  -- Each criterion is worth 12.5 points (100 / 8 criteria)
  
  -- Criterion 1: Profile complete (name, bio, avatar, birthday, gender)
  IF v_profile.name IS NOT NULL 
     AND v_profile.bio IS NOT NULL 
     AND v_profile.avatar_url IS NOT NULL 
     AND v_profile.birthday IS NOT NULL 
     AND v_profile.gender IS NOT NULL THEN
    v_criteria := jsonb_set(v_criteria, '{profileComplete}', 'true');
    v_score := v_score + 13;
  ELSE
    v_criteria := jsonb_set(v_criteria, '{profileComplete}', 'false');
  END IF;

  -- Criterion 2: Streaming connected
  IF v_profile.music_streaming_profile IS NOT NULL THEN
    v_criteria := jsonb_set(v_criteria, '{streamingConnected}', 'true');
    v_score := v_score + 13;
  ELSE
    v_criteria := jsonb_set(v_criteria, '{streamingConnected}', 'false');
  END IF;

  -- Criterion 3: Has reviews (3+)
  IF v_review_count >= 3 THEN
    v_criteria := jsonb_set(v_criteria, '{hasReviews}', 'true');
    v_score := v_score + 12;
  ELSE
    v_criteria := jsonb_set(v_criteria, '{hasReviews}', 'false');
  END IF;

  -- Criterion 4: Has friends (10+)
  IF v_friend_count >= 10 THEN
    v_criteria := jsonb_set(v_criteria, '{hasFriends}', 'true');
    v_score := v_score + 12;
  ELSE
    v_criteria := jsonb_set(v_criteria, '{hasFriends}', 'false');
  END IF;

  -- Criterion 5: Has events (10+)
  IF v_event_count >= 10 THEN
    v_criteria := jsonb_set(v_criteria, '{hasEvents}', 'true');
    v_score := v_score + 13;
  ELSE
    v_criteria := jsonb_set(v_criteria, '{hasEvents}', 'false');
  END IF;

  -- Criterion 6: Account age (30+ days)
  IF v_account_age_days >= 30 THEN
    v_criteria := jsonb_set(v_criteria, '{accountAge}', 'true');
    v_score := v_score + 12;
  ELSE
    v_criteria := jsonb_set(v_criteria, '{accountAge}', 'false');
  END IF;

  -- Criterion 7: Email verified (assumed true)
  v_criteria := jsonb_set(v_criteria, '{emailVerified}', 'true');
  v_score := v_score + 13;

  -- Criterion 8: Has attended events (3+)
  IF v_attended_count >= 3 THEN
    v_criteria := jsonb_set(v_criteria, '{hasAttended}', 'true');
    v_score := v_score + 12;
  ELSE
    v_criteria := jsonb_set(v_criteria, '{hasAttended}', 'false');
  END IF;

  -- Update profile with trust score and criteria
  UPDATE public.profiles
  SET 
    trust_score = v_score,
    verification_criteria_met = v_criteria
  WHERE user_id = p_user_id;

  RETURN v_score;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create function to auto-verify users based on trust score
CREATE OR REPLACE FUNCTION public.auto_verify_user_by_trust_score()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process user accounts
  IF NEW.account_type != 'user' THEN
    RETURN NEW;
  END IF;

  -- Calculate trust score if not manually verified
  IF NEW.verified_by IS NULL THEN
    -- Count criteria met from JSONB
    DECLARE
      v_criteria_count INTEGER := 0;
    BEGIN
      -- Count true values in verification_criteria_met
      IF NEW.verification_criteria_met->>'profileComplete' = 'true' THEN v_criteria_count := v_criteria_count + 1; END IF;
      IF NEW.verification_criteria_met->>'streamingConnected' = 'true' THEN v_criteria_count := v_criteria_count + 1; END IF;
      IF NEW.verification_criteria_met->>'hasReviews' = 'true' THEN v_criteria_count := v_criteria_count + 1; END IF;
      IF NEW.verification_criteria_met->>'hasFriends' = 'true' THEN v_criteria_count := v_criteria_count + 1; END IF;
      IF NEW.verification_criteria_met->>'hasEvents' = 'true' THEN v_criteria_count := v_criteria_count + 1; END IF;
      IF NEW.verification_criteria_met->>'accountAge' = 'true' THEN v_criteria_count := v_criteria_count + 1; END IF;
      IF NEW.verification_criteria_met->>'emailVerified' = 'true' THEN v_criteria_count := v_criteria_count + 1; END IF;
      IF NEW.verification_criteria_met->>'hasAttended' = 'true' THEN v_criteria_count := v_criteria_count + 1; END IF;

      -- Auto-verify if 4+ criteria met
      IF v_criteria_count >= 4 THEN
        NEW.verified := true;
        IF NEW.verified_at IS NULL THEN
          NEW.verified_at := NOW();
        END IF;
      ELSE
        -- Remove verification if criteria no longer met
        IF NEW.verified AND NEW.verified_by IS NULL THEN
          NEW.verified := false;
          NEW.verified_at := NULL;
        END IF;
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Create trigger for user trust score verification
DROP TRIGGER IF EXISTS trigger_auto_verify_user_trust_score ON public.profiles;
CREATE TRIGGER trigger_auto_verify_user_trust_score
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_verify_user_by_trust_score();

-- Step 9: Create function for admins to manually verify users
CREATE OR REPLACE FUNCTION public.admin_verify_user(
  p_target_user_id UUID,
  p_verified BOOLEAN
)
RETURNS VOID AS $$
DECLARE
  v_admin_user_id UUID;
BEGIN
  -- Get the current user ID
  v_admin_user_id := auth.uid();

  -- Check if the current user is an admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = v_admin_user_id
    AND account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can manually verify users';
  END IF;

  -- Update the target user's verification status
  UPDATE public.profiles
  SET 
    verified = p_verified,
    verified_by = CASE WHEN p_verified THEN v_admin_user_id ELSE NULL END,
    verified_at = CASE WHEN p_verified THEN NOW() ELSE NULL END
  WHERE user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.calculate_user_trust_score(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_verify_user(UUID, BOOLEAN) TO authenticated;

-- Step 10: Backfill trust scores for existing users (run once)
-- This will calculate initial trust scores for all existing user accounts
DO $$
DECLARE
  v_user RECORD;
BEGIN
  FOR v_user IN SELECT user_id FROM public.profiles WHERE account_type = 'user' LOOP
    PERFORM public.calculate_user_trust_score(v_user.user_id);
  END LOOP;
END $$;

-- Step 11: Auto-verify admin accounts
UPDATE public.profiles
SET 
  verified = true,
  verification_level = 'identity',
  verified_at = NOW()
WHERE account_type = 'admin'
AND verified = false;

-- Step 12: Add comment on verification system
COMMENT ON FUNCTION public.auto_verify_creator_business_accounts IS 'Automatically verifies creator and business accounts based on profile setup';
COMMENT ON FUNCTION public.calculate_user_trust_score IS 'Calculates trust score for user accounts based on activity criteria';
COMMENT ON FUNCTION public.auto_verify_user_by_trust_score IS 'Automatically verifies users who meet 4+ trust criteria';
COMMENT ON FUNCTION public.admin_verify_user IS 'Allows admins to manually verify or unverify users';

