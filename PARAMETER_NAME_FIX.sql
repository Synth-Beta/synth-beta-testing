-- PARAMETER NAME FIX
-- The function parameter name must match what the client sends

-- Drop the existing function
DROP FUNCTION IF EXISTS public.set_user_interest(text, boolean);

-- Create the function with the exact parameter name the client expects
-- Client sends: { event_id: value, interested: boolean }
CREATE OR REPLACE FUNCTION public.set_user_interest(event_id text, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_uuid uuid;
BEGIN
  -- Try to convert text to UUID first
  BEGIN
    event_uuid := event_id::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      -- If conversion fails, try to find by jambase_event_id
      SELECT id INTO event_uuid 
      FROM public.jambase_events 
      WHERE jambase_event_id = event_id 
      LIMIT 1;
      
      IF event_uuid IS NULL THEN
        RAISE EXCEPTION 'Event not found: %', event_id;
      END IF;
  END;
  
  -- Perform the interest operation
  IF interested THEN
    INSERT INTO public.user_jambase_events (user_id, jambase_event_id)
    VALUES (auth.uid(), event_uuid)
    ON CONFLICT (user_id, jambase_event_id) 
    DO NOTHING;
  ELSE
    DELETE FROM public.user_jambase_events
    WHERE user_id = auth.uid() AND jambase_event_id = event_uuid;
  END IF;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.set_user_interest(text, boolean) TO authenticated;

-- Test the function
SELECT 'set_user_interest function created with correct parameter names!' as status;
