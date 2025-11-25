-- Fix set_user_interest function for 3NF schema
-- This migration resolves function overloading conflicts and ensures proper use of relationships table

-- Drop ALL existing versions of set_user_interest to resolve conflicts
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.set_user_interest(event_id uuid, interested boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(event_id uuid, interested boolean, rsvp_status text);

-- Create a single, clean version that uses relationships table for 3NF
CREATE OR REPLACE FUNCTION public.set_user_interest(
  event_id UUID,
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
      event_id::TEXT,
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
      AND related_entity_id = event_id::TEXT
      AND relationship_type = 'interest';
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.set_user_interest(UUID, BOOLEAN) TO authenticated;

-- Verify the function was created
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'set_user_interest'
      AND pg_get_function_arguments(p.oid) = 'event_id uuid, interested boolean'
  ) THEN
    RAISE EXCEPTION 'Function set_user_interest was not created successfully';
  END IF;
  RAISE NOTICE 'Function set_user_interest created successfully with 2 parameters (event_id uuid, interested boolean)';
END $$;

