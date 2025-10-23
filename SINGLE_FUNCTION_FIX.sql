-- SINGLE FUNCTION FIX
-- Remove function overloading and create one function that handles both TEXT and UUID

-- Drop both existing functions to eliminate overloading conflicts
DROP FUNCTION IF EXISTS public.set_user_interest(text, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean);

-- Create a single function that accepts TEXT and handles both cases internally
CREATE OR REPLACE FUNCTION public.set_user_interest(event_id_param text, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_uuid uuid;
BEGIN
  -- Try to convert text to UUID first
  BEGIN
    event_uuid := event_id_param::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      -- If conversion fails, try to find by jambase_event_id
      SELECT id INTO event_uuid 
      FROM public.jambase_events 
      WHERE jambase_event_id = event_id_param 
      LIMIT 1;
      
      IF event_uuid IS NULL THEN
        RAISE EXCEPTION 'Event not found: %', event_id_param;
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
SELECT 'Single set_user_interest function created successfully!' as status;
