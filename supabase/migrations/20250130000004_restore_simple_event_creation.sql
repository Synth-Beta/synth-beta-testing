-- Restore Simple Event Creation Support
-- This script adds back event creation functionality for admin, creator, and business accounts
-- but keeps it simple - no complex claiming logic

-- Step 1: Add back essential event creation columns to jambase_events
ALTER TABLE public.jambase_events 
ADD COLUMN IF NOT EXISTS created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS owned_by_account_type TEXT CHECK (owned_by_account_type IN ('user', 'creator', 'business', 'admin'));

-- Step 2: Create indexes for the new columns
CREATE INDEX IF NOT EXISTS idx_jambase_events_created_by ON public.jambase_events(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_jambase_events_owned_by ON public.jambase_events(owned_by_account_type);

-- Step 3: Update RLS policies to support event creation and management
-- Drop existing policies
DROP POLICY IF EXISTS "Authenticated users can view events" ON public.jambase_events;
DROP POLICY IF EXISTS "Admins can manage events" ON public.jambase_events;

-- Create new policies
-- Allow all authenticated users to read events
CREATE POLICY "Authenticated users can view events"
ON public.jambase_events FOR SELECT
USING (auth.role() = 'authenticated');

-- Allow business, creator, and admin accounts to create events
CREATE POLICY "Authorized accounts can create events"
ON public.jambase_events FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type IN ('business', 'creator', 'admin')
  )
  AND auth.uid() = created_by_user_id
  AND owned_by_account_type IN ('business', 'creator', 'admin')
);

-- Allow event creators to update their own events
CREATE POLICY "Event creators can update their events"
ON public.jambase_events FOR UPDATE
USING (
  created_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
)
WITH CHECK (
  created_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- Allow event creators to delete their own events
CREATE POLICY "Event creators can delete their events"
ON public.jambase_events FOR DELETE
USING (
  created_by_user_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- Step 4: Add helpful comments
COMMENT ON COLUMN public.jambase_events.created_by_user_id IS 'User who created this event (business, creator, or admin accounts only)';
COMMENT ON COLUMN public.jambase_events.owned_by_account_type IS 'Type of account that owns this event (business, creator, or admin)';
COMMENT ON TABLE public.jambase_events IS 'Events table with simple creation support. No complex claiming logic - just straightforward ownership.';

-- Step 5: Create a function to check if user can create events
CREATE OR REPLACE FUNCTION public.can_create_events()
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type IN ('business', 'creator', 'admin')
  );
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.can_create_events() TO authenticated;

-- Step 6: Add comment explaining the simplified approach
COMMENT ON SCHEMA public IS 'Simple event creation restored. Business, creator, and admin accounts can create events. No complex claiming logic - just straightforward ownership.';
