-- ============================================
-- ADD PROMOTION DISPLAY FIELDS TO JAMBASE_EVENTS
-- ============================================
-- Adds promotion visibility columns and creates efficient views for promoted events

-- Step 1: Add promotion display columns to jambase_events
ALTER TABLE public.jambase_events 
ADD COLUMN IF NOT EXISTS active_promotion_id UUID REFERENCES public.event_promotions(id),
ADD COLUMN IF NOT EXISTS promotion_tier TEXT CHECK (promotion_tier IN ('basic', 'premium', 'featured')),
ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN DEFAULT false;

-- Step 2: Create indexes for promotion fields
CREATE INDEX IF NOT EXISTS idx_jambase_events_promotion_tier ON public.jambase_events(promotion_tier);
CREATE INDEX IF NOT EXISTS idx_jambase_events_is_promoted ON public.jambase_events(is_promoted);
CREATE INDEX IF NOT EXISTS idx_jambase_events_active_promotion ON public.jambase_events(active_promotion_id);

-- Step 3: Create view for promoted events with efficient querying
CREATE OR REPLACE VIEW public.v_promoted_events AS
SELECT 
  je.*,
  ep.id as promotion_id,
  ep.promotion_tier,
  ep.promotion_status,
  ep.starts_at as promotion_starts_at,
  ep.expires_at as promotion_expires_at,
  ep.impressions,
  ep.clicks,
  ep.conversions,
  ep.price_paid,
  ep.currency,
  p.name as promoter_name,
  p.avatar_url as promoter_avatar
FROM public.jambase_events je
LEFT JOIN public.event_promotions ep ON je.active_promotion_id = ep.id
LEFT JOIN public.profiles p ON ep.promoted_by_user_id = p.user_id
WHERE je.is_promoted = true 
  AND ep.promotion_status = 'active'
  AND ep.starts_at <= now()
  AND ep.expires_at >= now();

-- Step 4: Create trigger function to update promotion fields
CREATE OR REPLACE FUNCTION public.update_event_promotion_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update jambase_events when promotion status changes
  IF TG_OP = 'UPDATE' AND OLD.promotion_status != NEW.promotion_status THEN
    IF NEW.promotion_status = 'active' THEN
      -- Set event as promoted
      UPDATE public.jambase_events
      SET 
        is_promoted = true,
        promotion_tier = NEW.promotion_tier,
        active_promotion_id = NEW.id,
        updated_at = now()
      WHERE id = NEW.event_id;
    ELSIF NEW.promotion_status IN ('expired', 'paused', 'rejected') THEN
      -- Remove promotion from event
      UPDATE public.jambase_events
      SET 
        is_promoted = false,
        promotion_tier = NULL,
        active_promotion_id = NULL,
        updated_at = now()
      WHERE id = NEW.event_id;
    END IF;
  ELSIF TG_OP = 'INSERT' AND NEW.promotion_status = 'active' THEN
    -- Set event as promoted for new active promotions
    UPDATE public.jambase_events
    SET 
      is_promoted = true,
      promotion_tier = NEW.promotion_tier,
      active_promotion_id = NEW.id,
      updated_at = now()
    WHERE id = NEW.event_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 5: Create trigger on event_promotions table
DROP TRIGGER IF EXISTS trigger_update_event_promotion_fields ON public.event_promotions;
CREATE TRIGGER trigger_update_event_promotion_fields
  AFTER INSERT OR UPDATE OF promotion_status ON public.event_promotions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_event_promotion_fields();

-- Step 6: Create function to update promotion metrics from interactions
CREATE OR REPLACE FUNCTION public.update_promotion_metrics_from_interactions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_promotion_id UUID;
BEGIN
  -- Check if this interaction is for a promoted event
  SELECT ep.id INTO v_promotion_id
  FROM public.jambase_events je
  JOIN public.event_promotions ep ON je.active_promotion_id = ep.id
  WHERE je.id = NEW.entity_id
    AND je.is_promoted = true
    AND ep.promotion_status = 'active';

  IF v_promotion_id IS NOT NULL THEN
    -- Update promotion metrics based on interaction type
    IF NEW.event_type = 'view' THEN
      UPDATE public.event_promotions
      SET impressions = impressions + 1,
          updated_at = now()
      WHERE id = v_promotion_id;
    ELSIF NEW.event_type = 'click' THEN
      UPDATE public.event_promotions
      SET clicks = clicks + 1,
          updated_at = now()
      WHERE id = v_promotion_id;
    ELSIF NEW.event_type IN ('interest', 'ticket_click') THEN
      UPDATE public.event_promotions
      SET conversions = conversions + 1,
          updated_at = now()
      WHERE id = v_promotion_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Step 7: Create trigger on user_interactions for promotion metrics
DROP TRIGGER IF EXISTS trigger_update_promotion_metrics ON public.user_interactions;
CREATE TRIGGER trigger_update_promotion_metrics
  AFTER INSERT ON public.user_interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_promotion_metrics_from_interactions();

-- Step 8: Update promote_event function to auto-approve Basic tier
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
  v_auto_approve BOOLEAN := false;
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
  
  -- Set pricing based on tier
  v_price := CASE p_promotion_tier
    WHEN 'basic' THEN 49.99
    WHEN 'premium' THEN 149.99
    WHEN 'featured' THEN 499.99
    ELSE 0
  END;
  
  -- Auto-approve Basic tier if event has complete info
  IF p_promotion_tier = 'basic' THEN
    -- Check if event has required fields for auto-approval
    IF EXISTS (
      SELECT 1 FROM public.jambase_events
      WHERE id = p_event_id
      AND title IS NOT NULL
      AND artist_name IS NOT NULL
      AND venue_name IS NOT NULL
      AND event_date IS NOT NULL
    ) THEN
      v_auto_approve := true;
    END IF;
  END IF;
  
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
    CASE WHEN v_auto_approve THEN 'active' ELSE 'pending' END,
    v_price,
    CASE WHEN v_auto_approve THEN 'completed' ELSE 'pending' END,
    p_starts_at,
    p_expires_at,
    p_target_cities,
    p_target_genres
  )
  RETURNING id INTO v_promotion_id;
  
  -- Notify admins only if not auto-approved
  IF NOT v_auto_approve THEN
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
  END IF;
  
  RETURN v_promotion_id;
END;
$$;

-- Step 9: Update review_event_promotion function to handle jambase_events updates
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
  
  -- Update event promotion tier if approved (trigger will handle jambase_events update)
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

-- Step 10: Grant permissions
GRANT SELECT ON public.v_promoted_events TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_promotion_metrics_from_interactions() TO authenticated;

-- Verification
SELECT 
  'Promotion Display Fields Added' as status,
  COUNT(*) FILTER (WHERE column_name = 'active_promotion_id') as active_promotion_id_added,
  COUNT(*) FILTER (WHERE column_name = 'promotion_tier') as promotion_tier_added,
  COUNT(*) FILTER (WHERE column_name = 'is_promoted') as is_promoted_added
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'jambase_events'
  AND column_name IN ('active_promotion_id', 'promotion_tier', 'is_promoted');
