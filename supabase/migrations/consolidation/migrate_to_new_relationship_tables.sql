-- ============================================
-- MIGRATE TO NEW RELATIONSHIP TABLES
-- ============================================
-- Migrates data from old relationships table to new follows, user_relationships, and relationships tables
-- This script will create the required tables if they don't exist

-- ============================================
-- CREATE TABLES IF THEY DON'T EXIST
-- ============================================

-- Create follows table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.follows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  followed_entity_type TEXT NOT NULL CHECK (followed_entity_type IN ('artist', 'venue', 'user')),
  followed_entity_id UUID NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, followed_entity_type, followed_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_user_id ON public.follows(user_id);
CREATE INDEX IF NOT EXISTS idx_follows_entity_type ON public.follows(followed_entity_type);
CREATE INDEX IF NOT EXISTS idx_follows_entity_id ON public.follows(followed_entity_id);
CREATE INDEX IF NOT EXISTS idx_follows_user_entity ON public.follows(user_id, followed_entity_type);

ALTER TABLE public.follows ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own follows" ON public.follows;
CREATE POLICY "Users can view their own follows"
ON public.follows FOR SELECT
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own follows" ON public.follows;
CREATE POLICY "Users can insert their own follows"
ON public.follows FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own follows" ON public.follows;
CREATE POLICY "Users can delete their own follows"
ON public.follows FOR DELETE
USING (auth.uid() = user_id);

-- Create user_relationships table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.user_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  related_user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('friend', 'match', 'block')),
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'blocked')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (user_id != related_user_id),
  UNIQUE(user_id, related_user_id, relationship_type)
);

CREATE INDEX IF NOT EXISTS idx_user_relationships_user_id ON public.user_relationships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_relationships_related_user_id ON public.user_relationships(related_user_id);
CREATE INDEX IF NOT EXISTS idx_user_relationships_type ON public.user_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_user_relationships_status ON public.user_relationships(status);

ALTER TABLE public.user_relationships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own relationships" ON public.user_relationships;
CREATE POLICY "Users can view their own relationships"
ON public.user_relationships FOR SELECT
USING (auth.uid() = user_id OR auth.uid() = related_user_id);

DROP POLICY IF EXISTS "Users can insert their own relationships" ON public.user_relationships;
CREATE POLICY "Users can insert their own relationships"
ON public.user_relationships FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own relationships" ON public.user_relationships;
CREATE POLICY "Users can update their own relationships"
ON public.user_relationships FOR UPDATE
USING (auth.uid() = user_id OR auth.uid() = related_user_id);

