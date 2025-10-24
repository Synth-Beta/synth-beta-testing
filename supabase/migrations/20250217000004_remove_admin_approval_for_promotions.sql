-- ============================================
-- REMOVE ADMIN APPROVAL FOR PROMOTIONS
-- ============================================
-- Makes promotions active immediately without admin approval

-- Step 1: Update the promote_event function to create active promotions
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
  
  -- Create promotion with 'active' status (no admin approval needed)
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
    'active', -- Immediately active, no admin approval
    v_price,
    'completed', -- Assume payment is completed for now
    p_starts_at,
    p_expires_at,
    p_target_cities,
    p_target_genres
  )
  RETURNING id INTO v_promotion_id;
  
  -- The trigger will automatically update jambase_events with promotion fields
  -- No need to notify admins since no approval is required
  
  RETURN v_promotion_id;
END;
$$;

-- Step 2: Update the trigger function to handle immediate activation
CREATE OR REPLACE FUNCTION public.update_event_promotion_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Handle INSERT of new active promotions
  IF TG_OP = 'INSERT' AND NEW.promotion_status = 'active' THEN
    -- Set event as promoted immediately
    UPDATE public.jambase_events
    SET 
      is_promoted = true,
      promotion_tier = NEW.promotion_tier,
      active_promotion_id = NEW.id,
      updated_at = now()
    WHERE id = NEW.event_id;
  END IF;
  
  -- Handle UPDATE of promotion status
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
    ELSIF NEW.promotion_status IN ('expired', 'paused', 'rejected', 'cancelled') THEN
      -- Remove promotion from event
      UPDATE public.jambase_events
      SET 
        is_promoted = false,
        promotion_tier = NULL,
        active_promotion_id = NULL,
        updated_at = now()
      WHERE id = NEW.event_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Step 3: Update the trigger to fire on INSERT as well
DROP TRIGGER IF EXISTS trigger_update_event_promotion_fields ON public.event_promotions;
CREATE TRIGGER trigger_update_event_promotion_fields
  AFTER INSERT OR UPDATE OF promotion_status ON public.event_promotions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_event_promotion_fields();

-- Step 4: Add a function to automatically expire promotions
CREATE OR REPLACE FUNCTION public.expire_promotions()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update expired promotions
  UPDATE public.event_promotions
  SET 
    promotion_status = 'expired',
    updated_at = now()
  WHERE promotion_status = 'active'
    AND expires_at < now();
    
  -- The trigger will automatically update jambase_events
END;
$$;

-- Step 5: Create a scheduled job to expire promotions (if using pg_cron)
-- This would need to be set up in your Supabase dashboard or via cron job
-- Example: SELECT cron.schedule('expire-promotions', '0 * * * *', 'SELECT public.expire_promotions();');

-- Step 6: Grant permissions
GRANT EXECUTE ON FUNCTION public.promote_event(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT[], TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_event_promotion_fields() TO authenticated;
GRANT EXECUTE ON FUNCTION public.expire_promotions() TO authenticated;

-- Step 7: Update any existing pending promotions to active (optional)
-- Uncomment the following lines if you want to activate existing pending promotions
-- UPDATE public.event_promotions
-- SET promotion_status = 'active', updated_at = now()
-- WHERE promotion_status = 'pending';

-- Verification
SELECT 
  'Promotions now activate immediately' as status,
  'No admin approval required - promotions are active upon creation' as description;
