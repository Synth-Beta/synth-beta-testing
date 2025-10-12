-- ============================================
-- SAFE ACCOUNT TYPES MIGRATION (Step by Step)
-- ============================================
-- Run each section separately to identify issues

-- ========================================
-- SECTION 1: Create Enums
-- ========================================
-- Run this first

DROP TYPE IF EXISTS account_type CASCADE;
CREATE TYPE account_type AS ENUM (
  'user',
  'creator',
  'business',
  'admin'
);

DROP TYPE IF EXISTS subscription_tier CASCADE;
CREATE TYPE subscription_tier AS ENUM (
  'free',
  'premium',
  'professional',
  'enterprise'
);

DROP TYPE IF EXISTS verification_level CASCADE;
CREATE TYPE verification_level AS ENUM (
  'none',
  'email',
  'phone',
  'identity',
  'business'
);

-- Verify enums created
SELECT 'Enums created' as status,
  (SELECT COUNT(*) FROM pg_type WHERE typname IN ('account_type', 'subscription_tier', 'verification_level')) as enum_count;
-- Should return 3

-- ========================================
-- SECTION 2: Add Columns to Profiles
-- ========================================
-- Run this second (only after Section 1 succeeds)

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS account_type account_type DEFAULT 'user' NOT NULL;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS verification_level verification_level DEFAULT 'email';

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS business_info JSONB DEFAULT '{}';

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS subscription_tier subscription_tier DEFAULT 'free';

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Verify columns added
SELECT 'Columns added' as status,
  COUNT(*) as new_columns
FROM information_schema.columns 
WHERE table_name = 'profiles' 
AND column_name IN ('account_type', 'verified', 'business_info', 'subscription_tier');
-- Should return 4

-- ========================================
-- SECTION 3: Create Indexes
-- ========================================
-- Run this third

CREATE INDEX IF NOT EXISTS idx_profiles_account_type ON public.profiles(account_type);
CREATE INDEX IF NOT EXISTS idx_profiles_verified ON public.profiles(verified);
CREATE INDEX IF NOT EXISTS idx_profiles_verification_level ON public.profiles(verification_level);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier ON public.profiles(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_expires ON public.profiles(subscription_expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_business_info ON public.profiles USING GIN(business_info);

SELECT 'Indexes created' as status;

-- ========================================
-- SECTION 4: Create Permissions Table
-- ========================================
-- Run this fourth

DROP TABLE IF EXISTS public.account_permissions CASCADE;

CREATE TABLE public.account_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_type account_type NOT NULL,
  permission_key TEXT NOT NULL,
  permission_name TEXT NOT NULL,
  permission_description TEXT,
  granted BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_type, permission_key)
);

-- Enable RLS
ALTER TABLE public.account_permissions ENABLE ROW LEVEL SECURITY;

-- Drop old policies if they exist
DROP POLICY IF EXISTS "Account permissions are viewable by authenticated users" ON public.account_permissions;
DROP POLICY IF EXISTS "Only admins can modify permissions" ON public.account_permissions;

-- Create policies
CREATE POLICY "Account permissions are viewable by authenticated users"
ON public.account_permissions FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Only admins can modify permissions"
ON public.account_permissions FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_account_permissions_type ON public.account_permissions(account_type);
CREATE INDEX IF NOT EXISTS idx_account_permissions_key ON public.account_permissions(permission_key);

SELECT 'Permissions table created' as status;

-- ========================================
-- SECTION 5: Insert Permissions
-- ========================================
-- Run this fifth

TRUNCATE public.account_permissions;

INSERT INTO public.account_permissions (account_type, permission_key, permission_name, permission_description) VALUES
-- USER permissions
('user', 'view_events', 'View Events', 'Can view and search for events'),
('user', 'create_reviews', 'Create Reviews', 'Can write reviews for events'),
('user', 'like_events', 'Like Events', 'Can like events and reviews'),
('user', 'comment', 'Comment', 'Can comment on events and reviews'),
('user', 'follow_artists', 'Follow Artists & Venues', 'Can follow artists and venues'),
('user', 'view_own_analytics', 'View Own Analytics', 'Can view personal stats dashboard'),
('user', 'export_own_data', 'Export Own Data', 'Premium: Export personal data'),

-- CREATOR permissions
('creator', 'view_events', 'View Events', 'Can view and search for events'),
('creator', 'create_reviews', 'Create Reviews', 'Can write reviews'),
('creator', 'manage_creator_profile', 'Manage Creator Profile', 'Can edit artist/label profile'),
('creator', 'view_creator_analytics', 'View Creator Analytics', 'Can view artist/label performance metrics'),
('creator', 'view_fan_demographics', 'View Fan Demographics', 'Can see fan age, gender, location data'),
('creator', 'view_revenue_insights', 'View Revenue Insights', 'Can see ticket sales and revenue estimates'),
('creator', 'claim_events', 'Claim Events', 'Can claim events associated with artist'),
('creator', 'export_analytics', 'Export Analytics', 'Can export analytics data'),
('creator', 'api_access', 'API Access', 'Enterprise tier: API access'),
('creator', 'manage_roster', 'Manage Roster', 'Labels: Manage multiple artists'),
('creator', 'view_market_intelligence', 'View Market Intelligence', 'Labels: Access A&R and market trend data'),

