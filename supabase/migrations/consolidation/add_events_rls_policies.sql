-- ============================================
-- ADD RLS POLICIES FOR EVENTS TABLE
-- ============================================
-- This adds Row Level Security policies for the events table
-- Run this after creating the events table

-- ============================================
-- RLS POLICIES FOR EVENTS TABLE
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view published events" ON public.events;
DROP POLICY IF EXISTS "Users can view their own created events" ON public.events;
DROP POLICY IF EXISTS "Users can create events" ON public.events;
DROP POLICY IF EXISTS "Event creators can update their events" ON public.events;
DROP POLICY IF EXISTS "Event creators can delete their events" ON public.events;
DROP POLICY IF EXISTS "Event owners can update their events" ON public.events;
DROP POLICY IF EXISTS "Admin and creators can manage all events" ON public.events;

-- Policy 1: Anyone can view published events (event_status = 'published' or NULL)
CREATE POLICY "Anyone can view published events"
ON public.events FOR SELECT
USING (
  event_status IS NULL 
  OR event_status = 'published'
  OR created_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid()
    AND u.account_type IN ('admin', 'creator', 'business')
  )
);

-- Policy 2: Users can view their own created events
CREATE POLICY "Users can view their own created events"
ON public.events FOR SELECT
USING (created_by_user_id = auth.uid());

-- Policy 3: Authenticated users can create events
CREATE POLICY "Users can create events"
ON public.events FOR INSERT
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    created_by_user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
      AND u.account_type IN ('admin', 'creator', 'business')
    )
  )
);

-- Policy 4: Event creators can update their own events
CREATE POLICY "Event creators can update their events"
ON public.events FOR UPDATE
USING (
  created_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid()
    AND u.account_type IN ('admin', 'creator', 'business')
  )
)
WITH CHECK (
  created_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid()
    AND u.account_type IN ('admin', 'creator', 'business')
  )
);

-- Policy 5: Event creators can delete their own events
CREATE POLICY "Event creators can delete their events"
ON public.events FOR DELETE
USING (
  created_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid()
    AND u.account_type = 'admin'
  )
);

-- Policy 6: Business accounts (promoters) can manage events they promote
-- Note: This checks if the event is promoted and the user is a business account
CREATE POLICY "Business accounts can manage promoted events"
ON public.events FOR UPDATE
USING (
  promoted = true
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid()
    AND u.account_type = 'business'
  )
)
WITH CHECK (
  promoted = true
  AND EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid()
    AND u.account_type = 'business'
  )
);

-- Verify policies were created
DO $$
DECLARE
  v_policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_policy_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename = 'events';
  
  RAISE NOTICE 'SUCCESS: Created % RLS policies for events table', v_policy_count;
  
  IF v_policy_count < 6 THEN
    RAISE WARNING 'WARNING: Expected 6 policies, but only % were created', v_policy_count;
  END IF;
END $$;

-- Display created policies
SELECT 
  'RLS Policies Created' as status,
  tablename as table_name,
  policyname as policy_name,
  permissive,
  roles,
  cmd as command
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'events'
ORDER BY policyname;

