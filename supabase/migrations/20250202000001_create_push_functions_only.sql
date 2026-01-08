-- ============================================
-- PUSH NOTIFICATION FUNCTIONS ONLY
-- ============================================
-- Safe functions for push notification system
-- Use this if tables already exist

-- ============================================
-- FUNCTION 1: REGISTER DEVICE TOKEN
-- ============================================
-- Registers or updates a device token for push notifications

CREATE OR REPLACE FUNCTION public.register_device_token(
  p_device_token TEXT,
  p_platform TEXT,
  p_device_id TEXT DEFAULT NULL,
  p_app_version TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_token_id UUID;
BEGIN
  -- Get current user (must be authenticated)
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Validate platform
  IF p_platform NOT IN ('ios', 'android') THEN
    RAISE EXCEPTION 'Platform must be ios or android';
  END IF;

  -- Insert or update device token (ON CONFLICT handles duplicates safely)
  INSERT INTO public.device_tokens (
    user_id,
    device_token,
    platform,
    device_id,
    app_version,
    is_active,
    updated_at
  ) VALUES (
    v_user_id,
    p_device_token,
    p_platform,
    p_device_id,
    p_app_version,
    true,
    now()
  )
  ON CONFLICT (user_id, device_token) 
  DO UPDATE SET
    is_active = true,
    device_id = COALESCE(EXCLUDED.device_id, device_tokens.device_id),
    app_version = COALESCE(EXCLUDED.app_version, device_tokens.app_version),
    updated_at = now()
  RETURNING id INTO v_token_id;

  RETURN v_token_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.register_device_token TO authenticated;

COMMENT ON FUNCTION public.register_device_token IS 
  'Registers or updates a device token for push notifications. Safe to call multiple times.';

-- ============================================
-- FUNCTION 2: UNREGISTER DEVICE TOKEN
-- ============================================
-- Deactivates a device token (on logout/uninstall)

CREATE OR REPLACE FUNCTION public.unregister_device_token(
  p_device_token TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Deactivate device token (soft delete - don't actually delete)
  UPDATE public.device_tokens
  SET is_active = false,
      updated_at = now()
  WHERE user_id = v_user_id
    AND device_token = p_device_token;

  RETURN FOUND;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION public.unregister_device_token TO authenticated;

COMMENT ON FUNCTION public.unregister_device_token IS 
  'Deactivates a device token when user logs out. Safe to call multiple times.';

-- ============================================
-- FUNCTION 3: CLEANUP QUEUE (OPTIONAL)
-- ============================================
-- Cleans up old processed queue items (prevents table bloat)
-- Run this periodically via cron or scheduled job

CREATE OR REPLACE FUNCTION public.cleanup_push_notification_queue(
  p_days_old INTEGER DEFAULT 7
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted_count INTEGER;
BEGIN
  -- Only service role can run this
  IF auth.role() != 'service_role' THEN
    RAISE EXCEPTION 'Only service role can run cleanup';
  END IF;

  -- Delete old processed items (sent or failed, older than X days)
  DELETE FROM public.push_notification_queue
  WHERE status IN ('sent', 'failed')
    AND created_at < now() - (p_days_old || ' days')::INTERVAL;

  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  
  RETURN v_deleted_count;
END;
$$;

COMMENT ON FUNCTION public.cleanup_push_notification_queue IS 
  'Cleans up old processed queue items. Run periodically to prevent table bloat. Default: 7 days.';

