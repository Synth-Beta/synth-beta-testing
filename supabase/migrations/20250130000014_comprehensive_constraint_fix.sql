-- Comprehensive fix for ON CONFLICT constraint errors
-- This migration fixes all possible sources of the constraint error

-- Step 1: Drop and recreate the set_user_interest function without ON CONFLICT
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean);

CREATE OR REPLACE FUNCTION public.set_user_interest(event_id uuid, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF interested THEN
    -- Use a simple INSERT with error handling instead of ON CONFLICT
    BEGIN
      INSERT INTO public.user_jambase_events (user_id, jambase_event_id)
      VALUES (auth.uid(), event_id);
    EXCEPTION WHEN unique_violation THEN
      -- Ignore duplicate key errors
      NULL;
    END;
  ELSE
    DELETE FROM public.user_jambase_events
    WHERE user_id = auth.uid() AND jambase_event_id = event_id;
  END IF;
END;
$$;

-- Step 2: Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.set_user_interest(uuid, boolean) TO authenticated;

-- Step 3: Check for any other functions that might have ON CONFLICT issues
-- Drop any other problematic functions
DROP FUNCTION IF EXISTS public.upsert_event_interest(uuid, boolean);
DROP FUNCTION IF EXISTS public.toggle_event_interest(uuid, boolean);

-- Step 4: Ensure the unique constraint exists on user_jambase_events
-- This ensures the table has the proper constraint structure
DO $$ 
BEGIN
  -- Check if the unique constraint exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'user_jambase_events_user_id_jambase_event_id_key'
    AND conrelid = 'public.user_jambase_events'::regclass
  ) THEN
    -- Create the unique constraint if it doesn't exist
    ALTER TABLE public.user_jambase_events 
    ADD CONSTRAINT user_jambase_events_user_id_jambase_event_id_key 
    UNIQUE (user_id, jambase_event_id);
  END IF;
END $$;

-- Step 5: Add helpful comment
COMMENT ON FUNCTION public.set_user_interest IS 'Safely toggle user interest in events without ON CONFLICT clauses - handles unique violations gracefully';
