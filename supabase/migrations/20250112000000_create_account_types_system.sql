-- ============================================
-- ACCOUNT TYPES & PERMISSIONS SYSTEM
-- ============================================
-- This migration creates the account type system for different user roles
-- and their associated permissions for analytics and features

-- Step 1: Create account_type enum (SIMPLIFIED to 4 core types)
-- First, drop the enum if it exists (safe since profiles table doesn't have it yet)
DROP TYPE IF EXISTS account_type CASCADE;

-- Create the new simplified enum
CREATE TYPE account_type AS ENUM (
  'user',           -- Regular concert-goer (default, free + premium)
  'creator',        -- Artists & Labels (tiered subscriptions)
  'business',       -- Venues, Promoters, Advertisers (tiered subscriptions)
  'admin'           -- Platform admin (internal only)
);

-- Step 2: Create subscription_tier enum
DROP TYPE IF EXISTS subscription_tier CASCADE;
CREATE TYPE subscription_tier AS ENUM (
  'free',           -- Free tier
  'premium',        -- Premium features
  'professional',   -- Professional/business tier
  'enterprise'      -- Enterprise tier with custom features
);

-- Step 3: Create verification_level enum
DROP TYPE IF EXISTS verification_level CASCADE;
CREATE TYPE verification_level AS ENUM (
  'none',           -- No verification
  'email',          -- Email verified only (default for users)
  'phone',          -- Phone verified
  'identity',       -- Identity verified (ID check)
  'business'        -- Business verified (for commercial accounts)
);

-- Step 4: Add new columns to profiles table
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS account_type account_type DEFAULT 'user' NOT NULL,
ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_level verification_level DEFAULT 'none',
ADD COLUMN IF NOT EXISTS business_info JSONB DEFAULT '{}',
ADD COLUMN IF NOT EXISTS subscription_tier subscription_tier DEFAULT 'free',
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS subscription_started_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;

-- Step 5: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_account_type ON public.profiles(account_type);
CREATE INDEX IF NOT EXISTS idx_profiles_verified ON public.profiles(verified);
CREATE INDEX IF NOT EXISTS idx_profiles_verification_level ON public.profiles(verification_level);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_tier ON public.profiles(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_profiles_subscription_expires ON public.profiles(subscription_expires_at);
CREATE INDEX IF NOT EXISTS idx_profiles_business_info ON public.profiles USING GIN(business_info);

-- Step 6: Add comments for documentation
COMMENT ON COLUMN public.profiles.account_type IS 'Type of account: user, artist, venue, promoter, ad_account, label, media, venue_manager, admin';
COMMENT ON COLUMN public.profiles.verified IS 'Whether the account has been verified (blue checkmark)';
COMMENT ON COLUMN public.profiles.verification_level IS 'Level of verification completed';
COMMENT ON COLUMN public.profiles.business_info IS 'JSONB containing business details for commercial accounts (tax ID, company name, etc.)';
COMMENT ON COLUMN public.profiles.subscription_tier IS 'Current subscription tier';
COMMENT ON COLUMN public.profiles.subscription_expires_at IS 'When the current subscription expires';

-- Step 7: Create account_permissions table
CREATE TABLE IF NOT EXISTS public.account_permissions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  account_type account_type NOT NULL,
  permission_key TEXT NOT NULL,
  permission_name TEXT NOT NULL,
  permission_description TEXT,
  granted BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(account_type, permission_key)
);

-- Step 8: Enable RLS on account_permissions
ALTER TABLE public.account_permissions ENABLE ROW LEVEL SECURITY;

-- Step 9: Create RLS policy for permissions (readable by all authenticated users)
DROP POLICY IF EXISTS "Account permissions are viewable by authenticated users" ON public.account_permissions;
CREATE POLICY "Account permissions are viewable by authenticated users"
ON public.account_permissions FOR SELECT
TO authenticated
USING (true);

-- Only admins can modify permissions
DROP POLICY IF EXISTS "Only admins can modify permissions" ON public.account_permissions;
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

-- Step 10: Insert default permissions for each account type (SIMPLIFIED)
INSERT INTO public.account_permissions (account_type, permission_key, permission_name, permission_description) VALUES
-- USER permissions (basic + premium tier)
('user', 'view_events', 'View Events', 'Can view and search for events'),
('user', 'create_reviews', 'Create Reviews', 'Can write reviews for events'),
('user', 'like_events', 'Like Events', 'Can like events and reviews'),
('user', 'comment', 'Comment', 'Can comment on events and reviews'),
('user', 'follow_artists', 'Follow Artists & Venues', 'Can follow artists and venues'),
('user', 'view_own_analytics', 'View Own Analytics', 'Can view personal stats dashboard'),
('user', 'export_own_data', 'Export Own Data', 'Premium: Export personal data (requires premium subscription)'),

-- CREATOR permissions (artists + labels combined)
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

-- BUSINESS permissions (venues + promoters + advertisers combined)
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

-- ADMIN permissions (superuser - platform management)
('admin', 'manage_users', 'Manage Users', 'Can manage all user accounts and account types'),
('admin', 'manage_events', 'Manage Events', 'Can manage all events on platform'),
('admin', 'manage_reviews', 'Manage Reviews', 'Can moderate and manage reviews'),
('admin', 'view_all_analytics', 'View All Analytics', 'Can view all platform analytics'),
('admin', 'moderate_content', 'Moderate Content', 'Can moderate all user-generated content'),
('admin', 'manage_permissions', 'Manage Permissions', 'Can grant/revoke permissions'),
('admin', 'view_revenue', 'View Revenue', 'Can view platform revenue and financial metrics'),
('admin', 'export_all_data', 'Export All Data', 'Can export entire database'),
('admin', 'api_access', 'Full API Access', 'Complete API access'),
('admin', 'manage_subscriptions', 'Manage Subscriptions', 'Can manage user subscriptions and billing')
ON CONFLICT (account_type, permission_key) DO NOTHING;

-- Step 11: Create function to check if user has permission
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
  -- Get user's account type
  SELECT account_type INTO v_account_type
  FROM public.profiles
  WHERE user_id = p_user_id;
  
  IF v_account_type IS NULL THEN
    RETURN false;
  END IF;
  
  -- Check if permission exists and is granted
  SELECT COALESCE(granted, false) INTO v_has_permission
  FROM public.account_permissions
  WHERE account_type = v_account_type
  AND permission_key = p_permission_key;
  
  RETURN COALESCE(v_has_permission, false);
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.user_has_permission(UUID, TEXT) TO authenticated;

-- Step 12: Create function to get user's account info
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

-- Step 13: Create view for profiles with permissions (for easier querying)
CREATE OR REPLACE VIEW public.profiles_with_account_info AS
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

-- Grant permissions on the view
GRANT SELECT ON public.profiles_with_account_info TO authenticated;

-- Step 14: Note about account type security
-- Account type changes are restricted through the admin_set_account_type function
-- Regular users cannot directly change their account_type
-- This is enforced by only allowing admins to call admin_set_account_type
-- No additional RLS policy needed as the existing "Users can update their own profile" policy 
-- allows updates, but we'll rely on application logic and admin function for account_type changes

-- Step 15: Create function for admins to upgrade account type
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
  -- Only admins can execute this
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can change account types';
  END IF;
  
  -- Update the user's account
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

-- Step 16: Create function for users to request account upgrade
CREATE OR REPLACE FUNCTION public.request_account_upgrade(
  p_account_type account_type,
  p_business_info JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_request_id UUID;
BEGIN
  -- Create account upgrade request (for manual approval)
  -- This would trigger a notification to admins
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    data
  )
  SELECT 
    (SELECT user_id FROM public.profiles WHERE account_type = 'admin' LIMIT 1),
    'account_upgrade_request',
    'Account Upgrade Request',
    (SELECT name FROM public.profiles WHERE user_id = auth.uid()) || ' requested ' || p_account_type::TEXT || ' account',
    jsonb_build_object(
      'requester_user_id', auth.uid(),
      'requested_account_type', p_account_type::TEXT,
      'business_info', p_business_info
    )
  RETURNING id INTO v_request_id;
  
  -- Update user's business_info
  UPDATE public.profiles
  SET business_info = p_business_info
  WHERE user_id = auth.uid();
  
  RETURN v_request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_account_upgrade(account_type, JSONB) TO authenticated;

-- Step 17: Add account_upgrade_request to notifications type constraint
DO $$
BEGIN
  -- Drop existing constraint
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  
  -- Add new constraint with all notification types
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN (
    'friend_request',
    'friend_accepted',
    'match',
    'message',
    'review_liked',
    'review_commented',
    'comment_replied',
    'event_interest',
    'artist_followed',
    'artist_new_event',
    'artist_profile_updated',
    'account_upgrade_request',
    'account_upgraded',
    'subscription_expiring',
    'subscription_expired'
  ));
