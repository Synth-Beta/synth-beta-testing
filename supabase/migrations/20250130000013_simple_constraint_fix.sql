-- Simple fix: Remove problematic ON CONFLICT clauses
-- This migration removes any ON CONFLICT clauses that might be causing the constraint error

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

-- Step 3: Add helpful comment
COMMENT ON FUNCTION public.set_user_interest IS 'Safely toggle user interest in events without ON CONFLICT clauses';
