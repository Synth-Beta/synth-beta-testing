-- Create account_upgrade_requests table for Creator/Business account requests
-- Users request an upgrade, admins review and approve/deny in the dashboard

CREATE TABLE IF NOT EXISTS public.account_upgrade_requests (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_account_type account_type NOT NULL CHECK (requested_account_type IN ('creator', 'business')),
  business_info JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'denied')),
  denial_reason TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_account_upgrade_requests_user_id ON public.account_upgrade_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_account_upgrade_requests_status ON public.account_upgrade_requests(status);
CREATE INDEX IF NOT EXISTS idx_account_upgrade_requests_created_at ON public.account_upgrade_requests(created_at DESC);

-- Enable Row Level Security
ALTER TABLE public.account_upgrade_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own requests
DROP POLICY IF EXISTS "Users can view their own upgrade requests" ON public.account_upgrade_requests;
CREATE POLICY "Users can view their own upgrade requests" 
ON public.account_upgrade_requests FOR SELECT 
USING (auth.uid() = user_id);

-- Users can create their own requests
DROP POLICY IF EXISTS "Users can create their own upgrade requests" ON public.account_upgrade_requests;
CREATE POLICY "Users can create their own upgrade requests" 
ON public.account_upgrade_requests FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Admins can view all requests
DROP POLICY IF EXISTS "Admins can view all upgrade requests" ON public.account_upgrade_requests;
CREATE POLICY "Admins can view all upgrade requests" 
ON public.account_upgrade_requests FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- Admins can update all requests (approve/deny)
DROP POLICY IF EXISTS "Admins can update all upgrade requests" ON public.account_upgrade_requests;
CREATE POLICY "Admins can update all upgrade requests" 
ON public.account_upgrade_requests FOR UPDATE 
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- Add helpful comments
COMMENT ON TABLE public.account_upgrade_requests IS 'Stores user requests to upgrade to Creator or Business accounts';
COMMENT ON COLUMN public.account_upgrade_requests.requested_account_type IS 'Type of account requested: creator or business';
COMMENT ON COLUMN public.account_upgrade_requests.business_info IS 'JSONB containing business details (company name, tax ID, website, etc.)';
COMMENT ON COLUMN public.account_upgrade_requests.status IS 'Request status: pending, approved, or denied';
COMMENT ON COLUMN public.account_upgrade_requests.reviewed_by IS 'Admin user who reviewed the request';

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_account_upgrade_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to update updated_at on row update
DROP TRIGGER IF EXISTS trigger_account_upgrade_requests_updated_at ON public.account_upgrade_requests;
CREATE TRIGGER trigger_account_upgrade_requests_updated_at
  BEFORE UPDATE ON public.account_upgrade_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.update_account_upgrade_requests_updated_at();

-- Function for admins to approve/deny requests
CREATE OR REPLACE FUNCTION public.admin_review_upgrade_request(
  p_request_id UUID,
  p_status TEXT,
  p_denial_reason TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_user_id UUID;
  v_requested_type account_type;
BEGIN
  -- Only admins can execute this
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can review upgrade requests';
  END IF;
  
  -- Get request details
  SELECT user_id, requested_account_type INTO v_user_id, v_requested_type
  FROM public.account_upgrade_requests
  WHERE id = p_request_id;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Request not found';
  END IF;
  
  -- Update the request
  UPDATE public.account_upgrade_requests
  SET 
    status = p_status,
    denial_reason = p_denial_reason,
    reviewed_by = auth.uid(),
    reviewed_at = NOW()
  WHERE id = p_request_id;
  
  -- If approved, upgrade the user's account
  IF p_status = 'approved' THEN
    UPDATE public.profiles
    SET 
      account_type = v_requested_type,
      verification_level = 'email',
      subscription_tier = 'free'
    WHERE user_id = v_user_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_review_upgrade_request(UUID, TEXT, TEXT) TO authenticated;

COMMENT ON FUNCTION public.admin_review_upgrade_request IS 'Admin function to approve or deny account upgrade requests';

