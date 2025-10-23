-- TARGETED FIX for set_user_interest function
-- The issue: The function signature is not matching what the client is sending

-- First, let's drop the existing function to avoid conflicts
DROP FUNCTION IF EXISTS public.set_user_interest(text, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean);

-- Create a new function that accepts TEXT (which is what the client is sending)
CREATE OR REPLACE FUNCTION public.set_user_interest(event_id_param text, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_uuid uuid;
BEGIN
  -- Try to convert text to UUID directly
  BEGIN
    event_uuid := event_id_param::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      -- If conversion fails, try to find the event by jambase_event_id
      SELECT id INTO event_uuid 
      FROM public.jambase_events 
      WHERE jambase_event_id = event_id_param 
      LIMIT 1;
      
      IF event_uuid IS NULL THEN
        RAISE EXCEPTION 'Event not found: %', event_id_param;
      END IF;
  END;
  
  -- Now use the UUID version
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
SELECT 'set_user_interest function fixed!' as status;