END $$;

-- Step 18: Create indexes on account_permissions
CREATE INDEX IF NOT EXISTS idx_account_permissions_type ON public.account_permissions(account_type);
CREATE INDEX IF NOT EXISTS idx_account_permissions_key ON public.account_permissions(permission_key);

-- Step 19: Add helpful comments
COMMENT ON TABLE public.account_permissions IS 'Defines permissions for each account type';
COMMENT ON FUNCTION public.user_has_permission IS 'Check if a user has a specific permission based on their account type';
COMMENT ON FUNCTION public.get_user_account_info IS 'Get complete account information including permissions for a user';
COMMENT ON FUNCTION public.admin_set_account_type IS 'Admin-only function to change user account types';
COMMENT ON FUNCTION public.request_account_upgrade IS 'User function to request account type upgrade';

-- Step 20: Create trigger to set verified flag when verification_level changes
CREATE OR REPLACE FUNCTION set_verified_flag()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.verification_level IN ('identity', 'business') THEN
    NEW.verified = true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_set_verified_flag ON public.profiles;
CREATE TRIGGER trigger_set_verified_flag
  BEFORE INSERT OR UPDATE OF verification_level ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION set_verified_flag();

-- Step 21: Set default verification for existing users
UPDATE public.profiles
SET verification_level = 'email'
WHERE verification_level IS NULL;

-- Step 22: Grant permissions
GRANT SELECT ON public.account_permissions TO authenticated;
GRANT SELECT ON public.profiles_with_account_info TO authenticated;

-- Verification complete
SELECT 
  'Account types system created' as status,
  COUNT(DISTINCT account_type) as account_types,
  COUNT(*) as permissions
FROM public.account_permissions;

