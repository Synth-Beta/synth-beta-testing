-- ============================================
-- SPLIT USERS TABLE: Extract Verification and Subscription
-- ============================================
-- This migration splits the users table by extracting verification and subscription
-- data into separate tables (user_verifications, user_subscriptions).
--
-- PRINCIPLE: Domain separation - verification and subscription have different
-- lifecycles and are managed by different subsystems.
--
-- This maintains 3NF while improving maintainability and clarity.
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: CREATE user_verifications TABLE
-- ============================================
-- Extract verification-related fields from users table

CREATE TABLE IF NOT EXISTS public.user_verifications (
  user_id UUID PRIMARY KEY,
  
  -- Verification status
  verified BOOLEAN NOT NULL DEFAULT false,
  verification_level verification_level NOT NULL DEFAULT 'none',
  
  -- Verification metadata
  verified_at TIMESTAMPTZ,
  verified_by UUID,
  trust_score NUMERIC,
  verification_criteria_met JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT user_verifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE,
  CONSTRAINT user_verifications_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES public.users(user_id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_verifications_verified ON public.user_verifications(verified);
CREATE INDEX IF NOT EXISTS idx_user_verifications_verification_level ON public.user_verifications(verification_level);
CREATE INDEX IF NOT EXISTS idx_user_verifications_trust_score ON public.user_verifications(trust_score) WHERE trust_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_verifications_verified_by ON public.user_verifications(verified_by) WHERE verified_by IS NOT NULL;

-- Enable RLS
ALTER TABLE public.user_verifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own verification"
ON public.user_verifications FOR SELECT
USING (auth.uid() = user_id OR EXISTS (
  SELECT 1 FROM public.users
  WHERE user_id = auth.uid()
  AND account_type = 'admin'
));

CREATE POLICY "Admins can manage all verifications"
ON public.user_verifications FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.users
  WHERE user_id = auth.uid()
  AND account_type = 'admin'
));

-- Add comment
COMMENT ON TABLE public.user_verifications IS 
'User verification data. Extracted from users table for domain separation. 1-1 relationship with users table.';

-- ============================================
-- STEP 2: CREATE user_subscriptions TABLE
-- ============================================
-- Extract subscription-related fields from users table

CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id UUID PRIMARY KEY,
  
  -- Subscription status
  subscription_tier subscription_tier NOT NULL DEFAULT 'free',
  status TEXT CHECK (status IN ('active', 'past_due', 'cancelled', 'expired', 'trialing')) DEFAULT 'active',
  
  -- Subscription dates
  subscription_started_at TIMESTAMPTZ,
  subscription_expires_at TIMESTAMPTZ,
  
  -- Stripe integration
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  
  -- Metadata
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(user_id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_tier ON public.user_subscriptions(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON public.user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires_at ON public.user_subscriptions(subscription_expires_at) WHERE subscription_expires_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_customer ON public.user_subscriptions(stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_stripe_subscription ON public.user_subscriptions(stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own subscription"
ON public.user_subscriptions FOR SELECT
USING (auth.uid() = user_id OR EXISTS (
  SELECT 1 FROM public.users
  WHERE user_id = auth.uid()
  AND account_type IN ('admin', 'business')
));

CREATE POLICY "Users can update their own subscription"
ON public.user_subscriptions FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Admins and business accounts can manage subscriptions"
ON public.user_subscriptions FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.users
  WHERE user_id = auth.uid()
  AND account_type IN ('admin', 'business')
));

-- Add comment
COMMENT ON TABLE public.user_subscriptions IS 
'User subscription data. Extracted from users table for domain separation. 1-1 relationship with users table.';

-- ============================================
-- STEP 3: MIGRATE DATA FROM users TABLE
-- ============================================
-- Copy verification data from users to user_verifications
-- Note: Uses information_schema to check if columns exist first

DO $$
DECLARE
  sql_text TEXT;
BEGIN
  -- Build SQL dynamically based on which columns exist
  sql_text := '
    INSERT INTO public.user_verifications (
      user_id,
      verified,
      verification_level,
      verified_at,
      verified_by,
      trust_score,
      verification_criteria_met,
      created_at,
      updated_at
    )
    SELECT
      u.user_id,
      ' || CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'verified')
        THEN 'COALESCE(u.verified, false)'
        ELSE 'false'
      END || ' AS verified,
      ' || CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'verification_level')
        THEN 'COALESCE(u.verification_level, ''none''::verification_level)'
        ELSE '''none''::verification_level'
      END || ' AS verification_level,
      ' || CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'verified_at')
        THEN 'u.verified_at'
        ELSE 'NULL'
      END || ' AS verified_at,
      ' || CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'verified_by')
        THEN 'u.verified_by'
        ELSE 'NULL'
      END || ' AS verified_by,
      ' || CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'trust_score')
        THEN 'u.trust_score'
        ELSE 'NULL'
      END || ' AS trust_score,
      ' || CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'verification_criteria_met')
        THEN 'COALESCE(u.verification_criteria_met, ''{}''::jsonb)'
        ELSE '''{}''::jsonb'
      END || ' AS verification_criteria_met,
      u.created_at,
      COALESCE(u.updated_at, u.created_at) AS updated_at
    FROM public.users u
    ON CONFLICT (user_id) DO UPDATE SET
      verified = EXCLUDED.verified,
      verification_level = EXCLUDED.verification_level,
      verified_at = EXCLUDED.verified_at,
      verified_by = EXCLUDED.verified_by,
      trust_score = EXCLUDED.trust_score,
      verification_criteria_met = EXCLUDED.verification_criteria_met,
      updated_at = EXCLUDED.updated_at';
  
  EXECUTE sql_text;
  RAISE NOTICE '✅ Migrated verification data from users to user_verifications';
END $$;

-- Copy subscription data from users to user_subscriptions
-- Note: Uses information_schema to check if columns exist first

DO $$
DECLARE
  sql_text TEXT;
  expires_col_ref TEXT;
BEGIN
  -- Determine the column reference for subscription_expires_at (used twice in CASE)
  SELECT INTO expires_col_ref
    CASE 
      WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'subscription_expires_at')
      THEN 'u.subscription_expires_at'
      ELSE 'NULL'
    END;
  
  -- Build SQL dynamically based on which columns exist
  sql_text := '
    INSERT INTO public.user_subscriptions (
      user_id,
      subscription_tier,
      subscription_started_at,
      subscription_expires_at,
      stripe_customer_id,
      stripe_subscription_id,
      status,
      created_at,
      updated_at
    )
    SELECT
      u.user_id,
      ' || CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'subscription_tier')
        THEN 'COALESCE(u.subscription_tier, ''free''::subscription_tier)'
        ELSE '''free''::subscription_tier'
      END || ' AS subscription_tier,
      ' || CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'subscription_started_at')
        THEN 'u.subscription_started_at'
        ELSE 'NULL'
      END || ' AS subscription_started_at,
      ' || expires_col_ref || ' AS subscription_expires_at,
      ' || CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'stripe_customer_id')
        THEN 'u.stripe_customer_id'
        ELSE 'NULL'
      END || ' AS stripe_customer_id,
      ' || CASE 
        WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'stripe_subscription_id')
        THEN 'u.stripe_subscription_id'
        ELSE 'NULL'
      END || ' AS stripe_subscription_id,
      CASE
        WHEN ' || expires_col_ref || ' IS NULL THEN ''active''
        WHEN ' || expires_col_ref || ' > now() THEN ''active''
        ELSE ''expired''
      END AS status,
      u.created_at,
      COALESCE(u.updated_at, u.created_at) AS updated_at
    FROM public.users u
    ON CONFLICT (user_id) DO UPDATE SET
      subscription_tier = EXCLUDED.subscription_tier,
      subscription_started_at = EXCLUDED.subscription_started_at,
      subscription_expires_at = EXCLUDED.subscription_expires_at,
      stripe_customer_id = EXCLUDED.stripe_customer_id,
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      status = EXCLUDED.status,
      updated_at = EXCLUDED.updated_at';
  
  EXECUTE sql_text;
  RAISE NOTICE '✅ Migrated subscription data from users to user_subscriptions';
END $$;

-- ============================================
-- STEP 4: CREATE TRIGGER FUNCTIONS
-- ============================================
-- Function to update updated_at timestamp

CREATE OR REPLACE FUNCTION update_user_verifications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION update_user_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
DROP TRIGGER IF EXISTS trigger_update_user_verifications_updated_at ON public.user_verifications;
CREATE TRIGGER trigger_update_user_verifications_updated_at
  BEFORE UPDATE ON public.user_verifications
  FOR EACH ROW
  EXECUTE FUNCTION update_user_verifications_updated_at();

DROP TRIGGER IF EXISTS trigger_update_user_subscriptions_updated_at ON public.user_subscriptions;
CREATE TRIGGER trigger_update_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_subscriptions_updated_at();

-- ============================================
-- STEP 5: UPDATE DEPENDENT VIEWS
-- ============================================
-- Update views that reference verification/subscription columns from users table

-- Update reviews_with_connection_degree view to use user_verifications table
DROP VIEW IF EXISTS public.reviews_with_connection_degree CASCADE;

CREATE VIEW public.reviews_with_connection_degree AS
SELECT 
  ur.id as review_id,
  ur.user_id as reviewer_id,
  ur.event_id,
  ur.rating::numeric AS rating,
  ur.review_text::TEXT as review_text,
  ur.review_text::TEXT AS content,
  ur.is_public,
  ur.is_draft,
  ur.photos::TEXT[] as photos,
  je.setlist AS setlist,
  ur.likes_count,
  ur.comments_count,
  ur.shares_count,
  ur.created_at,
  ur.updated_at,
  -- Profile information (from users table)
  p.name::TEXT as reviewer_name,
  p.avatar_url::TEXT as reviewer_avatar,
  -- Verification information (from user_verifications table)
  COALESCE(uv.verified, false) as reviewer_verified,
  p.account_type::TEXT as reviewer_account_type,
  -- Event information
  je.title::TEXT as event_title,
  a.name::TEXT as artist_name,
  v.name::TEXT as venue_name,
  je.event_date,
  je.venue_city::TEXT as venue_city,
  je.venue_state::TEXT as venue_state,
  COALESCE(eei_artist.external_id, je.artist_id::TEXT) AS artist_id,
  je.artist_id AS artist_uuid,
  COALESCE(eei_venue.external_id, je.venue_id::TEXT) AS venue_id,
  je.venue_id AS venue_uuid,
  -- Connection degree (using existing function)
  COALESCE(
    public.get_connection_degree(auth.uid(), ur.user_id),
    999
  ) as connection_degree,
  -- Connection type label
  (SELECT label::TEXT FROM public.get_connection_info(auth.uid(), ur.user_id) LIMIT 1) as connection_type_label,
  -- Connection color for UI styling
  (SELECT color::TEXT FROM public.get_connection_info(auth.uid(), ur.user_id) LIMIT 1) as connection_color
FROM public.reviews ur
JOIN public.users p ON ur.user_id = p.user_id
LEFT JOIN public.user_verifications uv ON ur.user_id = uv.user_id
JOIN public.events je ON ur.event_id = je.id
LEFT JOIN public.artists a ON je.artist_id = a.id
LEFT JOIN public.venues v ON je.venue_id = v.id
LEFT JOIN public.external_entity_ids eei_artist ON eei_artist.entity_type = 'artist' 
  AND eei_artist.entity_uuid = je.artist_id 
  AND eei_artist.source = 'jambase'
LEFT JOIN public.external_entity_ids eei_venue ON eei_venue.entity_type = 'venue' 
  AND eei_venue.entity_uuid = je.venue_id 
  AND eei_venue.source = 'jambase'
WHERE ur.is_public = true 
  AND ur.is_draft = false
  AND ur.review_text != 'ATTENDANCE_ONLY'
  AND ur.review_text IS NOT NULL
  AND ur.review_text != ''
  AND ur.user_id != auth.uid()
  -- Filter by connection degree
  AND (
    public.get_connection_degree(auth.uid(), ur.user_id) IN (1, 2)
    OR (
      public.get_connection_degree(auth.uid(), ur.user_id) = 3 
      AND public.is_event_relevant_to_user(
        auth.uid(), 
        COALESCE(eei_artist.external_id, je.artist_id::TEXT),
        COALESCE(eei_venue.external_id, je.venue_id::TEXT),
        v.name::TEXT,
        je.venue_city,
        je.venue_state
      )
    )
    OR (
      public.get_connection_degree(auth.uid(), ur.user_id) NOT IN (1, 2, 3)
      AND ur.created_at = ur.updated_at
      AND ur.created_at >= (NOW() - INTERVAL '30 days')
    )
  );

GRANT SELECT ON public.reviews_with_connection_degree TO authenticated;

COMMENT ON VIEW public.reviews_with_connection_degree IS 
'Reviews from 1st, 2nd, and relevant 3rd degree connections. Updated to use user_verifications table for verification data.';

-- ============================================
-- STEP 6: DROP COLUMNS FROM users TABLE
-- ============================================
-- Remove verification and subscription columns from users table
-- Note: We drop them after updating dependent views

DO $$
BEGIN
  -- Drop verification columns
  ALTER TABLE public.users 
    DROP COLUMN IF EXISTS verified,
    DROP COLUMN IF EXISTS verification_level,
    DROP COLUMN IF EXISTS trust_score,
    DROP COLUMN IF EXISTS verification_criteria_met,
    DROP COLUMN IF EXISTS verified_at,
    DROP COLUMN IF EXISTS verified_by;
  
  -- Drop subscription columns
  ALTER TABLE public.users 
    DROP COLUMN IF EXISTS subscription_tier,
    DROP COLUMN IF EXISTS subscription_started_at,
    DROP COLUMN IF EXISTS subscription_expires_at,
    DROP COLUMN IF EXISTS stripe_customer_id,
    DROP COLUMN IF EXISTS stripe_subscription_id;
  
  RAISE NOTICE '✅ Dropped verification and subscription columns from users table';
END $$;

-- Drop indexes that are no longer needed
DROP INDEX IF EXISTS public.idx_users_verified;
DROP INDEX IF EXISTS public.idx_users_verification_level;
DROP INDEX IF EXISTS public.idx_users_subscription_tier;
DROP INDEX IF EXISTS public.idx_users_subscription_expires;

-- ============================================
-- STEP 7: UPDATE RPC FUNCTIONS
-- ============================================
-- Update functions that query users table to use compatibility views or JOINs

-- Update get_all_profiles_for_analytics function to include subscription_tier
DROP FUNCTION IF EXISTS public.get_all_profiles_for_analytics() CASCADE;

CREATE OR REPLACE FUNCTION public.get_all_profiles_for_analytics()
RETURNS TABLE (
  user_id uuid,
  name text,
  avatar_url text,
  account_type text,
  business_info jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  last_active_at timestamptz,
  is_public_profile boolean,
  subscription_tier text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- This function runs with elevated privileges to access all profiles
  -- Uses users_complete view to get subscription data
  RETURN QUERY
  SELECT 
    u.user_id,
    u.name,
    u.avatar_url,
    u.account_type::text,
    u.business_info,
    u.created_at,
    u.updated_at,
    u.last_active_at,
    u.is_public_profile,
    COALESCE(us.subscription_tier::text, 'free') AS subscription_tier
  FROM public.users u
  LEFT JOIN public.user_subscriptions us ON u.user_id = us.user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_profiles_for_analytics() TO authenticated;

COMMENT ON FUNCTION public.get_all_profiles_for_analytics() IS 
'Function to get all profiles for analytics purposes with elevated privileges. Updated to JOIN with user_subscriptions table.';

-- ============================================
-- STEP 8: CREATE COMPATIBILITY VIEWS (OPTIONAL)
-- ============================================
-- Create views that JOIN users with verifications and subscriptions
-- This allows gradual migration of code that expects these fields on users

-- View: users_with_verification
CREATE OR REPLACE VIEW public.users_with_verification AS
SELECT
  u.*,
  uv.verified,
  uv.verification_level,
  uv.verified_at,
  uv.verified_by,
  uv.trust_score,
  uv.verification_criteria_met
FROM public.users u
LEFT JOIN public.user_verifications uv ON u.user_id = uv.user_id;

COMMENT ON VIEW public.users_with_verification IS 
'Compatibility view: users table with verification data joined. Use for gradual migration. Prefer direct JOINs in new code.';

-- View: users_with_subscription
CREATE OR REPLACE VIEW public.users_with_subscription AS
SELECT
  u.*,
  us.subscription_tier,
  us.subscription_started_at,
  us.subscription_expires_at,
  us.stripe_customer_id,
  us.stripe_subscription_id,
  us.status AS subscription_status
FROM public.users u
LEFT JOIN public.user_subscriptions us ON u.user_id = us.user_id;

COMMENT ON VIEW public.users_with_subscription IS 
'Compatibility view: users table with subscription data joined. Use for gradual migration. Prefer direct JOINs in new code.';

-- View: users_complete (all data)
CREATE OR REPLACE VIEW public.users_complete AS
SELECT
  u.*,
  uv.verified,
  uv.verification_level,
  uv.verified_at,
  uv.verified_by,
  uv.trust_score,
  uv.verification_criteria_met,
  us.subscription_tier,
  us.subscription_started_at,
  us.subscription_expires_at,
  us.stripe_customer_id,
  us.stripe_subscription_id,
  us.status AS subscription_status
FROM public.users u
LEFT JOIN public.user_verifications uv ON u.user_id = uv.user_id
LEFT JOIN public.user_subscriptions us ON u.user_id = us.user_id;

COMMENT ON VIEW public.users_complete IS 
'Compatibility view: users table with verification and subscription data joined. Use for gradual migration. Prefer direct JOINs in new code.';

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
DECLARE
  users_count BIGINT;
  verifications_count BIGINT;
  subscriptions_count BIGINT;
  users_with_verified_count BIGINT;
  users_with_subscription_count BIGINT;
BEGIN
  -- Count records
  SELECT COUNT(*) INTO users_count FROM public.users;
  SELECT COUNT(*) INTO verifications_count FROM public.user_verifications;
  SELECT COUNT(*) INTO subscriptions_count FROM public.user_subscriptions;
  
  -- Count users that should have verifications/subscriptions
  SELECT COUNT(*) INTO users_with_verified_count 
  FROM public.users u
  INNER JOIN public.user_verifications uv ON u.user_id = uv.user_id;
  
  SELECT COUNT(*) INTO users_with_subscription_count 
  FROM public.users u
  INNER JOIN public.user_subscriptions us ON u.user_id = us.user_id;
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'MIGRATION VERIFICATION';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Users table: % rows', users_count;
  RAISE NOTICE 'User verifications: % rows', verifications_count;
  RAISE NOTICE 'User subscriptions: % rows', subscriptions_count;
  RAISE NOTICE 'Users with verifications: % rows', users_with_verified_count;
  RAISE NOTICE 'Users with subscriptions: % rows', users_with_subscription_count;
  
  IF verifications_count = users_count THEN
    RAISE NOTICE '✅ All users have verification records';
  ELSE
    RAISE WARNING '⚠️  Verification count mismatch: expected %, got %', users_count, verifications_count;
  END IF;
  
  IF subscriptions_count = users_count THEN
    RAISE NOTICE '✅ All users have subscription records';
  ELSE
    RAISE WARNING '⚠️  Subscription count mismatch: expected %, got %', users_count, subscriptions_count;
  END IF;
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Migration complete. Verification and subscription data extracted.';
  RAISE NOTICE 'Use users_with_verification, users_with_subscription, or users_complete views for backward compatibility.';
  RAISE NOTICE 'Update code to use direct JOINs with user_verifications and user_subscriptions tables.';
  RAISE NOTICE '================================================';
END $$;

COMMIT;

-- ============================================
-- NOTES
-- ============================================
-- 1. Verification and subscription data have been extracted to separate tables
-- 2. All existing data has been migrated
-- 3. Columns have been removed from users table
-- 4. Compatibility views are available for gradual code migration:
--    - users_with_verification
--    - users_with_subscription  
--    - users_complete
-- 5. New code should use direct JOINs:
--    SELECT u.*, uv.verified, uv.verification_level 
--    FROM users u 
--    LEFT JOIN user_verifications uv ON u.user_id = uv.user_id;
-- 6. RLS policies are set up for both new tables
-- 7. Indexes are created for performance
-- ============================================
