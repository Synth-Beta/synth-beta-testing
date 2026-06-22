-- ============================================
-- CREATE PASSPORT_TIMELINE TABLE
-- Store pinned and auto-selected timeline highlights
-- ============================================

CREATE TABLE IF NOT EXISTS public.passport_timeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  event_id UUID REFERENCES public.events(id) ON DELETE SET NULL,
  review_id UUID REFERENCES public.reviews(id) ON DELETE SET NULL,
  is_pinned BOOLEAN DEFAULT false,
  is_auto_selected BOOLEAN DEFAULT false,
  significance TEXT, -- Why this moment matters
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  -- Either event_id or review_id must be provided (enforced in application layer)
  CONSTRAINT passport_timeline_event_or_review_check 
    CHECK (event_id IS NOT NULL OR review_id IS NOT NULL)
);

-- Create unique constraint to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS passport_timeline_user_event_review_unique 
  ON public.passport_timeline(user_id, COALESCE(event_id, '00000000-0000-0000-0000-000000000000'::UUID), COALESCE(review_id, '00000000-0000-0000-0000-000000000000'::UUID));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_passport_timeline_user_id 
  ON public.passport_timeline(user_id);

CREATE INDEX IF NOT EXISTS idx_passport_timeline_event_id 
  ON public.passport_timeline(event_id) WHERE event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_passport_timeline_review_id 
  ON public.passport_timeline(review_id) WHERE review_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_passport_timeline_pinned 
  ON public.passport_timeline(user_id, is_pinned) WHERE is_pinned = true;

CREATE INDEX IF NOT EXISTS idx_passport_timeline_created_at 
  ON public.passport_timeline(user_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.passport_timeline ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view their own passport timeline" ON public.passport_timeline;
DROP POLICY IF EXISTS "Users can insert their own passport timeline" ON public.passport_timeline;
DROP POLICY IF EXISTS "Users can update their own passport timeline" ON public.passport_timeline;
DROP POLICY IF EXISTS "Users can delete their own passport timeline" ON public.passport_timeline;

CREATE POLICY "Users can view their own passport timeline"
  ON public.passport_timeline
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own passport timeline"
  ON public.passport_timeline
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own passport timeline"
  ON public.passport_timeline
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own passport timeline"
  ON public.passport_timeline
  FOR DELETE
  USING (auth.uid() = user_id);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON public.passport_timeline TO authenticated;

-- Add comments
COMMENT ON TABLE public.passport_timeline IS 'Timeline highlights: pinned (max 5) and auto-selected moments from user journey';
COMMENT ON COLUMN public.passport_timeline.is_pinned IS 'User-pinned highlight (max 5 per user, enforced in application)';
COMMENT ON COLUMN public.passport_timeline.is_auto_selected IS 'Auto-selected by Synth algorithm based on significance';

