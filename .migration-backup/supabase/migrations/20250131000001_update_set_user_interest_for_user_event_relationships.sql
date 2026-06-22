-- Update set_user_interest function for user_event_relationships table
-- Fixes ambiguous column reference error

-- Drop ALL existing versions to avoid conflicts
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(text, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.set_user_interest(event_id uuid, interested boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(event_id text, interested boolean);

-- Create function using user_event_relationships table
-- Use event_id parameter name (as expected by frontend) but use v_event_uuid variable inside to avoid ambiguity
CREATE OR REPLACE FUNCTION public.set_user_interest(
  p_event_id TEXT,
  interested BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_uuid UUID;
BEGIN
  -- Convert TEXT to UUID (p_event_id parameter should be a UUID string)
  -- Use p_event_id parameter name to avoid ambiguity with table column name
  BEGIN
    v_event_uuid := p_event_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    -- If conversion fails, try to look up the event by jambase_event_id
    SELECT e.id INTO v_event_uuid
    FROM public.events e
    WHERE e.jambase_event_id = p_event_id
    LIMIT 1;
    
    IF v_event_uuid IS NULL THEN
      RAISE EXCEPTION 'Event not found: %', p_event_id;
    END IF;
  END;
  
  IF interested THEN
    -- Insert or update relationship for event interest
    -- Qualify column names with table alias to avoid ambiguity with parameter name
    INSERT INTO public.user_event_relationships (
      user_id,
      event_id,
      relationship_type,
      created_at,
      updated_at
    )
    VALUES (
      auth.uid(),
      v_event_uuid,
      'interested',
      now(),
      now()
    )
    ON CONFLICT (user_id, event_id) 
    DO UPDATE SET
      relationship_type = 'interested',
      updated_at = now();
  ELSE
    -- Delete relationship if not interested
    -- Use table alias to qualify column references
    DELETE FROM public.user_event_relationships uer
    WHERE uer.user_id = auth.uid()
      AND uer.event_id = v_event_uuid;
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.set_user_interest(TEXT, BOOLEAN) TO authenticated;

-- Verify the function was created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'set_user_interest'
      AND pg_get_function_arguments(p.oid) = 'p_event_id text, interested boolean'
  ) THEN
    RAISE EXCEPTION 'Function set_user_interest was not created successfully';
  END IF;
  RAISE NOTICE 'Function set_user_interest created successfully for user_event_relationships table';
END $$;

