-- Fix jambase_events RLS policies for review form
-- This migration fixes the RLS policies to allow regular users to create events
-- when submitting reviews, while maintaining security

-- Step 1: Drop the restrictive admin-only policy
DROP POLICY IF EXISTS "Admins can manage events" ON public.jambase_events;

-- Step 2: Create more permissive policies for event creation
-- Allow all authenticated users to read events
DROP POLICY IF EXISTS "Authenticated users can view events" ON public.jambase_events;
CREATE POLICY "Authenticated users can view events"
ON public.jambase_events FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow all authenticated users to create events (needed for review form)
DROP POLICY IF EXISTS "Authenticated users can create events" ON public.jambase_events;
CREATE POLICY "Authenticated users can create events"
ON public.jambase_events FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

-- Allow all authenticated users to update events (needed for review form)
DROP POLICY IF EXISTS "Authenticated users can update events" ON public.jambase_events;
CREATE POLICY "Authenticated users can update events"
ON public.jambase_events FOR UPDATE
USING (auth.role() = 'authenticated')
WITH CHECK (auth.role() = 'authenticated');

-- Only admins can delete events (for safety)
DROP POLICY IF EXISTS "Admins can delete events" ON public.jambase_events;
CREATE POLICY "Admins can delete events"
ON public.jambase_events FOR DELETE
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- Step 3: Add helpful comments
COMMENT ON POLICY "Authenticated users can view events" ON public.jambase_events IS 'Allows all authenticated users to view events for browsing and reviews';
COMMENT ON POLICY "Authenticated users can create events" ON public.jambase_events IS 'Allows users to create events when submitting reviews';
COMMENT ON POLICY "Authenticated users can update events" ON public.jambase_events IS 'Allows users to update events when editing reviews';
COMMENT ON POLICY "Admins can delete events" ON public.jambase_events IS 'Only admins can delete events for safety';

-- Step 4: Update table comment
COMMENT ON TABLE public.jambase_events IS 'Events table with permissive policies for review form. Users can create/update events, only admins can delete.';
