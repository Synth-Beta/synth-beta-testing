-- ============================================
-- REFERRAL CODE AND SHARE TRACKING
-- ============================================
-- 1. Add referral_code to users (unique per user for share links)
-- 2. Create referral_shares table to count how many times each user shares
-- App Store link: https://apps.apple.com/us/app/synth-for-live-music-lovers/id6757408095
-- Share URL format: https://apps.apple.com/us/app/synth-for-live-music-lovers/id6757408095?referral=<referral_code>
-- ============================================

BEGIN;

-- Add referral_code to public.users (unique, used in share links)
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS referral_code TEXT;

-- Ensure uniqueness
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_referral_code
  ON public.users (referral_code)
  WHERE referral_code IS NOT NULL;

-- Backfill existing users with a unique short code derived from user_id (deterministic, no collisions)
UPDATE public.users u
SET referral_code = LOWER(SUBSTRING(ENCODE(SHA256(u.user_id::TEXT::BYTEA), 'hex') FROM 1 FOR 10))
WHERE u.referral_code IS NULL;

-- New users: generate on insert. Use a trigger so handle_new_user or insert can set it.
CREATE OR REPLACE FUNCTION public.set_user_referral_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.referral_code IS NULL OR NEW.referral_code = '' THEN
    -- Generate a short unique code (10 alphanumeric)
    NEW.referral_code := LOWER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 10));
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_user_referral_code_trigger ON public.users;
CREATE TRIGGER set_user_referral_code_trigger
  BEFORE INSERT ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_referral_code();

COMMENT ON COLUMN public.users.referral_code IS 'Unique code for referral/share links. Used in App Store URL ?referral= to attribute shares.';

-- Table to record each time a user shares the app (so we can count "how many times they share")
CREATE TABLE IF NOT EXISTS public.referral_shares (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  shared_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  source TEXT, -- e.g. 'banner', 'review_flow', 'profile'
  CONSTRAINT fk_referral_shares_user FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_referral_shares_user_id ON public.referral_shares (user_id);
CREATE INDEX IF NOT EXISTS idx_referral_shares_shared_at ON public.referral_shares (shared_at);

ALTER TABLE public.referral_shares ENABLE ROW LEVEL SECURITY;

-- Authenticated users can insert their own share event
CREATE POLICY referral_shares_insert_own
  ON public.referral_shares
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can read their own share history (optional, for UI)
CREATE POLICY referral_shares_select_own
  ON public.referral_shares
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins/analytics may need to count shares (add service role or admin policy as needed)
COMMENT ON TABLE public.referral_shares IS 'One row per share action (e.g. user tapped Share). Used to see how many times users share the app.';

COMMIT;
