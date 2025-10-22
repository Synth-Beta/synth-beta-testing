-- Fix missing DELETE policy for user_jambase_events table
-- This is needed for the set_user_interest function to work properly

-- Add DELETE policy for user_jambase_events
CREATE POLICY "Users can delete their own JamBase event associations" 
ON user_jambase_events 
FOR DELETE 
USING (auth.uid() = user_id);

-- Also add UPDATE policy in case it's needed
CREATE POLICY "Users can update their own JamBase event associations" 
ON user_jambase_events 
FOR UPDATE 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);
