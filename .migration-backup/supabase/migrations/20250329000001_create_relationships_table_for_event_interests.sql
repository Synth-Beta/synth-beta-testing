-- Create relationships table for event interests
-- This migration creates the table and RPC function needed for the interested events feature

BEGIN;

-- Create relationships table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.relationships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  related_entity_type TEXT NOT NULL CHECK (related_entity_type = 'event'),
  related_entity_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'going',
    'maybe',
    'interest',
    'not_going'
  )),
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, related_entity_type, related_entity_id, relationship_type)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_relationships_user_id ON public.relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_relationships_entity_id ON public.relationships(related_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type ON public.relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_user_type ON public.relationships(user_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_created_at ON public.relationships(created_at DESC);

-- Enable RLS
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Users can view event relationships" ON public.relationships;
CREATE POLICY "Users can view event relationships"
ON public.relationships FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can create their own event relationships" ON public.relationships;
CREATE POLICY "Users can create their own event relationships"
ON public.relationships FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own event relationships" ON public.relationships;
CREATE POLICY "Users can update their own event relationships"
ON public.relationships FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own event relationships" ON public.relationships;
CREATE POLICY "Users can delete their own event relationships"
ON public.relationships FOR DELETE
USING (auth.uid() = user_id);

-- Create or replace set_user_interest function
-- Drop ALL existing versions to avoid conflicts
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(text, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.set_user_interest(event_id uuid, interested boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(event_id text, interested boolean);

-- Create ONLY the TEXT version (no overloading)
-- This accepts event IDs as TEXT (can be UUID strings)
CREATE OR REPLACE FUNCTION public.set_user_interest(
  event_id TEXT,
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
  -- Convert TEXT to UUID (event_id should be a UUID string)
  BEGIN
    v_event_uuid := event_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    -- If conversion fails, try to look up the event by jambase_event_id
    SELECT id INTO v_event_uuid
    FROM public.events
    WHERE jambase_event_id = event_id
    LIMIT 1;
    
    IF v_event_uuid IS NULL THEN
      RAISE EXCEPTION 'Event not found: %', event_id;
    END IF;
  END;
  
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
      v_event_uuid,
      'interest',
      'accepted',
      now(),
      now()
    )
    ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) 
    DO UPDATE SET
      status = 'accepted',
      updated_at = now();
    
    -- Verify the insert/update succeeded by checking if row exists
    IF NOT EXISTS (
      SELECT 1 FROM public.relationships
      WHERE user_id = auth.uid()
        AND related_entity_type = 'event'
        AND related_entity_id = v_event_uuid
        AND relationship_type = 'interest'
    ) THEN
      RAISE EXCEPTION 'Failed to create relationship - row not found after insert';
    END IF;
  ELSE
    -- Delete relationship if not interested
    DELETE FROM public.relationships
    WHERE user_id = auth.uid()
      AND related_entity_type = 'event'
      AND related_entity_id = v_event_uuid
      AND relationship_type = 'interest';
  END IF;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.set_user_interest(TEXT, BOOLEAN) TO authenticated;

-- Create a helper function to check if user is interested (for debugging/verification)
CREATE OR REPLACE FUNCTION public.check_user_interest(
  p_event_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_uuid UUID;
  v_exists BOOLEAN;
BEGIN
  -- Convert TEXT to UUID
  BEGIN
    v_event_uuid := p_event_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    SELECT id INTO v_event_uuid
    FROM public.events
    WHERE jambase_event_id = p_event_id
    LIMIT 1;
    
    IF v_event_uuid IS NULL THEN
      RETURN false;
    END IF;
  END;
  
  -- Check if relationship exists
  SELECT EXISTS (
    SELECT 1 FROM public.relationships
    WHERE user_id = auth.uid()
      AND related_entity_type = 'event'
      AND related_entity_id = v_event_uuid
      AND relationship_type = 'interest'
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_user_interest(TEXT) TO authenticated;

COMMIT;

