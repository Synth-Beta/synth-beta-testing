-- ============================================
-- UPDATE RELATIONSHIPS TABLE FOR EVENTS ONLY
-- ============================================
-- Restrict relationships table to event interests only
-- Event interests: going, maybe, interest, not_going

-- First, drop existing relationships table and recreate with event-only constraints
DROP TABLE IF EXISTS public.relationships CASCADE;

CREATE TABLE IF NOT EXISTS public.relationships (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  related_entity_type TEXT NOT NULL CHECK (related_entity_type = 'event'),  -- ONLY events
  related_entity_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,  -- Event ID
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'going',       -- User is going to event
    'maybe',       -- User might go to event
    'interest',    -- User is interested in event
    'not_going'    -- User is not going to event
  )),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, related_entity_id, relationship_type)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_relationships_user_id 
  ON public.relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_relationships_entity_id 
  ON public.relationships(related_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_type 
  ON public.relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_user_type 
  ON public.relationships(user_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_created_at 
  ON public.relationships(created_at DESC);

-- ENABLE RLS
ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES
-- Users can view event interests (public)
DROP POLICY IF EXISTS "Users can view event relationships" ON public.relationships;
CREATE POLICY "Users can view event relationships"
ON public.relationships FOR SELECT
USING (true);  -- Event interests are public

-- Users can create their own event relationships
DROP POLICY IF EXISTS "Users can create their own event relationships" ON public.relationships;
CREATE POLICY "Users can create their own event relationships"
ON public.relationships FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own event relationships
DROP POLICY IF EXISTS "Users can update their own event relationships" ON public.relationships;
CREATE POLICY "Users can update their own event relationships"
ON public.relationships FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own event relationships
DROP POLICY IF EXISTS "Users can delete their own event relationships" ON public.relationships;
CREATE POLICY "Users can delete their own event relationships"
ON public.relationships FOR DELETE
USING (auth.uid() = user_id);

-- Admins can manage all relationships
DROP POLICY IF EXISTS "Admins can manage all relationships" ON public.relationships;
CREATE POLICY "Admins can manage all relationships"
ON public.relationships FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- FUNCTION: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_relationships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGER: Auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_relationships_updated_at ON public.relationships;
CREATE TRIGGER trigger_update_relationships_updated_at
  BEFORE UPDATE ON public.relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_relationships_updated_at();

COMMENT ON TABLE public.relationships IS 
'Unified table tracking user event interests: going, maybe, interest, not_going';

COMMENT ON COLUMN public.relationships.related_entity_type IS 
'Always "event" - this table is for event interests only';

COMMENT ON COLUMN public.relationships.relationship_type IS 
'Type of event interest: going, maybe, interest, not_going';

