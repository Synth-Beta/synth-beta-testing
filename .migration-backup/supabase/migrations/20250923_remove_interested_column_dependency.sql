-- Remove the interested column dependency and use presence-based model

-- Drop the interested column if it exists
ALTER TABLE public.user_jambase_events 
DROP COLUMN IF EXISTS interested;

-- Update the set_user_interest function to use presence-based model
-- (row exists = interested, no row = not interested)
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
