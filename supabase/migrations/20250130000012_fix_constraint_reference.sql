-- Fix ON CONFLICT constraint reference issue
-- This migration fixes the "there is no unique or exclusion constraint matching the ON CONFLICT specification" error

-- Step 1: Drop the existing function to avoid conflicts
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean);

-- Step 2: Ensure the unique constraint exists with the correct name
-- First, let's check if the constraint exists and create it if it doesn't
DO $$ 
BEGIN
  -- Check if the unique constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_jambase_events_user_event_unique'
    AND conrelid = 'public.user_jambase_events'::regclass
  ) THEN
    -- Create the unique constraint
    ALTER TABLE public.user_jambase_events 
    ADD CONSTRAINT user_jambase_events_user_event_unique 
    UNIQUE (user_id, jambase_event_id);
  END IF;
END $$;

-- Step 3: Recreate the function with the correct constraint reference
CREATE OR REPLACE FUNCTION public.set_user_interest(event_id uuid, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF interested THEN
    INSERT INTO public.user_jambase_events (user_id, jambase_event_id)
    VALUES (auth.uid(), event_id)
    ON CONFLICT ON CONSTRAINT user_jambase_events_user_event_unique DO NOTHING;
  ELSE
    DELETE FROM public.user_jambase_events
    WHERE user_id = auth.uid() AND jambase_event_id = event_id;
  END IF;
END;
$$;

-- Step 4: Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.set_user_interest(uuid, boolean) TO authenticated;

-- Step 5: Add helpful comment
COMMENT ON FUNCTION public.set_user_interest IS 'Safely toggle user interest in events with proper conflict handling using named constraint';
