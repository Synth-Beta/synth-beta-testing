-- ============================================
-- PUSH NOTIFICATION SYSTEM SETUP
-- ============================================
-- This migration creates the infrastructure for Apple Push Notifications

-- ============================================
-- STEP 1: DEVICE TOKENS TABLE
-- ============================================
-- Store device tokens for push notifications

CREATE TABLE IF NOT EXISTS public.device_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  device_token TEXT NOT NULL,
  platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
  device_id TEXT, -- Optional: unique device identifier
  app_version TEXT, -- Optional: app version for debugging
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, device_token)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_device_tokens_user_id 
  ON public.device_tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_device_tokens_active 
  ON public.device_tokens(user_id, is_active) 
  WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_device_tokens_platform 
  ON public.device_tokens(platform);

-- Enable RLS
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view their own device tokens"
  ON public.device_tokens FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own device tokens"
  ON public.device_tokens FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own device tokens"
  ON public.device_tokens FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own device tokens"
  ON public.device_tokens FOR DELETE
  USING (auth.uid() = user_id);

-- Function to update updated_at
CREATE OR REPLACE FUNCTION update_device_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_device_tokens_updated_at
  BEFORE UPDATE ON public.device_tokens
  FOR EACH ROW
  EXECUTE FUNCTION update_device_tokens_updated_at();

COMMENT ON TABLE public.device_tokens IS 
  'Stores device tokens for push notifications. One user can have multiple devices.';

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
  data JSONB,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_push_queue_status 
  ON public.push_notification_queue(status, created_at);

-- Enable RLS
ALTER TABLE public.push_notification_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policy (service role only)
CREATE POLICY "Service role can manage push queue"
  ON public.push_notification_queue FOR ALL
  USING (auth.role() = 'service_role');

COMMENT ON TABLE public.push_notification_queue IS 
  'Queue for push notifications. Processed by background worker.';

-- ============================================
-- STEP 3: FUNCTION TO REGISTER DEVICE TOKEN
-- ============================================

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
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Insert or update device token
  INSERT INTO public.device_tokens (
    user_id,
    device_token,
    platform,
    device_id,
    app_version,
    is_active
  ) VALUES (
    v_user_id,
    p_device_token,
    p_platform,
    p_device_id,
    p_app_version,
    true
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

GRANT EXECUTE ON FUNCTION public.register_device_token TO authenticated;

COMMENT ON FUNCTION public.register_device_token IS 
  'Registers or updates a device token for push notifications';

-- ============================================
-- STEP 4: FUNCTION TO UNREGISTER DEVICE TOKEN
-- ============================================

CREATE OR REPLACE FUNCTION public.unregister_device_token(
  p_device_token TEXT
)
RETURNS void
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

  -- Deactivate device token
  UPDATE public.device_tokens
  SET is_active = false,
      updated_at = now()
  WHERE user_id = v_user_id
    AND device_token = p_device_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unregister_device_token TO authenticated;

COMMENT ON FUNCTION public.unregister_device_token IS 
  'Deactivates a device token when user logs out or uninstalls app';

