-- ============================================
-- USER BLOCKING & ENHANCED MODERATION SYSTEM
-- ============================================
-- Adds user blocking and enhanced content escalation features

-- Step 1: Create user_blocks table
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  blocker_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  block_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  -- Prevent blocking yourself
  CONSTRAINT no_self_block CHECK (blocker_user_id != blocked_user_id),
  -- Prevent duplicate blocks
  UNIQUE(blocker_user_id, blocked_user_id)
);

-- Step 2: Create indexes for user_blocks
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker ON public.user_blocks(blocker_user_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked ON public.user_blocks(blocked_user_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_created ON public.user_blocks(created_at);

-- Step 3: Enable RLS on user_blocks
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policies for user_blocks
DROP POLICY IF EXISTS "Users can view their own blocks" ON public.user_blocks;
CREATE POLICY "Users can view their own blocks"
ON public.user_blocks FOR SELECT
USING (auth.uid() = blocker_user_id);

DROP POLICY IF EXISTS "Users can create blocks" ON public.user_blocks;
CREATE POLICY "Users can create blocks"
ON public.user_blocks FOR INSERT
WITH CHECK (auth.uid() = blocker_user_id);

DROP POLICY IF EXISTS "Users can delete their own blocks" ON public.user_blocks;
CREATE POLICY "Users can delete their own blocks"
ON public.user_blocks FOR DELETE
USING (auth.uid() = blocker_user_id);

DROP POLICY IF EXISTS "Admins can view all blocks" ON public.user_blocks;
CREATE POLICY "Admins can view all blocks"
ON public.user_blocks FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- Step 5: Add moderation status to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS moderation_status TEXT DEFAULT 'good_standing' 
  CHECK (moderation_status IN ('good_standing', 'warned', 'restricted', 'suspended', 'banned')),
ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_warned_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS suspended_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS ban_reason TEXT;

-- Step 6: Create index for moderation status
CREATE INDEX IF NOT EXISTS idx_profiles_moderation_status ON public.profiles(moderation_status);

-- Step 7: Function to block user
CREATE OR REPLACE FUNCTION public.block_user(
  p_blocked_user_id UUID,
  p_block_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_block_id UUID;
BEGIN
  -- Prevent self-blocking
  IF auth.uid() = p_blocked_user_id THEN
    RAISE EXCEPTION 'You cannot block yourself';
  END IF;
  
  -- Create block
  INSERT INTO public.user_blocks (
    blocker_user_id,
    blocked_user_id,
    block_reason
  ) VALUES (
    auth.uid(),
    p_blocked_user_id,
    p_block_reason
  )
  ON CONFLICT (blocker_user_id, blocked_user_id) 
  DO NOTHING
  RETURNING id INTO v_block_id;
  
  RETURN v_block_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.block_user(UUID, TEXT) TO authenticated;

-- Step 8: Function to unblock user
CREATE OR REPLACE FUNCTION public.unblock_user(
  p_blocked_user_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.user_blocks
  WHERE blocker_user_id = auth.uid()
  AND blocked_user_id = p_blocked_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unblock_user(UUID) TO authenticated;

-- Step 9: Function to check if user is blocked
CREATE OR REPLACE FUNCTION public.is_user_blocked(
  p_user_id UUID,
  p_by_user_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  v_checker_id UUID;
BEGIN
  v_checker_id := COALESCE(p_by_user_id, auth.uid());
  
  RETURN EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE blocker_user_id = v_checker_id
    AND blocked_user_id = p_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_user_blocked(UUID, UUID) TO authenticated;

-- Step 10: Function to get blocked users list
CREATE OR REPLACE FUNCTION public.get_blocked_users()
RETURNS TABLE (
  block_id UUID,
  blocked_user_id UUID,
  blocked_user_name TEXT,
  blocked_user_avatar_url TEXT,
  block_reason TEXT,
  blocked_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ub.id as block_id,
    ub.blocked_user_id,
    p.name as blocked_user_name,
    p.avatar_url as blocked_user_avatar_url,
    ub.block_reason,
    ub.created_at as blocked_at
  FROM public.user_blocks ub
  JOIN public.profiles p ON p.user_id = ub.blocked_user_id
  WHERE ub.blocker_user_id = auth.uid()
  ORDER BY ub.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_blocked_users() TO authenticated;

-- Step 11: Enhanced moderation action function
CREATE OR REPLACE FUNCTION public.moderate_content(
  p_flag_id UUID,
  p_action TEXT, -- 'remove', 'warn', 'dismiss'
  p_review_notes TEXT DEFAULT NULL,
  p_notify_user BOOLEAN DEFAULT TRUE
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_flag RECORD;
  v_content_owner_id UUID;
  v_warning_count INTEGER;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can moderate content';
  END IF;
  
  -- Get flag details
  SELECT * INTO v_flag
  FROM public.moderation_flags
  WHERE id = p_flag_id;
  
  IF v_flag.id IS NULL THEN
    RAISE EXCEPTION 'Flag not found';
  END IF;
  
  -- Update flag status
  UPDATE public.moderation_flags
  SET 
    flag_status = CASE 
      WHEN p_action = 'dismiss' THEN 'dismissed'
      ELSE 'resolved'
    END,
    reviewed_by_admin_id = auth.uid(),
    reviewed_at = now(),
    review_notes = p_review_notes,
    action_taken = p_action,
    updated_at = now()
  WHERE id = p_flag_id;
  
  -- Handle content based on action
  IF p_action = 'remove' THEN
    -- Delete the content based on type
    CASE v_flag.content_type
      WHEN 'event' THEN
        -- Get event owner
        SELECT created_by_user_id INTO v_content_owner_id
        FROM public.jambase_events
        WHERE id = v_flag.content_id;
        
        -- Delete event
        DELETE FROM public.jambase_events WHERE id = v_flag.content_id;
        
      WHEN 'review' THEN
        -- Get review owner
        SELECT user_id INTO v_content_owner_id
        FROM public.user_reviews
        WHERE id = v_flag.content_id;
        
        -- Delete review
        DELETE FROM public.user_reviews WHERE id = v_flag.content_id;
        
      WHEN 'comment' THEN
        -- Get comment owner
        SELECT user_id INTO v_content_owner_id
        FROM public.event_comments
        WHERE id = v_flag.content_id;
        
        -- Delete comment
        DELETE FROM public.event_comments WHERE id = v_flag.content_id;
        
      ELSE
        NULL;
    END CASE;
    
    -- Log admin action
    INSERT INTO public.admin_actions (
      admin_user_id,
      action_type,
      target_type,
      target_id,
      reason
    ) VALUES (
      auth.uid(),
      'content_flagged',
      v_flag.content_type,
      v_flag.content_id,
      p_review_notes
    );
    
    -- Notify content owner if requested
    IF p_notify_user AND v_content_owner_id IS NOT NULL THEN
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        data
      ) VALUES (
        v_content_owner_id,
        'content_moderated',
        'Content Removed',
        'Your ' || v_flag.content_type || ' was removed for violating our guidelines: ' || v_flag.flag_reason,
        jsonb_build_object(
          'flag_id', p_flag_id,
          'content_type', v_flag.content_type,
          'content_id', v_flag.content_id,
          'reason', v_flag.flag_reason
        )
      );
    END IF;
    
  ELSIF p_action = 'warn' THEN
    -- Get content owner
    CASE v_flag.content_type
      WHEN 'event' THEN
        SELECT created_by_user_id INTO v_content_owner_id
        FROM public.jambase_events WHERE id = v_flag.content_id;
      WHEN 'review' THEN
        SELECT user_id INTO v_content_owner_id
        FROM public.user_reviews WHERE id = v_flag.content_id;
      WHEN 'comment' THEN
        SELECT user_id INTO v_content_owner_id
        FROM public.event_comments WHERE id = v_flag.content_id;
      ELSE
        NULL;
    END CASE;
    
    -- Update user warning count
    IF v_content_owner_id IS NOT NULL THEN
      UPDATE public.profiles
      SET 
        warning_count = warning_count + 1,
        last_warned_at = now(),
        moderation_status = CASE 
          WHEN warning_count + 1 >= 3 THEN 'restricted'
          ELSE 'warned'
        END
      WHERE user_id = v_content_owner_id
      RETURNING warning_count INTO v_warning_count;
      
      -- Notify user
      IF p_notify_user THEN
        INSERT INTO public.notifications (
          user_id,
          type,
          title,
          message,
          data
        ) VALUES (
          v_content_owner_id,
          'content_moderated',
          'Content Warning',
          'Your ' || v_flag.content_type || ' received a warning: ' || v_flag.flag_reason || 
          '. This is warning #' || v_warning_count || '. Further violations may result in restrictions.',
          jsonb_build_object(
            'flag_id', p_flag_id,
            'content_type', v_flag.content_type,
            'content_id', v_flag.content_id,
            'warning_count', v_warning_count
          )
        );
      END IF;
    END IF;
  END IF;
  
  -- Notify the reporter
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    data
  ) VALUES (
    v_flag.flagged_by_user_id,
    'flag_reviewed',
    'Report Reviewed',
    'Your report has been reviewed. Action taken: ' || p_action,
    jsonb_build_object(
      'flag_id', p_flag_id,
      'action', p_action
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.moderate_content(UUID, TEXT, TEXT, BOOLEAN) TO authenticated;

-- Step 12: Update notifications constraint with new types
DO $$
BEGIN
  ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN (
    'friend_request', 'friend_accepted', 'match', 'message',
    'review_liked', 'review_commented', 'comment_replied',
    'event_interest', 'artist_followed', 'artist_new_event', 'artist_profile_updated',
    'venue_new_event', 'venue_profile_updated',
    'account_upgrade_request', 'account_upgraded',
    'subscription_expiring', 'subscription_expired',
    'event_claim_request', 'event_claim_approved', 'event_claim_rejected',
    'event_published', 'event_cancelled', 'event_rescheduled',
    'promotion_requested', 'promotion_approved', 'promotion_rejected', 'promotion_expiring',
    'content_flagged', 'content_moderated', 'flag_reviewed',
    'user_warned', 'user_restricted', 'user_suspended'
  ));
END $$;

-- Step 13: Add helpful comments
COMMENT ON TABLE public.user_blocks IS 'Tracks user blocking relationships';
COMMENT ON COLUMN public.profiles.moderation_status IS 'User moderation status: good_standing, warned, restricted, suspended, banned';
COMMENT ON COLUMN public.profiles.warning_count IS 'Number of warnings user has received';
COMMENT ON FUNCTION public.block_user IS 'Block another user from interacting';
COMMENT ON FUNCTION public.unblock_user IS 'Unblock a previously blocked user';
COMMENT ON FUNCTION public.moderate_content IS 'Admin function to moderate flagged content';

-- Verification
SELECT 
  'User Blocking & Enhanced Moderation System Installed' as status,
  COUNT(*) FILTER (WHERE table_name = 'user_blocks') as blocks_table
FROM information_schema.tables
WHERE table_schema = 'public' 
  AND table_name = 'user_blocks';

