-- Fix the ON CONFLICT constraint reference in set_user_interest function
-- The error indicates the constraint name doesn't match what's expected

-- Step 1: Check what constraints exist on user_jambase_events
-- This will help us identify the correct constraint name

-- Step 2: Fix the set_user_interest function with the correct constraint reference
CREATE OR REPLACE FUNCTION public.set_user_interest(event_id uuid, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF interested THEN
    INSERT INTO public.user_jambase_events (user_id, jambase_event_id)
    VALUES (auth.uid(), event_id)
    ON CONFLICT (user_id, jambase_event_id) DO NOTHING;
  ELSE
    DELETE FROM public.user_jambase_events
    WHERE user_id = auth.uid() AND jambase_event_id = event_id;
  END IF;
END;
$$;

-- Step 3: Alternative approach - use the unique index name if constraint name is different
-- If the above doesn't work, try this version that uses the index name:
/*
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
*/

-- Step 4: Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.set_user_interest(uuid, boolean) TO authenticated;

-- Step 5: Add helpful comment
COMMENT ON FUNCTION public.set_user_interest IS 'Safely toggle user interest in events with proper conflict handling';
