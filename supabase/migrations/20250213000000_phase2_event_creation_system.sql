-- ============================================
-- PHASE 2: EVENT CREATION & MANAGEMENT SYSTEM
-- ============================================
-- Adds event creation capabilities for business accounts,
-- event claiming for creators, media uploads, and enhanced ticket management

-- Step 1: Add event ownership and management fields to jambase_events
ALTER TABLE public.jambase_events
ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS owned_by_account_type TEXT CHECK (owned_by_account_type IN ('user', 'creator', 'business', 'admin')),
ADD COLUMN IF NOT EXISTS claimed_by_creator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS event_status TEXT DEFAULT 'published' CHECK (event_status IN ('draft', 'published', 'cancelled', 'postponed', 'rescheduled')),
ADD COLUMN IF NOT EXISTS media_urls TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS poster_image_url TEXT,
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS age_restriction TEXT,
ADD COLUMN IF NOT EXISTS accessibility_info TEXT,
ADD COLUMN IF NOT EXISTS parking_info TEXT,
ADD COLUMN IF NOT EXISTS venue_capacity INTEGER,
ADD COLUMN IF NOT EXISTS estimated_attendance INTEGER,
ADD COLUMN IF NOT EXISTS is_featured BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS featured_until TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS promotion_tier TEXT CHECK (promotion_tier IN ('none', 'basic', 'premium', 'featured'));

-- Step 2: Create indexes for new fields
CREATE INDEX IF NOT EXISTS idx_jambase_events_created_by ON public.jambase_events(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_jambase_events_claimed_by ON public.jambase_events(claimed_by_creator_id);
CREATE INDEX IF NOT EXISTS idx_jambase_events_status ON public.jambase_events(event_status);
CREATE INDEX IF NOT EXISTS idx_jambase_events_featured ON public.jambase_events(is_featured, featured_until) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_jambase_events_promotion_tier ON public.jambase_events(promotion_tier);

-- Step 3: Create event_claims table for tracking claim requests
CREATE TABLE IF NOT EXISTS public.event_claims (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.jambase_events(id) ON DELETE CASCADE,
  claimer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  claim_status TEXT DEFAULT 'pending' CHECK (claim_status IN ('pending', 'approved', 'rejected', 'withdrawn')),
  claim_reason TEXT,
  verification_proof TEXT, -- URL to verification (social media, official website, etc.)
  reviewed_by_admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  admin_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, claimer_user_id)
);

-- Step 4: Create indexes for event_claims
CREATE INDEX IF NOT EXISTS idx_event_claims_event_id ON public.event_claims(event_id);
CREATE INDEX IF NOT EXISTS idx_event_claims_claimer_user_id ON public.event_claims(claimer_user_id);
CREATE INDEX IF NOT EXISTS idx_event_claims_status ON public.event_claims(claim_status);
CREATE INDEX IF NOT EXISTS idx_event_claims_pending ON public.event_claims(claim_status, created_at) WHERE claim_status = 'pending';

-- Step 5: Enable RLS on event_claims
ALTER TABLE public.event_claims ENABLE ROW LEVEL SECURITY;

-- Step 6: Create RLS policies for event_claims
DROP POLICY IF EXISTS "Users can view their own claims" ON public.event_claims;
CREATE POLICY "Users can view their own claims"
ON public.event_claims FOR SELECT
USING (auth.uid() = claimer_user_id);

DROP POLICY IF EXISTS "Creators can create claims" ON public.event_claims;
CREATE POLICY "Creators can create claims"
ON public.event_claims FOR INSERT
WITH CHECK (
  auth.uid() = claimer_user_id
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'creator'
  )
);

DROP POLICY IF EXISTS "Users can update their own pending claims" ON public.event_claims;
CREATE POLICY "Users can update their own pending claims"
ON public.event_claims FOR UPDATE
USING (auth.uid() = claimer_user_id AND claim_status = 'pending');

DROP POLICY IF EXISTS "Admins can view all claims" ON public.event_claims;
CREATE POLICY "Admins can view all claims"
ON public.event_claims FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

