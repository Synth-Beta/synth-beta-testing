-- Comprehensive fix for the set_user_interest function and user_jambase_events table
-- This ensures consistency between the schema and function

-- First, ensure the table has the correct structure
-- Drop the interested column if it exists (presence-based model)
ALTER TABLE public.user_jambase_events 
DROP COLUMN IF EXISTS interested;

-- Ensure we have the correct policies
DROP POLICY IF EXISTS "Users can view their own JamBase event associations" ON user_jambase_events;
DROP POLICY IF EXISTS "Users can create their own JamBase event associations" ON user_jambase_events;
DROP POLICY IF EXISTS "Users can update their own JamBase event associations" ON user_jambase_events;
DROP POLICY IF EXISTS "Users can delete their own JamBase event associations" ON user_jambase_events;

-- Recreate all policies
CREATE POLICY "Users can view their own JamBase event associations" 
ON user_jambase_events FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own JamBase event associations" 
ON user_jambase_events FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own JamBase event associations" 
ON user_jambase_events FOR UPDATE USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own JamBase event associations" 
ON user_jambase_events FOR DELETE USING (auth.uid() = user_id);

-- Ensure the unique constraint exists
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'user_jambase_events_user_event_unique'
  ) THEN
    CREATE UNIQUE INDEX user_jambase_events_user_event_unique ON public.user_jambase_events (user_id, jambase_event_id);
  END IF;
END $$;

-- Create the correct set_user_interest function (presence-based model)
CREATE OR REPLACE FUNCTION public.set_user_interest(event_id uuid, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF interested THEN
    -- Insert row if interested (presence-based)
    INSERT INTO public.user_jambase_events (user_id, jambase_event_id)
    VALUES (auth.uid(), event_id)
    ON CONFLICT (user_id, jambase_event_id) 
    DO NOTHING;
  ELSE
    -- Delete row if not interested
    DELETE FROM public.user_jambase_events
    WHERE user_id = auth.uid() AND jambase_event_id = event_id;
  END IF;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.set_user_interest(uuid, boolean) TO authenticated;
