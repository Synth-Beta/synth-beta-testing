-- ============================================
-- CREATE FOLLOWS TABLE
-- ============================================
-- Unified table for all follow types: artists, venues, users
-- Consolidates: artist follows, venue follows, user follows

CREATE TABLE IF NOT EXISTS public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- WHO: User doing the following
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  
  -- WHAT: Entity being followed (polymorphic)
  followed_entity_type TEXT NOT NULL CHECK (followed_entity_type IN (
    'artist', 'venue', 'user'
  )),
  followed_entity_id UUID NOT NULL,  -- artist_id, venue_id, or user_id
  
  -- METADATA
  metadata JSONB DEFAULT '{}',
  
  -- TIMESTAMPS
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- CONSTRAINTS
  UNIQUE(user_id, followed_entity_type, followed_entity_id)
);

-- INDEXES
CREATE INDEX IF NOT EXISTS idx_follows_user_id 
  ON public.follows(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_entity_type 
  ON public.follows(followed_entity_type);
CREATE INDEX IF NOT EXISTS idx_follows_entity_id 
  ON public.follows(followed_entity_id);
CREATE INDEX IF NOT EXISTS idx_follows_user_entity 
  ON public.follows(user_id, followed_entity_type);
CREATE INDEX IF NOT EXISTS idx_follows_created_at 
  ON public.follows(created_at DESC);

-- ENABLE RLS
ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

-- RLS POLICIES
-- Users can view their own follows
DROP POLICY IF EXISTS "Users can view their own follows" ON public.follows;
CREATE POLICY "Users can view their own follows"
ON public.follows FOR SELECT
USING (auth.uid() = user_id);

-- Users can view public follows (for follower/following counts)
DROP POLICY IF EXISTS "Users can view public follows" ON public.follows;
CREATE POLICY "Users can view public follows"
ON public.follows FOR SELECT
USING (true);  -- Public follows are viewable (for follower counts, etc.)

-- Users can create their own follows
DROP POLICY IF EXISTS "Users can create their own follows" ON public.follows;
CREATE POLICY "Users can create their own follows"
ON public.follows FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own follows
DROP POLICY IF EXISTS "Users can delete their own follows" ON public.follows;
CREATE POLICY "Users can delete their own follows"
ON public.follows FOR DELETE
USING (auth.uid() = user_id);

-- Admins can manage all follows
DROP POLICY IF EXISTS "Admins can manage all follows" ON public.follows;
CREATE POLICY "Admins can manage all follows"
ON public.follows FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- FUNCTION: Update updated_at timestamp
CREATE OR REPLACE FUNCTION update_follows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- TRIGGER: Auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_follows_updated_at ON public.follows;
CREATE TRIGGER trigger_update_follows_updated_at
  BEFORE UPDATE ON public.follows
  FOR EACH ROW
  EXECUTE FUNCTION update_follows_updated_at();

COMMENT ON TABLE public.follows IS 
'Unified table tracking all follow relationships: artists, venues, and users';

COMMENT ON COLUMN public.follows.followed_entity_type IS 
'Type of entity being followed: artist, venue, or user';

COMMENT ON COLUMN public.follows.followed_entity_id IS 
'UUID of the entity being followed (artist_id, venue_id, or user_id)';

