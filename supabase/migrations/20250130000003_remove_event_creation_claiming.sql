-- Remove Event Creation and Claiming Logic
-- This script removes all event ownership, creation, and claiming functionality
-- to simplify the app to just track which account owns the app

-- Step 1: Drop event_claims table entirely
DROP TABLE IF EXISTS public.event_claims CASCADE;

-- Step 2: Remove event ownership and creation columns from jambase_events
ALTER TABLE public.jambase_events 
DROP COLUMN IF EXISTS created_by_user_id,
DROP COLUMN IF EXISTS owned_by_account_type,
DROP COLUMN IF EXISTS claimed_by_creator_id,
DROP COLUMN IF EXISTS event_status,
DROP COLUMN IF EXISTS is_featured,
DROP COLUMN IF EXISTS featured_until,
DROP COLUMN IF EXISTS promotion_tier;

-- Step 3: Drop related indexes
DROP INDEX IF EXISTS idx_jambase_events_created_by;
DROP INDEX IF EXISTS idx_jambase_events_claimed_by;
DROP INDEX IF EXISTS idx_jambase_events_status;
DROP INDEX IF EXISTS idx_jambase_events_featured;
DROP INDEX IF EXISTS idx_jambase_events_promotion_tier;

-- Step 4: Drop the claim_event function
DROP FUNCTION IF EXISTS public.claim_event(UUID, TEXT, TEXT);

-- Step 5: Update RLS policies to remove ownership-based restrictions
-- Drop existing policies that reference removed columns
DROP POLICY IF EXISTS "Event owners can update their events" ON public.jambase_events;
DROP POLICY IF EXISTS "Event owners can delete their events" ON public.jambase_events;
DROP POLICY IF EXISTS "Users can view their own claims" ON public.event_claims;
DROP POLICY IF EXISTS "Creators can create claims" ON public.event_claims;
DROP POLICY IF EXISTS "Admins can view all claims" ON public.event_claims;
DROP POLICY IF EXISTS "Admins can update claims" ON public.event_claims;

-- Step 6: Create simplified RLS policies for jambase_events
-- Allow all authenticated users to read events
CREATE POLICY "Authenticated users can view events"
ON public.jambase_events FOR SELECT
USING (auth.role() = 'authenticated');

-- Only admins can insert/update/delete events
CREATE POLICY "Admins can manage events"
ON public.jambase_events FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- Step 7: Add comment explaining the simplified structure
COMMENT ON TABLE public.jambase_events IS 'Simplified events table - no ownership or claiming logic. All users can view events, only admins can manage them.';

-- Step 8: Clean up any notifications related to event claims
DELETE FROM public.notifications 
WHERE type IN ('event_claim_request', 'event_claim_approved', 'event_claim_rejected');

-- Step 9: Update notification types constraint to remove claim-related types
ALTER TABLE public.notifications 
DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications 
ADD CONSTRAINT notifications_type_check 
CHECK (type IN (
  'friend_request',
  'friend_accepted',
  'match',
  'message',
  'review_liked',
  'review_commented',
  'comment_replied',
  'event_interest',
  'event_attendance_reminder',
  'artist_followed',
  'artist_new_event',
  'artist_profile_updated',
  'venue_new_event',
  'venue_profile_updated'
));

-- Step 10: Add helpful comment
COMMENT ON SCHEMA public IS 'Event creation and claiming logic removed. App now focuses on user interactions (interest, matching, reviews) rather than event ownership.';