-- Ensure relationships table exists for events (will be recreated by update_relationships_for_events.sql if needed)
-- For now, just check if it exists and has the right structure
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'relationships'
  ) THEN
    -- Create basic relationships table for events
    CREATE TABLE public.relationships (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
      related_entity_type TEXT NOT NULL CHECK (related_entity_type = 'event'),
      related_entity_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
      relationship_type TEXT NOT NULL CHECK (relationship_type IN ('interest', 'going', 'maybe', 'not_going')),
      metadata JSONB DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE(user_id, related_entity_id, relationship_type)
    );
    
    CREATE INDEX IF NOT EXISTS idx_relationships_user_id ON public.relationships(user_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_entity_id ON public.relationships(related_entity_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_type ON public.relationships(relationship_type);
    
    ALTER TABLE public.relationships ENABLE ROW LEVEL SECURITY;
  END IF;
END $$;

-- ============================================
-- 1. MIGRATE FOLLOWS (from relationships where relationship_type='follow')
-- ============================================
INSERT INTO public.follows (
  id,
  user_id,
  followed_entity_type,
  followed_entity_id,
  metadata,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  r.user_id,
  r.related_entity_type::TEXT as followed_entity_type,  -- artist, venue, user
  CASE 
    WHEN r.related_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
    THEN r.related_entity_id::UUID 
    ELSE NULL
  END as followed_entity_id,
  r.metadata,
  r.created_at,
  r.updated_at
FROM public.relationships r
WHERE r.relationship_type = 'follow'
  AND r.related_entity_type IN ('artist', 'venue', 'user')
  AND r.related_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (user_id, followed_entity_type, followed_entity_id) DO NOTHING;

-- Also migrate from user_artist_interactions where interaction_type='follow'
INSERT INTO public.follows (
  id,
  user_id,
  followed_entity_type,
  followed_entity_id,
  metadata,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  uai.user_id,
  'artist' as followed_entity_type,
  uai.artist_id,
  uai.metadata,
  uai.created_at,
  uai.created_at as updated_at  -- user_artist_interactions doesn't have updated_at
FROM public.user_artist_interactions uai
WHERE uai.interaction_type = 'follow'
  AND uai.artist_id IS NOT NULL
ON CONFLICT (user_id, followed_entity_type, followed_entity_id) DO NOTHING;

-- ============================================
-- 2. MIGRATE USER RELATIONSHIPS (from relationships where related_entity_type='user')
-- ============================================
INSERT INTO public.user_relationships (
  id,
  user_id,
  related_user_id,
  relationship_type,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  r.user_id,
  CASE 
    WHEN r.related_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
    THEN r.related_entity_id::UUID 
    ELSE NULL
  END as related_user_id,
  r.relationship_type as relationship_type,  -- friend, match, block
  r.status,
  r.metadata,
  r.created_at,
  r.updated_at
FROM public.relationships r
WHERE r.related_entity_type = 'user'
  AND r.relationship_type IN ('friend', 'match', 'block')
  AND r.related_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND r.user_id != r.related_entity_id::UUID  -- No self-relationships
ON CONFLICT (user_id, related_user_id, relationship_type) DO NOTHING;

-- Migrate from old friends table
INSERT INTO public.user_relationships (
  id,
  user_id,
  related_user_id,
  relationship_type,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  f.user1_id,
  f.user2_id,
  'friend' as relationship_type,
  'accepted' as status,
  jsonb_build_object(
    'original_table', 'friends',
    'original_id', f.id
  ) as metadata,
  COALESCE(f.created_at, now()),
  COALESCE(f.updated_at, now())
FROM public.friends f
WHERE f.user1_id != f.user2_id
ON CONFLICT (user_id, related_user_id, relationship_type) DO NOTHING;

-- Also insert reverse relationship (bidirectional friend)
INSERT INTO public.user_relationships (
  id,
  user_id,
  related_user_id,
  relationship_type,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  f.user2_id,
  f.user1_id,
  'friend' as relationship_type,
  'accepted' as status,
  jsonb_build_object(
    'original_table', 'friends',
    'original_id', f.id,
    'reverse', true
  ) as metadata,
  COALESCE(f.created_at, now()),
  COALESCE(f.updated_at, now())
FROM public.friends f
WHERE f.user1_id != f.user2_id
ON CONFLICT (user_id, related_user_id, relationship_type) DO NOTHING;

-- Migrate from friend_requests table
INSERT INTO public.user_relationships (
  id,
  user_id,
  related_user_id,
  relationship_type,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  fr.requester_id,
  fr.requestee_id,
  'friend' as relationship_type,
  COALESCE(fr.status, 'pending') as status,
  jsonb_build_object(
    'original_table', 'friend_requests',
    'original_id', fr.id
  ) as metadata,
  fr.created_at,
  fr.updated_at
FROM public.friend_requests fr
WHERE fr.requester_id != fr.requestee_id
ON CONFLICT (user_id, related_user_id, relationship_type) DO NOTHING;

-- Migrate from matches table
INSERT INTO public.user_relationships (
  id,
  user_id,
  related_user_id,
  relationship_type,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  m.user1_id,
  m.user2_id,
  'match' as relationship_type,
  'accepted' as status,
  jsonb_build_object(
    'original_table', 'matches',
    'original_id', m.id,
    'event_id', m.event_id
  ) as metadata,
  m.created_at,
  m.updated_at
FROM public.matches m
WHERE m.user1_id != m.user2_id
ON CONFLICT (user_id, related_user_id, relationship_type) DO NOTHING;

-- Also insert reverse match (bidirectional)
INSERT INTO public.user_relationships (
  id,
  user_id,
  related_user_id,
  relationship_type,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  m.user2_id,
  m.user1_id,
  'match' as relationship_type,
  'accepted' as status,
  jsonb_build_object(
    'original_table', 'matches',
    'original_id', m.id,
    'event_id', m.event_id,
    'reverse', true
  ) as metadata,
  m.created_at,
  m.updated_at
FROM public.matches m
WHERE m.user1_id != m.user2_id
ON CONFLICT (user_id, related_user_id, relationship_type) DO NOTHING;

-- ============================================
-- 3. MIGRATE EVENT INTERESTS (to relationships table)
-- ============================================
-- Note: This should be run AFTER update_relationships_for_events.sql creates the new table
-- The old relationships table should already be backed up in temp_relationships_backup
-- This assumes you're running the complete consolidation script

-- Also migrate from old user_jambase_events table
INSERT INTO public.relationships (
  id,
  user_id,
  related_entity_type,
  related_entity_id,
  relationship_type,
  metadata,
  created_at,
  updated_at
)
SELECT 
  gen_random_uuid(),
  uje.user_id,
  'event' as related_entity_type,
  uje.jambase_event_id::UUID as related_entity_id,  -- Assuming this maps to events.id
  CASE 
    WHEN uje.interested = true THEN 'interest'
    WHEN uje.going = true THEN 'going'
    WHEN uje.maybe = true THEN 'maybe'
    ELSE 'interest'
  END as relationship_type,
  jsonb_build_object(
    'original_table', 'user_jambase_events',
    'original_id', uje.id
  ) as metadata,
  uje.created_at,
  uje.updated_at
FROM public.user_jambase_events uje
WHERE uje.jambase_event_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (user_id, related_entity_id, relationship_type) DO NOTHING;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
SELECT 
  'follows (from relationships)' as source,
  COUNT(*) as migrated_count
FROM public.follows
WHERE metadata->>'original_table' = 'relationships'

UNION ALL

SELECT 
  'follows (from user_artist_interactions)' as source,
  COUNT(*) as migrated_count
FROM public.follows
WHERE metadata->>'original_table' = 'user_artist_interactions'

UNION ALL

SELECT 
  'user_relationships (from relationships)' as source,
  COUNT(*) as migrated_count
FROM public.user_relationships
WHERE metadata->>'original_table' = 'relationships'

UNION ALL

SELECT 
  'user_relationships (from friends)' as source,
  COUNT(*) as migrated_count
FROM public.user_relationships
WHERE metadata->>'original_table' = 'friends'

UNION ALL

SELECT 
  'user_relationships (from friend_requests)' as source,
  COUNT(*) as migrated_count
FROM public.user_relationships
WHERE metadata->>'original_table' = 'friend_requests'

UNION ALL

SELECT 
  'user_relationships (from matches)' as source,
  COUNT(*) as migrated_count
FROM public.user_relationships
WHERE metadata->>'original_table' = 'matches'

UNION ALL

SELECT 
  'relationships (event interests)' as source,
  COUNT(*) as migrated_count
FROM public.relationships
WHERE related_entity_type = 'event';

