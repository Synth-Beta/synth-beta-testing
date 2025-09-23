-- Fix infinite recursion in RLS policies for user_jambase_events table

-- First, add the missing 'interested' column
ALTER TABLE public.user_jambase_events 
ADD COLUMN IF NOT EXISTS interested BOOLEAN DEFAULT true;

-- Add missing RLS policies for UPDATE and DELETE operations
CREATE POLICY "Users can update their own JamBase event associations" 
ON user_jambase_events FOR UPDATE 
USING (auth.uid() = user_id) 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own JamBase event associations" 
ON user_jambase_events FOR DELETE 
USING (auth.uid() = user_id);

-- Update the set_user_interest function to work with the new schema
CREATE OR REPLACE FUNCTION public.set_user_interest(event_id uuid, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF interested THEN
    INSERT INTO public.user_jambase_events (user_id, jambase_event_id, interested)
    VALUES (auth.uid(), event_id, true)
    ON CONFLICT (user_id, jambase_event_id) 
    DO UPDATE SET interested = true, created_at = NOW();
  ELSE
    DELETE FROM public.user_jambase_events
    WHERE user_id = auth.uid() AND jambase_event_id = event_id;
  END IF;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.set_user_interest(uuid, boolean) TO authenticated;
