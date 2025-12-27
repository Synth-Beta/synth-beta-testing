-- ============================================================
-- Create table for missing entity requests
-- ============================================================
-- Users can request missing artists, venues, or events
-- These requests will be reviewed and added by admins

CREATE TABLE IF NOT EXISTS public.missing_entity_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('artist', 'venue', 'event')),
  entity_name TEXT NOT NULL,
  entity_description TEXT,
  entity_location TEXT, -- For venues: address/city/state
  entity_date TEXT, -- For events: event date
  entity_url TEXT, -- Optional URL (website, social media, etc.)
  entity_image_url TEXT, -- Optional image URL
  additional_info JSONB DEFAULT '{}', -- Additional context (genres, capacity, etc.)
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'duplicate', 'added')),
  reviewed_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  review_notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_missing_entity_requests_user_id ON public.missing_entity_requests(user_id);
CREATE INDEX IF NOT EXISTS idx_missing_entity_requests_entity_type ON public.missing_entity_requests(entity_type);
CREATE INDEX IF NOT EXISTS idx_missing_entity_requests_status ON public.missing_entity_requests(status);
CREATE INDEX IF NOT EXISTS idx_missing_entity_requests_created_at ON public.missing_entity_requests(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_missing_entity_requests_pending ON public.missing_entity_requests(entity_type, status) WHERE status = 'pending';

-- Enable RLS
ALTER TABLE public.missing_entity_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can insert their own requests
CREATE POLICY "Users can insert their own missing entity requests"
  ON public.missing_entity_requests
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own requests
CREATE POLICY "Users can view their own missing entity requests"
  ON public.missing_entity_requests
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Admins can view all requests
CREATE POLICY "Admins can view all missing entity requests"
  ON public.missing_entity_requests
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid()
      AND account_type = 'admin'
    )
  );

-- Admins can update requests (for reviewing)
CREATE POLICY "Admins can update missing entity requests"
  ON public.missing_entity_requests
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid()
      AND account_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid()
      AND account_type = 'admin'
    )
  );

-- Grant permissions
GRANT SELECT, INSERT ON public.missing_entity_requests TO authenticated;
GRANT UPDATE ON public.missing_entity_requests TO authenticated; -- Users can update their own, admins can update all

-- Add comment
COMMENT ON TABLE public.missing_entity_requests IS 'Stores user requests for missing artists, venues, or events. These are reviewed by admins before being added to the database.';
COMMENT ON COLUMN public.missing_entity_requests.entity_type IS 'Type of entity being requested: artist, venue, or event';
COMMENT ON COLUMN public.missing_entity_requests.status IS 'Request status: pending (awaiting review), approved (will be added), rejected (not suitable), duplicate (already exists), added (has been added to database)';
COMMENT ON COLUMN public.missing_entity_requests.additional_info IS 'JSONB field for additional context like genres (for artists), capacity (for venues), ticket info (for events), etc.';

