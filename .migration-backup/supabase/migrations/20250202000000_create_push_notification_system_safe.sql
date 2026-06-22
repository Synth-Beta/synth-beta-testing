-- ============================================
-- PUSH NOTIFICATION SYSTEM SETUP (SAFE VERSION)
-- ============================================
-- This migration creates the infrastructure for Apple Push Notifications
-- Optimized to avoid overloading Supabase
-- Safe to run multiple times (idempotent)

-- ============================================
-- STEP 1: DEVICE TOKENS TABLE
-- ============================================
-- Store device tokens for push notifications

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_id TEXT,
  app_version TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_token)
);

-- Indexes (created separately to avoid locking issues)
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id 
  ON public.device_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_device_tokens_active 
  ON public.device_tokens(user_id, is_active) 
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_device_tokens_platform 
  ON public.device_tokens(platform, is_active);

CREATE INDEX IF NOT EXISTS idx_device_tokens_user_platform 
  ON public.device_tokens(user_id, platform, is_active);

-- Enable RLS
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can manage their own device tokens
DROP POLICY IF EXISTS "Users can manage own device tokens" ON public.device_tokens;
CREATE POLICY "Users can manage own device tokens"
  ON public.device_tokens FOR ALL
  USING (auth.uid() = user_id);

-- RLS Policy: Service role can manage all device tokens
DROP POLICY IF EXISTS "Service role can manage device tokens" ON public.device_tokens;
CREATE POLICY "Service role can manage device tokens"
  ON public.device_tokens FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.device_tokens IS 
  'Stores device tokens for push notifications. Users can register/unregister their devices.';

-- ============================================
-- STEP 2: PUSH NOTIFICATION QUEUE TABLE
-- ============================================
-- Queue for push notifications to be sent (optional, for reliability)

CREATE TABLE IF NOT EXISTS public.push_notification_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  notification_id UUID REFERENCES public.notifications(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data JSONB DEFAULT '{}'::jsonb,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

-- Indexes (created separately for safety)
CREATE INDEX IF NOT EXISTS idx_push_queue_status 
  ON public.push_notification_queue(status, created_at);

CREATE INDEX IF NOT EXISTS idx_push_queue_user 
  ON public.push_notification_queue(user_id, status);

CREATE INDEX IF NOT EXISTS idx_push_queue_notification 
  ON public.push_notification_queue(notification_id);

CREATE INDEX IF NOT EXISTS idx_push_queue_pending 
  ON public.push_notification_queue(created_at)
  WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.push_notification_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policy (service role only - backend manages this)
DROP POLICY IF EXISTS "Service role can manage push queue" ON public.push_notification_queue;
CREATE POLICY "Service role can manage push queue"
  ON public.push_notification_queue FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.push_notification_queue IS 
  'Queue for push notifications. Processed by background worker. Users cannot access this directly.';

-- ============================================
-- STEP 3: FUNCTION TO REGISTER DEVICE TOKEN
-- ============================================
-- Safe, simple function to register/unregister device tokens

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

COMMENT ON FUNCTION public.register_device_token IS 
  'Registers or updates a device token for push notifications. Safe to call multiple times.';

-- ============================================
-- STEP 4: FUNCTION TO UNREGISTER DEVICE TOKEN
-- ============================================
-- Safe function to deactivate device tokens (on logout)

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

COMMENT ON FUNCTION public.unregister_device_token IS 
  'Deactivates a device token when user logs out. Safe to call multiple times.';

-- ============================================
-- OPTIMIZATION: Clean up old queue items (optional)
-- ============================================
-- Function to clean up old processed queue items (prevents table bloat)
-- Call this periodically or via cron job

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
  'Cleans up old processed queue items. Run this periodically to prevent table bloat. Default: 7 days.';

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
-- Ensure service role has access
GRANT USAGE ON SCHEMA public TO service_role;
GRANT ALL ON public.device_tokens TO service_role;
GRANT ALL ON public.push_notification_queue TO service_role;