DROP POLICY IF EXISTS "Admins can update claims" ON public.event_claims;
CREATE POLICY "Admins can update claims"
ON public.event_claims FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- Step 7: Create event_tickets table for better ticket management
CREATE TABLE IF NOT EXISTS public.event_tickets (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.jambase_events(id) ON DELETE CASCADE,
  ticket_provider TEXT NOT NULL, -- 'ticketmaster', 'eventbrite', 'dice', 'seatgeek', etc.
  ticket_url TEXT NOT NULL,
  ticket_type TEXT, -- 'general_admission', 'vip', 'early_bird', etc.
  price_min DECIMAL(10,2),
  price_max DECIMAL(10,2),
  currency TEXT DEFAULT 'USD',
  available_from TIMESTAMPTZ,
  available_until TIMESTAMPTZ,
  is_primary BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 8: Create indexes for event_tickets
CREATE INDEX IF NOT EXISTS idx_event_tickets_event_id ON public.event_tickets(event_id);
CREATE INDEX IF NOT EXISTS idx_event_tickets_provider ON public.event_tickets(ticket_provider);
CREATE INDEX IF NOT EXISTS idx_event_tickets_primary ON public.event_tickets(event_id, is_primary) WHERE is_primary = true;

-- Step 9: Enable RLS on event_tickets
ALTER TABLE public.event_tickets ENABLE ROW LEVEL SECURITY;

-- Step 10: Create RLS policies for event_tickets
DROP POLICY IF EXISTS "Event tickets are viewable by everyone" ON public.event_tickets;
CREATE POLICY "Event tickets are viewable by everyone"
ON public.event_tickets FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Event owners can manage tickets" ON public.event_tickets;
CREATE POLICY "Event owners can manage tickets"
ON public.event_tickets FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.jambase_events
    WHERE id = event_tickets.event_id
    AND (
      created_by_user_id = auth.uid()
      OR claimed_by_creator_id = auth.uid()
    )
  )
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- Step 11: Update jambase_events RLS policies for business account creation
DROP POLICY IF EXISTS "Business accounts can create events" ON public.jambase_events;
CREATE POLICY "Business accounts can create events"
ON public.jambase_events FOR INSERT
WITH CHECK (
  auth.role() = 'authenticated'
  AND (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE user_id = auth.uid()
      AND account_type IN ('business', 'admin')
    )
    OR is_user_created = true  -- Allow regular users to create events manually
  )
);

