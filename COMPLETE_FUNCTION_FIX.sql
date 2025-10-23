-- COMPLETE FUNCTION FIX
-- This ensures the set_user_interest function works with the exact parameters the client sends

-- Drop all existing versions of the function
DROP FUNCTION IF EXISTS public.set_user_interest(text, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean);

-- Create the function that matches exactly what the client is sending
-- The client sends: { event_id: jambaseEventId, interested: boolean }
CREATE OR REPLACE FUNCTION public.set_user_interest(event_id text, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_uuid uuid;
BEGIN
  -- Try to convert the event_id to UUID
  BEGIN
    event_uuid := event_id::uuid;
  EXCEPTION
    WHEN OTHERS THEN
      -- If it's not a UUID, try to find by jambase_event_id
      SELECT id INTO event_uuid 
      FROM public.jambase_events 
      WHERE jambase_event_id = event_id 
      LIMIT 1;
      
      IF event_uuid IS NULL THEN
        -- If still not found, raise an error
        RAISE EXCEPTION 'Event not found: %', event_id;
      END IF;
  END;
  
  -- Now perform the interest operation
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

-- Also create a UUID version for backward compatibility
CREATE OR REPLACE FUNCTION public.set_user_interest(event_id uuid, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF interested THEN
    INSERT INTO public.user_jambase_events (user_id, jambase_event_id)
    VALUES (auth.uid(), event_id)
    ON CONFLICT (user_id, jambase_event_id) 
    DO NOTHING;
  ELSE
    DELETE FROM public.user_jambase_events
    WHERE user_id = auth.uid() AND jambase_event_id = event_id;
  END IF;
END;
$$;

-- Grant execute permission for UUID version
GRANT EXECUTE ON FUNCTION public.set_user_interest(uuid, boolean) TO authenticated;

-- Test both versions
SELECT 'set_user_interest functions created successfully!' as status;
