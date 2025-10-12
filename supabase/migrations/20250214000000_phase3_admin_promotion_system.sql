-- ============================================
-- PHASE 3: ADMIN DASHBOARD & EVENT PROMOTION SYSTEM
-- ============================================
-- Adds admin moderation tools, event promotion system, and monetization framework

-- ============================================
-- PART 1: EVENT PROMOTION SYSTEM
-- ============================================

-- Step 1: Create event_promotions table
CREATE TABLE IF NOT EXISTS public.event_promotions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.jambase_events(id) ON DELETE CASCADE,
  promoted_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  promotion_tier TEXT DEFAULT 'basic' CHECK (promotion_tier IN ('basic', 'premium', 'featured')),
  promotion_status TEXT DEFAULT 'active' CHECK (promotion_status IN ('pending', 'active', 'paused', 'expired', 'rejected')),
  
  -- Pricing & Payment
  price_paid DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  payment_status TEXT CHECK (payment_status IN ('pending', 'completed', 'failed', 'refunded')),
  stripe_payment_intent_id TEXT,
  
  -- Scheduling
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Targeting (future use)
  target_cities TEXT[],
  target_genres TEXT[],
  target_age_min INTEGER,
  target_age_max INTEGER,
  
  -- Performance metrics
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  
  -- Admin review
  reviewed_by_admin_id UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  rejection_reason TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 2: Create indexes for promotions
CREATE INDEX IF NOT EXISTS idx_event_promotions_event_id ON public.event_promotions(event_id);
CREATE INDEX IF NOT EXISTS idx_event_promotions_user_id ON public.event_promotions(promoted_by_user_id);
CREATE INDEX IF NOT EXISTS idx_event_promotions_status ON public.event_promotions(promotion_status);
CREATE INDEX IF NOT EXISTS idx_event_promotions_active ON public.event_promotions(promotion_status, expires_at) 
  WHERE promotion_status = 'active';
CREATE INDEX IF NOT EXISTS idx_event_promotions_tier ON public.event_promotions(promotion_tier, promotion_status);
CREATE INDEX IF NOT EXISTS idx_event_promotions_pending ON public.event_promotions(promotion_status, created_at)
  WHERE promotion_status = 'pending';

-- Create partial unique index to prevent duplicate active promotions at same tier
CREATE UNIQUE INDEX IF NOT EXISTS idx_event_promotions_unique_active 
  ON public.event_promotions(event_id, promotion_tier) 
  WHERE promotion_status = 'active';

-- Step 3: Enable RLS on event_promotions
ALTER TABLE public.event_promotions ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policies for event_promotions
DROP POLICY IF EXISTS "Users can view their own promotions" ON public.event_promotions;
CREATE POLICY "Users can view their own promotions"
ON public.event_promotions FOR SELECT
USING (promoted_by_user_id = auth.uid());

DROP POLICY IF EXISTS "Event owners can create promotions" ON public.event_promotions;
CREATE POLICY "Event owners can create promotions"
ON public.event_promotions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.jambase_events
    WHERE id = event_promotions.event_id
    AND (
      created_by_user_id = auth.uid()
      OR claimed_by_creator_id = auth.uid()
    )
  )
);

DROP POLICY IF EXISTS "Admins can view all promotions" ON public.event_promotions;
CREATE POLICY "Admins can view all promotions"
ON public.event_promotions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can manage promotions" ON public.event_promotions;
CREATE POLICY "Admins can manage promotions"
ON public.event_promotions FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- ============================================
-- PART 2: ADMIN ACTIONS LOG
-- ============================================