-- BUSINESS permissions
('business', 'view_events', 'View Events', 'Can view all events'),
('business', 'create_events', 'Create Events', 'Can create and manage events'),
('business', 'manage_business_profile', 'Manage Business Profile', 'Can edit venue/business profile'),
('business', 'view_business_analytics', 'View Business Analytics', 'Can view venue/campaign performance metrics'),
('business', 'view_visitor_demographics', 'View Visitor Demographics', 'Can see visitor/audience demographics'),
('business', 'create_campaigns', 'Create Campaigns', 'Promoters/Advertisers: Create marketing campaigns'),
('business', 'manage_ads', 'Manage Advertisements', 'Advertisers: Create and manage ads'),
('business', 'target_audiences', 'Target Audiences', 'Promoters/Advertisers: Custom audience targeting'),
('business', 'conversion_tracking', 'Conversion Tracking', 'Advertisers: Track conversions with pixels'),
('business', 'export_analytics', 'Export Analytics', 'Can export all analytics data'),
('business', 'api_access', 'API Access', 'Enterprise tier: API access'),

-- ADMIN permissions
('admin', 'manage_users', 'Manage Users', 'Can manage all user accounts and account types'),
('admin', 'manage_events', 'Manage Events', 'Can manage all events on platform'),
('admin', 'manage_reviews', 'Manage Reviews', 'Can moderate and manage reviews'),
('admin', 'view_all_analytics', 'View All Analytics', 'Can view all platform analytics'),
('admin', 'moderate_content', 'Moderate Content', 'Can moderate all user-generated content'),
('admin', 'manage_permissions', 'Manage Permissions', 'Can grant/revoke permissions'),
('admin', 'view_revenue', 'View Revenue', 'Can view platform revenue and financial metrics'),
('admin', 'export_all_data', 'Export All Data', 'Can export entire database'),
('admin', 'api_access', 'Full API Access', 'Complete API access'),
('admin', 'manage_subscriptions', 'Manage Subscriptions', 'Can manage user subscriptions and billing');

SELECT 'Permissions inserted' as status, COUNT(*) as permission_count
FROM public.account_permissions;
-- Should return 36

-- ========================================
-- SECTION 6: Create Helper Functions
-- ========================================
-- Run this sixth

CREATE OR REPLACE FUNCTION public.user_has_permission(p_user_id UUID, p_permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_account_type account_type;
  v_has_permission BOOLEAN;
BEGIN
  SELECT account_type INTO v_account_type
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_account_type IS NULL THEN
    RETURN false;
  END IF;
  
  SELECT COALESCE(granted, false) INTO v_has_permission
  FROM public.account_permissions
  WHERE account_type = v_account_type
  AND permission_key = p_permission_key;
  
  RETURN COALESCE(v_has_permission, false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.user_has_permission(UUID, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_user_account_info(p_user_id UUID)
RETURNS TABLE (
  account_type account_type,
  verified BOOLEAN,
  verification_level verification_level,
  subscription_tier subscription_tier,
  subscription_active BOOLEAN,
  permissions TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.account_type,
    p.verified,
    p.verification_level,
    p.subscription_tier,
    CASE 
      WHEN p.subscription_expires_at IS NULL THEN true
      WHEN p.subscription_expires_at > NOW() THEN true
      ELSE false
    END as subscription_active,
    ARRAY_AGG(ap.permission_key) FILTER (WHERE ap.granted = true) as permissions
  FROM public.profiles p
  LEFT JOIN public.account_permissions ap ON ap.account_type = p.account_type
  WHERE p.user_id = p_user_id
  GROUP BY p.id, p.account_type, p.verified, p.verification_level, p.subscription_tier, p.subscription_expires_at;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_account_info(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_set_account_type(
  p_user_id UUID,
  p_account_type account_type,
  p_verification_level verification_level DEFAULT 'email',
  p_subscription_tier subscription_tier DEFAULT 'free'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can change account types';
  END IF;
  
  UPDATE public.profiles
  SET 
    account_type = p_account_type,
    verification_level = p_verification_level,
    subscription_tier = p_subscription_tier,
    verified = CASE 
      WHEN p_verification_level IN ('identity', 'business') THEN true
      ELSE verified
    END,
    subscription_started_at = CASE
      WHEN p_subscription_tier != 'free' AND subscription_started_at IS NULL THEN NOW()
      ELSE subscription_started_at
    END
  WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_set_account_type(UUID, account_type, verification_level, subscription_tier) TO authenticated;

SELECT 'Helper functions created' as status;

-- ========================================
-- SECTION 7: Create View
-- ========================================
-- Run this seventh

DROP VIEW IF EXISTS public.profiles_with_account_info CASCADE;

CREATE VIEW public.profiles_with_account_info AS
SELECT 
  p.*,
  CASE 
    WHEN p.subscription_expires_at IS NULL THEN true
    WHEN p.subscription_expires_at > NOW() THEN true
    ELSE false
  END as subscription_active,
  ARRAY_AGG(ap.permission_key) FILTER (WHERE ap.granted = true) as permissions
FROM public.profiles p
LEFT JOIN public.account_permissions ap ON ap.account_type = p.account_type
GROUP BY p.id;

GRANT SELECT ON public.profiles_with_account_info TO authenticated;

SELECT 'View created' as status;

-- ========================================
-- FINAL VERIFICATION
-- ========================================

SELECT 
  'Migration complete!' as status,
  (SELECT COUNT(*) FROM pg_type WHERE typname IN ('account_type', 'subscription_tier', 'verification_level')) as enums_created,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'account_type') as columns_added,
  (SELECT COUNT(*) FROM account_permissions) as permissions_inserted;

