-- ============================================
-- CREATE MONETIZATION_TRACKING TABLE
-- ============================================
-- Consolidates account_upgrade_requests and event_promotions
-- into a unified monetization tracking table
-- user_id always represents the account owner

CREATE TABLE IF NOT EXISTS public.monetization_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- WHO: Account owner (always the user who owns/initiates the monetization)
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  
  -- WHAT: Type of monetization transaction
  transaction_type TEXT NOT NULL CHECK (transaction_type IN (
    'account_upgrade',      -- Account upgrade request/purchase
    'event_promotion',      -- Event promotion purchase
    'subscription',         -- Subscription purchase/renewal (future)
    'feature_purchase',     -- One-time feature purchase (future)
    'advertising_spend',    -- Advertising spend (future)
    'refund'                -- Refund/credit
  )),
  
  -- WHAT ENTITY: Related entity (polymorphic)
  related_entity_type TEXT CHECK (related_entity_type IN ('event', 'user', 'feature')),
  related_entity_id UUID,  -- event_id for promotions, user_id for upgrades (same as user_id)
  
  -- FINANCIAL DETAILS
  amount DECIMAL(10,2),           -- Amount paid/charged
  currency TEXT DEFAULT 'USD',
  price_original DECIMAL(10,2),   -- Original price before discounts
  discount_amount DECIMAL(10,2),  -- Discount applied
  tax_amount DECIMAL(10,2),       -- Tax amount
  
  -- PAYMENT INFORMATION
  payment_status TEXT NOT NULL DEFAULT 'pending' CHECK (payment_status IN (
    'pending', 'processing', 'completed', 'failed', 'refunded', 'cancelled'
  )),
  payment_method TEXT,            -- 'stripe', 'paypal', etc.
  stripe_payment_intent_id TEXT,
  stripe_subscription_id TEXT,
  stripe_invoice_id TEXT,
  
  -- TRANSACTION DETAILS
  transaction_tier TEXT,          -- 'basic', 'premium', 'featured', 'free', 'professional', 'enterprise'
  transaction_status TEXT DEFAULT 'pending' CHECK (transaction_status IN (
    'pending', 'active', 'paused', 'expired', 'cancelled', 'rejected', 'completed'
  )),
  
  -- TIMING
  starts_at TIMESTAMPTZ,          -- When transaction/service starts
  expires_at TIMESTAMPTZ,         -- When transaction/service expires
  effective_at TIMESTAMPTZ,       -- When transaction becomes effective
  cancelled_at TIMESTAMPTZ,
  
  -- TARGETING/CONFIGURATION (for promotions/ads)
  targeting_config JSONB DEFAULT '{}',  -- target_cities, target_genres, target_age_min, target_age_max, etc.
  
  -- PERFORMANCE METRICS (for promotions)
  metrics JSONB DEFAULT '{}',     -- impressions, clicks, conversions, etc.
  
  -- WORKFLOW/AUDIT
  workflow_status TEXT DEFAULT 'pending' CHECK (workflow_status IN (
    'pending', 'approved', 'denied', 'auto_approved', 'requires_review'
  )),
  reviewed_by UUID REFERENCES public.users(user_id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  rejection_reason TEXT,
  
  -- BUSINESS DETAILS (for account upgrades)
  business_info JSONB DEFAULT '{}',
  
  -- METADATA (preserves original table and ID for reference)
  metadata JSONB DEFAULT '{}',    -- original_table, original_id, etc.
  
  -- TIMESTAMPS
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- CONSTRAINTS
  CONSTRAINT valid_upgrade_entity CHECK (
    (transaction_type = 'account_upgrade' AND related_entity_type = 'user' AND related_entity_id = user_id) OR
    (transaction_type != 'account_upgrade')
  ),
  CONSTRAINT valid_promotion_entity CHECK (
    (transaction_type = 'event_promotion' AND related_entity_type = 'event') OR
    (transaction_type != 'event_promotion')
  )
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_monetization_tracking_user_id 
  ON public.monetization_tracking(user_id);
CREATE INDEX IF NOT EXISTS idx_monetization_tracking_transaction_type 
  ON public.monetization_tracking(transaction_type);
CREATE INDEX IF NOT EXISTS idx_monetization_tracking_status 
  ON public.monetization_tracking(transaction_status);
CREATE INDEX IF NOT EXISTS idx_monetization_tracking_payment_status 
  ON public.monetization_tracking(payment_status);
CREATE INDEX IF NOT EXISTS idx_monetization_tracking_workflow_status 
  ON public.monetization_tracking(workflow_status);
CREATE INDEX IF NOT EXISTS idx_monetization_tracking_related_entity 
  ON public.monetization_tracking(related_entity_type, related_entity_id);
CREATE INDEX IF NOT EXISTS idx_monetization_tracking_effective_dates 
  ON public.monetization_tracking(starts_at, expires_at) 
  WHERE transaction_status = 'active';
CREATE INDEX IF NOT EXISTS idx_monetization_tracking_created_at 
  ON public.monetization_tracking(created_at DESC);

-- ENABLE RLS
ALTER TABLE public.monetization_tracking ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES
-- Users can view their own monetization transactions
DROP POLICY IF EXISTS "Users can view their own monetization" ON public.monetization_tracking;
CREATE POLICY "Users can view their own monetization"
ON public.monetization_tracking FOR SELECT
USING (auth.uid() = user_id);

-- Users can create their own monetization transactions
DROP POLICY IF EXISTS "Users can create their own monetization" ON public.monetization_tracking;
CREATE POLICY "Users can create their own monetization"
ON public.monetization_tracking FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own monetization transactions
DROP POLICY IF EXISTS "Users can update their own monetization" ON public.monetization_tracking;
CREATE POLICY "Users can update their own monetization"
ON public.monetization_tracking FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Admins can view all monetization transactions
DROP POLICY IF EXISTS "Admins can view all monetization" ON public.monetization_tracking;
CREATE POLICY "Admins can view all monetization"
ON public.monetization_tracking FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- Admins can manage all monetization transactions
DROP POLICY IF EXISTS "Admins can manage all monetization" ON public.monetization_tracking;
CREATE POLICY "Admins can manage all monetization"
ON public.monetization_tracking FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