DROP POLICY IF EXISTS "Event owners can update their events" ON public.jambase_events;
CREATE POLICY "Event owners can update their events"
ON public.jambase_events FOR UPDATE
USING (
  created_by_user_id = auth.uid()
  OR claimed_by_creator_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

DROP POLICY IF EXISTS "Event owners can delete their events" ON public.jambase_events;
CREATE POLICY "Event owners can delete their events"
ON public.jambase_events FOR DELETE
USING (
  created_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- Step 12: Create function to claim an event
CREATE OR REPLACE FUNCTION public.claim_event(
  p_event_id UUID,
  p_claim_reason TEXT,
  p_verification_proof TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claim_id UUID;
  v_account_type TEXT;
BEGIN
  -- Check if user is a creator
  SELECT account_type INTO v_account_type
  FROM public.profiles
  WHERE user_id = auth.uid();
  
  IF v_account_type != 'creator' THEN
    RAISE EXCEPTION 'Only creator accounts can claim events';
  END IF;
  
  -- Check if event is already claimed
  IF EXISTS (
    SELECT 1 FROM public.jambase_events
    WHERE id = p_event_id
    AND claimed_by_creator_id IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'This event has already been claimed';
  END IF;
  
  -- Create claim request
  INSERT INTO public.event_claims (
    event_id,
    claimer_user_id,
    claim_reason,
    verification_proof,
    claim_status
  ) VALUES (
    p_event_id,
    auth.uid(),
    p_claim_reason,
    p_verification_proof,
    'pending'
  )
  ON CONFLICT (event_id, claimer_user_id)
  DO UPDATE SET
    claim_reason = EXCLUDED.claim_reason,
    verification_proof = EXCLUDED.verification_proof,
    claim_status = 'pending',
    updated_at = now()
  RETURNING id INTO v_claim_id;
  
  -- Notify admins about new claim
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    data
  )
  SELECT 
    p.user_id,
    'event_claim_request',
    'New Event Claim Request',
    (SELECT name FROM public.profiles WHERE user_id = auth.uid()) || ' requested to claim an event',
    jsonb_build_object(
      'claim_id', v_claim_id,
      'event_id', p_event_id,
      'claimer_user_id', auth.uid()
    )
  FROM public.profiles p
  WHERE p.account_type = 'admin';
  
  RETURN v_claim_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.claim_event(UUID, TEXT, TEXT) TO authenticated;

-- Step 13: Create function to approve/reject event claim (admin only)
CREATE OR REPLACE FUNCTION public.review_event_claim(
  p_claim_id UUID,
  p_approved BOOLEAN,
  p_admin_notes TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_event_id UUID;
  v_claimer_id UUID;
BEGIN
  -- Check if user is admin
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  ) THEN
    RAISE EXCEPTION 'Only admins can review event claims';
  END IF;
  
  -- Get claim details
  SELECT event_id, claimer_user_id INTO v_event_id, v_claimer_id
  FROM public.event_claims
  WHERE id = p_claim_id;
  
  IF v_event_id IS NULL THEN
    RAISE EXCEPTION 'Claim not found';
  END IF;
  
  -- Update claim status
  UPDATE public.event_claims
  SET 
    claim_status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    reviewed_by_admin_id = auth.uid(),
    reviewed_at = now(),
    admin_notes = p_admin_notes,
    updated_at = now()
  WHERE id = p_claim_id;
  
  -- If approved, update event
  IF p_approved THEN
    UPDATE public.jambase_events
    SET 
      claimed_by_creator_id = v_claimer_id,
      updated_at = now()
    WHERE id = v_event_id;
  END IF;
  
  -- Notify claimer
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    data
  ) VALUES (
    v_claimer_id,
    CASE WHEN p_approved THEN 'event_claim_approved' ELSE 'event_claim_rejected' END,
    CASE WHEN p_approved THEN 'Event Claim Approved! 🎉' ELSE 'Event Claim Rejected' END,
    CASE 
      WHEN p_approved THEN 'Your event claim has been approved'
      ELSE 'Your event claim was not approved' || COALESCE(': ' || p_admin_notes, '')
    END,
    jsonb_build_object(
      'claim_id', p_claim_id,
      'event_id', v_event_id,
      'approved', p_approved
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_event_claim(UUID, BOOLEAN, TEXT) TO authenticated;

-- Step 14: Create function to get events created by a user
CREATE OR REPLACE FUNCTION public.get_user_created_events(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  title TEXT,
  artist_name TEXT,
  venue_name TEXT,
  event_date TIMESTAMPTZ,
  event_status TEXT,
  created_at TIMESTAMPTZ,
  media_urls TEXT[],
  poster_image_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    je.id,
    je.title,
    je.artist_name,
    je.venue_name,
    je.event_date,
    je.event_status,
    je.created_at,
    je.media_urls,
    je.poster_image_url
  FROM public.jambase_events je
  WHERE je.created_by_user_id = COALESCE(p_user_id, auth.uid())
  ORDER BY je.event_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_created_events(UUID) TO authenticated;

-- Step 15: Create function to get claimed events for a creator
CREATE OR REPLACE FUNCTION public.get_claimed_events(p_user_id UUID DEFAULT NULL)
RETURNS TABLE (
  id UUID,
  title TEXT,
  artist_name TEXT,
  venue_name TEXT,
  event_date TIMESTAMPTZ,
  event_status TEXT,
  claimed_at TIMESTAMPTZ,
  media_urls TEXT[],
  poster_image_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    je.id,
    je.title,
    je.artist_name,
    je.venue_name,
    je.event_date,
    je.event_status,
    ec.created_at as claimed_at,
    je.media_urls,
    je.poster_image_url
  FROM public.jambase_events je
  INNER JOIN public.event_claims ec ON ec.event_id = je.id
  WHERE je.claimed_by_creator_id = COALESCE(p_user_id, auth.uid())
    AND ec.claim_status = 'approved'
  ORDER BY je.event_date DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_claimed_events(UUID) TO authenticated;

-- Step 16: Add helpful comments
COMMENT ON COLUMN public.jambase_events.created_by_user_id IS 'User who created this event (for business accounts)';
COMMENT ON COLUMN public.jambase_events.claimed_by_creator_id IS 'Creator who successfully claimed this event';
COMMENT ON COLUMN public.jambase_events.event_status IS 'Current status of the event';
COMMENT ON COLUMN public.jambase_events.media_urls IS 'Array of media URLs (photos/videos) for the event';
COMMENT ON COLUMN public.jambase_events.promotion_tier IS 'Paid promotion level for the event';
COMMENT ON TABLE public.event_claims IS 'Tracks event claim requests from creators';
COMMENT ON TABLE public.event_tickets IS 'Detailed ticket information for events';
COMMENT ON FUNCTION public.claim_event IS 'Creator function to request event ownership';
COMMENT ON FUNCTION public.review_event_claim IS 'Admin function to approve/reject event claims';

-- Step 17: Update notifications constraint to include new types
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
    'event_rescheduled'
  ));
END $$;

-- Verification
SELECT 
  'Phase 2 Event Creation System Installed' as status,
  COUNT(*) FILTER (WHERE table_name = 'event_claims') as event_claims_table,
  COUNT(*) FILTER (WHERE table_name = 'event_tickets') as event_tickets_table
FROM information_schema.tables
WHERE table_schema = 'public' 
  AND table_name IN ('event_claims', 'event_tickets');

