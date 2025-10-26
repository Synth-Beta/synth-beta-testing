-- Fix RLS policy for user_jambase_events to allow viewing all interested users
-- This is necessary for the Find Buddies feature to work correctly

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view their own JamBase event associations" ON user_jambase_events;
DROP POLICY IF EXISTS "Authenticated users can view all JamBase event associations" ON user_jambase_events;
DROP POLICY IF EXISTS "Authenticated users can view all user event associations" ON user_jambase_events;

-- Create a new policy that allows authenticated users to see all interested users
-- This is required for the Find Buddies feature to show correct counts
CREATE POLICY "Authenticated users can view all interested users" 
ON user_jambase_events 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Keep existing policies for user's own records
CREATE POLICY "Users can manage their own JamBase event associations" 
ON user_jambase_events 
FOR ALL 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);
