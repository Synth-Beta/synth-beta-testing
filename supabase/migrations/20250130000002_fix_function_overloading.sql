-- Fix function overloading conflict for set_user_interest
-- Drop ALL existing versions of the function to resolve conflicts

-- Drop all existing versions of set_user_interest function
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(text, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(event_id uuid, interested boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(event_id text, interested boolean);

-- Create a single, clean version of the function
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