-- Step 5: Create admin_actions table for audit trail
CREATE TABLE IF NOT EXISTS public.admin_actions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  action_type TEXT NOT NULL CHECK (action_type IN (
    'claim_approved', 
    'claim_rejected',
    'promotion_approved',
    'promotion_rejected',
    'event_moderated',
    'event_deleted',
    'user_banned',
    'user_unbanned',
    'account_type_changed',
    'subscription_modified',
    'content_flagged',
    'content_unflagged'
  )),
  target_type TEXT NOT NULL CHECK (target_type IN (
    'event_claim',
    'event_promotion',
    'event',
    'user',
    'review',
    'comment'
  )),
  target_id UUID NOT NULL,
  action_details JSONB DEFAULT '{}',
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Step 6: Create indexes for admin_actions
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin_id ON public.admin_actions(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_type ON public.admin_actions(action_type);
CREATE INDEX IF NOT EXISTS idx_admin_actions_target ON public.admin_actions(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON public.admin_actions(created_at DESC);

-- Step 7: Enable RLS on admin_actions
ALTER TABLE public.admin_actions ENABLE ROW LEVEL SECURITY;

-- Step 8: Create RLS policy for admin_actions
DROP POLICY IF EXISTS "Only admins can view admin actions" ON public.admin_actions;
CREATE POLICY "Only admins can view admin actions"
ON public.admin_actions FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

DROP POLICY IF EXISTS "Only admins can log actions" ON public.admin_actions;
CREATE POLICY "Only admins can log actions"
ON public.admin_actions FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- ============================================
-- PART 3: CONTENT MODERATION FLAGS
-- ============================================

-- Step 9: Create moderation_flags table
CREATE TABLE IF NOT EXISTS public.moderation_flags (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  flagged_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  content_type TEXT NOT NULL CHECK (content_type IN ('event', 'review', 'comment', 'profile', 'message')),
  content_id UUID NOT NULL,
  flag_reason TEXT NOT NULL CHECK (flag_reason IN (
    'spam',
    'inappropriate_content',
    'harassment',
    'misinformation',
    'copyright_violation',
    'fake_event',
    'duplicate',
    'other'
  )),
  flag_details TEXT,
  flag_status TEXT DEFAULT 'pending' CHECK (flag_status IN ('pending', 'reviewed', 'resolved', 'dismissed')),
  
  -- Admin review
  reviewed_by_admin_id UUID REFERENCES auth.users(id),
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  action_taken TEXT,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  -- Prevent duplicate flags from same user
  UNIQUE(flagged_by_user_id, content_type, content_id)
);

-- Step 10: Create indexes for moderation_flags
CREATE INDEX IF NOT EXISTS idx_moderation_flags_content ON public.moderation_flags(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_status ON public.moderation_flags(flag_status);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_pending ON public.moderation_flags(flag_status, created_at)
  WHERE flag_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_moderation_flags_user ON public.moderation_flags(flagged_by_user_id);

-- Step 11: Enable RLS on moderation_flags
ALTER TABLE public.moderation_flags ENABLE ROW LEVEL SECURITY;

-- Step 12: Create RLS policies for moderation_flags
DROP POLICY IF EXISTS "Users can create flags" ON public.moderation_flags;
CREATE POLICY "Users can create flags"
ON public.moderation_flags FOR INSERT
WITH CHECK (auth.uid() = flagged_by_user_id);

DROP POLICY IF EXISTS "Users can view their own flags" ON public.moderation_flags;
CREATE POLICY "Users can view their own flags"
ON public.moderation_flags FOR SELECT
USING (auth.uid() = flagged_by_user_id);

DROP POLICY IF EXISTS "Admins can view all flags" ON public.moderation_flags;
CREATE POLICY "Admins can view all flags"
ON public.moderation_flags FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can update flags" ON public.moderation_flags;
CREATE POLICY "Admins can update flags"
ON public.moderation_flags FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- ============================================
-- PART 4: ADMIN FUNCTIONS
-- ============================================

-- Step 13: Function to approve/reject event promotion
CREATE OR REPLACE FUNCTION public.review_event_promotion(
  p_promotion_id UUID,
  p_approved BOOLEAN,
  p_admin_notes TEXT DEFAULT NULL,
  p_rejection_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
  v_promoted_by_user_id UUID;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can review event promotions';
  END IF;
  
  -- Get promotion details
  SELECT event_id, promoted_by_user_id INTO v_event_id, v_promoted_by_user_id
  FROM public.event_promotions
  WHERE id = p_promotion_id;
  
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Promotion not found';
  END IF;
  
  -- Update promotion status
  UPDATE public.event_promotions
  SET 
    promotion_status = CASE WHEN p_approved THEN 'active' ELSE 'rejected' END,
    reviewed_by_admin_id = auth.uid(),
    reviewed_at = now(),
    admin_notes = p_admin_notes,
    rejection_reason = p_rejection_reason,
    updated_at = now()
  WHERE id = p_promotion_id;
  
  -- Update event promotion tier if approved
  IF p_approved THEN
    UPDATE public.jambase_events
    SET 
      promotion_tier = (SELECT promotion_tier FROM public.event_promotions WHERE id = p_promotion_id),
      is_featured = CASE 
        WHEN (SELECT promotion_tier FROM public.event_promotions WHERE id = p_promotion_id) = 'featured' THEN true
        ELSE is_featured
      END,
      featured_until = (SELECT expires_at FROM public.event_promotions WHERE id = p_promotion_id),
      updated_at = now()
    WHERE id = v_event_id;
  END IF;
  
  -- Log admin action
  INSERT INTO public.admin_actions (
    admin_user_id,
    action_type,
    target_type,
    target_id,
    action_details,
    reason
  ) VALUES (
    auth.uid(),
    CASE WHEN p_approved THEN 'promotion_approved' ELSE 'promotion_rejected' END,
    'event_promotion',
    p_promotion_id,
    jsonb_build_object(
      'event_id', v_event_id,
      'promoted_by', v_promoted_by_user_id,
      'approved', p_approved
    ),
    COALESCE(p_admin_notes, p_rejection_reason)
  );
  
  -- Notify user
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    data
  ) VALUES (
    v_promoted_by_user_id,
    CASE WHEN p_approved THEN 'promotion_approved' ELSE 'promotion_rejected' END,
    CASE WHEN p_approved THEN 'Promotion Approved! 🎉' ELSE 'Promotion Not Approved' END,
    CASE 
      WHEN p_approved THEN 'Your event promotion has been approved and is now active'
      ELSE 'Your event promotion was not approved' || COALESCE(': ' || p_rejection_reason, '')
    END,
    jsonb_build_object(
      'promotion_id', p_promotion_id,
      'event_id', v_event_id,
      'approved', p_approved
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_event_promotion(UUID, BOOLEAN, TEXT, TEXT) TO authenticated;

-- Step 14: Function to get pending admin tasks
CREATE OR REPLACE FUNCTION public.get_pending_admin_tasks()
RETURNS TABLE (
  task_type TEXT,
  task_count BIGINT,
  oldest_task_date TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can view pending tasks';
  END IF;
  
  RETURN QUERY
  SELECT 'event_claims' as task_type, COUNT(*) as task_count, MIN(created_at) as oldest_task_date
  FROM public.event_claims
  WHERE claim_status = 'pending'
  UNION ALL
  SELECT 'promotions' as task_type, COUNT(*) as task_count, MIN(created_at) as oldest_task_date
  FROM public.event_promotions
  WHERE promotion_status = 'pending'
  UNION ALL
  SELECT 'moderation_flags' as task_type, COUNT(*) as task_count, MIN(created_at) as oldest_task_date
  FROM public.moderation_flags
  WHERE flag_status = 'pending';
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_pending_admin_tasks() TO authenticated;

-- Step 15: Function to flag content
CREATE OR REPLACE FUNCTION public.flag_content(
  p_content_type TEXT,
  p_content_id UUID,
  p_flag_reason TEXT,
  p_flag_details TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_flag_id UUID;
BEGIN
  -- Create flag
  INSERT INTO public.moderation_flags (
    flagged_by_user_id,
    content_type,
    content_id,
    flag_reason,
    flag_details,
    flag_status
  ) VALUES (
    auth.uid(),
    p_content_type,
    p_content_id,
    p_flag_reason,
    p_flag_details,
    'pending'
  )
  ON CONFLICT (flagged_by_user_id, content_type, content_id)
  DO UPDATE SET
    flag_reason = EXCLUDED.flag_reason,
    flag_details = EXCLUDED.flag_details,
    updated_at = now()
  RETURNING id INTO v_flag_id;
  
  -- Notify admins
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    data
  )
  SELECT 
    p.user_id,
    'content_flagged',
    'New Content Flagged',
    'A user has flagged ' || p_content_type || ' for review',
    jsonb_build_object(
      'flag_id', v_flag_id,
      'content_type', p_content_type,
      'content_id', p_content_id,
      'reason', p_flag_reason
    )
  FROM public.profiles p
  WHERE p.account_type = 'admin';
  
  RETURN v_flag_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.flag_content(TEXT, UUID, TEXT, TEXT) TO authenticated;

-- Step 16: Function to promote event
CREATE OR REPLACE FUNCTION public.promote_event(
  p_event_id UUID,
  p_promotion_tier TEXT,
  p_starts_at TIMESTAMPTZ,
  p_expires_at TIMESTAMPTZ,
  p_target_cities TEXT[] DEFAULT NULL,
  p_target_genres TEXT[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_promotion_id UUID;
  v_price DECIMAL(10,2);
BEGIN
  -- Check if user owns the event
  IF NOT EXISTS (
    SELECT 1 FROM public.jambase_events
    WHERE id = p_event_id
    AND (
      created_by_user_id = auth.uid()
      OR claimed_by_creator_id = auth.uid()
    )
  ) THEN
    RAISE EXCEPTION 'You can only promote events you own or have claimed';
  END IF;
  
  -- Set pricing based on tier (placeholder - should be configurable)
  v_price := CASE p_promotion_tier
    WHEN 'basic' THEN 49.99
    WHEN 'premium' THEN 149.99
    WHEN 'featured' THEN 499.99
    ELSE 0
  END;
  
  -- Create promotion
  INSERT INTO public.event_promotions (
    event_id,
    promoted_by_user_id,
    promotion_tier,
    promotion_status,
    price_paid,
    payment_status,
    starts_at,
    expires_at,
    target_cities,
    target_genres
  ) VALUES (
    p_event_id,
    auth.uid(),
    p_promotion_tier,
    'pending', -- Requires admin approval
    v_price,
    'pending',
    p_starts_at,
    p_expires_at,
    p_target_cities,
    p_target_genres
  )
  RETURNING id INTO v_promotion_id;
  
  -- Notify admins
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    data
  )
  SELECT 
    p.user_id,
    'promotion_requested',
    'New Promotion Request',
    'A user has requested event promotion',
    jsonb_build_object(
      'promotion_id', v_promotion_id,
      'event_id', p_event_id,
      'tier', p_promotion_tier
    )
  FROM public.profiles p
  WHERE p.account_type = 'admin';
  
  RETURN v_promotion_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_event(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[], TEXT[]) TO authenticated;

-- ============================================
-- PART 5: UPDATE NOTIFICATIONS CONSTRAINT
-- ============================================

-- Step 17: Update notifications constraint
DO $$
BEGIN
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  
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
    'venue_new_event',
    'venue_profile_updated',
    'account_upgrade_request',
    'account_upgraded',
    'subscription_expiring',
    'subscription_expired',
    'event_claim_request',
    'event_claim_approved',
    'event_claim_rejected',
    'event_published',
    'event_cancelled',
    'event_rescheduled',
    'promotion_requested',
    'promotion_approved',
    'promotion_rejected',
    'promotion_expiring',
    'content_flagged',
    'content_moderated'
  ));
END $$;

-- ============================================
-- PART 6: HELPFUL COMMENTS
-- ============================================

COMMENT ON TABLE public.event_promotions IS 'Tracks event promotion requests and active promotions';
COMMENT ON TABLE public.admin_actions IS 'Audit log for all admin actions on the platform';
COMMENT ON TABLE public.moderation_flags IS 'User-reported content for admin review';

COMMENT ON FUNCTION public.review_event_promotion IS 'Admin function to approve/reject event promotions';
COMMENT ON FUNCTION public.get_pending_admin_tasks IS 'Get count of pending admin tasks';
COMMENT ON FUNCTION public.flag_content IS 'User function to flag inappropriate content';
COMMENT ON FUNCTION public.promote_event IS 'Create event promotion request';

-- Verification
SELECT 
  'Phase 3 Admin & Promotion System Installed' as status,
  COUNT(*) FILTER (WHERE table_name = 'event_promotions') as promotions_table,
  COUNT(*) FILTER (WHERE table_name = 'admin_actions') as admin_actions_table,
  COUNT(*) FILTER (WHERE table_name = 'moderation_flags') as moderation_flags_table
FROM information_schema.tables
WHERE table_schema = 'public' 
  AND table_name IN ('event_promotions', 'admin_actions', 'moderation_flags');

