-- ============================================
-- CREATE USER_RELATIONSHIPS TABLE
-- ============================================
-- Unified table for user-to-user relationships only
-- Types: friend, match, block

CREATE TABLE IF NOT EXISTS public.user_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- WHO: Primary user
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  
  -- WITH WHOM: Other user in the relationship
  related_user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  
  -- WHAT: Type of relationship
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'friend',      -- Friend relationship (bidirectional after acceptance)
    'match',       -- Concert buddy match (bidirectional)
    'block'        -- Block relationship (unidirectional)
  )),
  
  -- STATUS: For friend relationships
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined')),
  
  -- METADATA
  metadata JSONB DEFAULT '{}',
  
  -- TIMESTAMPS
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- CONSTRAINTS
  UNIQUE(user_id, related_user_id, relationship_type),
  CONSTRAINT no_self_relationship CHECK (user_id != related_user_id)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_user_relationships_user_id 
  ON public.user_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_relationships_related_user_id 
  ON public.user_relationships(related_user_id);
CREATE INDEX IF NOT EXISTS idx_user_relationships_type 
  ON public.user_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_user_relationships_status 
  ON public.user_relationships(status);
CREATE INDEX IF NOT EXISTS idx_user_relationships_user_type 
  ON public.user_relationships(user_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_user_relationships_bidirectional 
  ON public.user_relationships(user_id, related_user_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_user_relationships_created_at 
  ON public.user_relationships(created_at DESC);

-- ENABLE RLS
ALTER TABLE public.user_relationships ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES
-- Users can view their own relationships
DROP POLICY IF EXISTS "Users can view their own relationships" ON public.user_relationships;
CREATE POLICY "Users can view their own relationships"
ON public.user_relationships FOR SELECT
USING (auth.uid() = user_id OR auth.uid() = related_user_id);

-- Users can create their own relationships
DROP POLICY IF EXISTS "Users can create their own relationships" ON public.user_relationships;
CREATE POLICY "Users can create their own relationships"
ON public.user_relationships FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own relationships (for friend request acceptance)
DROP POLICY IF EXISTS "Users can update their own relationships" ON public.user_relationships;
CREATE POLICY "Users can update their own relationships"
ON public.user_relationships FOR UPDATE
USING (auth.uid() = user_id OR auth.uid() = related_user_id)
WITH CHECK (auth.uid() = user_id OR auth.uid() = related_user_id);

-- Users can delete their own relationships
DROP POLICY IF EXISTS "Users can delete their own relationships" ON public.user_relationships;
CREATE POLICY "Users can delete their own relationships"
ON public.user_relationships FOR DELETE
USING (auth.uid() = user_id OR auth.uid() = related_user_id);

-- Admins can manage all relationships
DROP POLICY IF EXISTS "Admins can manage all relationships" ON public.user_relationships;
CREATE POLICY "Admins can manage all relationships"
ON public.user_relationships FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- FUNCTION: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_relationships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGER: Auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_user_relationships_updated_at ON public.user_relationships;
CREATE TRIGGER trigger_update_user_relationships_updated_at
  BEFORE UPDATE ON public.user_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_user_relationships_updated_at();

COMMENT ON TABLE public.user_relationships IS 
'Unified table tracking user-to-user relationships: friends, matches, and blocks';

COMMENT ON COLUMN public.user_relationships.relationship_type IS 
'Type of relationship: friend (requires acceptance), match (bidirectional), block (unidirectional)';

COMMENT ON COLUMN public.user_relationships.status IS 
'Status for friend relationships: pending, accepted, declined';

