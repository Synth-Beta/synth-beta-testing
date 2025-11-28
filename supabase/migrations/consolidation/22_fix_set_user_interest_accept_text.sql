-- Fix set_user_interest function to accept TEXT event IDs only
-- This resolves function overloading conflicts by having only ONE function signature

-- Drop ALL existing versions to avoid conflicts
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(text, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.set_user_interest(event_id uuid, interested boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(event_id text, interested boolean);

-- Create ONLY the TEXT version (no overloading)
-- This accepts event IDs as TEXT (can be UUID strings or jambase_event_id TEXT)
CREATE OR REPLACE FUNCTION public.set_user_interest(
  event_id TEXT,
  interested BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF interested THEN
    -- Insert or update relationship for event interest
    INSERT INTO public.relationships (
      user_id,
      related_entity_type,
      related_entity_id,
      relationship_type,
      status,
      created_at,
      updated_at
    )
    VALUES (
      auth.uid(),
      'event',
      event_id, -- Store as TEXT (can be UUID string or jambase_event_id)
      'interest',
      'accepted',
      now(),
      now()
    )
    ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) 
    DO UPDATE SET
      status = 'accepted',
      updated_at = now();
  ELSE
    -- Delete relationship if not interested
    DELETE FROM public.relationships
    WHERE user_id = auth.uid()
      AND related_entity_type = 'event'
      AND related_entity_id = event_id
      AND relationship_type = 'interest';
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.set_user_interest(TEXT, BOOLEAN) TO authenticated;

-- Verify the function was created (only ONE version should exist)
DO $$
BEGIN
  -- Check that only the TEXT version exists
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'set_user_interest'
      AND pg_get_function_arguments(p.oid) = 'event_id text, interested boolean'
  ) THEN
    RAISE EXCEPTION 'Function set_user_interest(TEXT, BOOLEAN) was not created successfully';
  END IF;
  
  -- Verify that NO UUID version exists (to avoid overloading)
  IF EXISTS (
    SELECT 1 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'set_user_interest'
      AND pg_get_function_arguments(p.oid) = 'event_id uuid, interested boolean'
  ) THEN
    RAISE EXCEPTION 'UUID version of set_user_interest still exists - this will cause overloading conflicts';
  END IF;
  
  RAISE NOTICE 'Function set_user_interest created successfully (TEXT version only, no overloading)';
END $$;

