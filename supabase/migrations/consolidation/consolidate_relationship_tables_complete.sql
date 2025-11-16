-- ============================================
-- COMPLETE RELATIONSHIP TABLE CONSOLIDATION
-- ============================================
-- Run this script in order:
-- 1. Create new tables (follows, user_relationships)
-- 2. Migrate data to new tables
-- 3. Update relationships table for events only
-- 4. Migrate event interests
-- 5. Drop unused tables
-- ============================================

-- STEP 1: Store existing relationships data before dropping
CREATE TEMP TABLE IF NOT EXISTS temp_relationships_backup AS
SELECT * FROM public.relationships;

-- STEP 2: Create new follows table
\i supabase/migrations/consolidation/create_follows_table.sql

-- STEP 3: Create new user_relationships table
\i supabase/migrations/consolidation/create_user_relationships_table.sql

-- STEP 4: Migrate follows data
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
  r.related_entity_type::TEXT as followed_entity_type,
  CASE 
    WHEN r.related_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
    THEN r.related_entity_id::UUID 
    ELSE NULL
  END as followed_entity_id,
  r.metadata,
  r.created_at,
  r.updated_at
FROM temp_relationships_backup r
WHERE r.relationship_type = 'follow'
  AND r.related_entity_type IN ('artist', 'venue', 'user')
  AND r.related_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (user_id, followed_entity_type, followed_entity_id) DO NOTHING;

-- Migrate from user_artist_interactions
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
  uai.updated_at
FROM public.user_artist_interactions uai
WHERE uai.interaction_type = 'follow'
  AND uai.artist_id IS NOT NULL
ON CONFLICT (user_id, followed_entity_type, followed_entity_id) DO NOTHING;

-- STEP 5: Migrate user_relationships data
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
  r.related_entity_id::UUID as related_user_id,
  r.relationship_type,
  r.status,
  r.metadata,
  r.created_at,
  r.updated_at
FROM temp_relationships_backup r
WHERE r.related_entity_type = 'user'
  AND r.relationship_type IN ('friend', 'match', 'block')
  AND r.related_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  AND r.user_id != r.related_entity_id::UUID
ON CONFLICT (user_id, related_user_id, relationship_type) DO NOTHING;

-- Migrate from friends table
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
  jsonb_build_object('original_table', 'friends', 'original_id', f.id),
  COALESCE(f.created_at, now()),
  COALESCE(f.updated_at, now())
FROM public.friends f
WHERE f.user1_id != f.user2_id
ON CONFLICT (user_id, related_user_id, relationship_type) DO NOTHING;

-- Insert reverse (bidirectional)
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
  jsonb_build_object('original_table', 'friends', 'original_id', f.id, 'reverse', true),
  COALESCE(f.created_at, now()),
  COALESCE(f.updated_at, now())
FROM public.friends f
WHERE f.user1_id != f.user2_id
ON CONFLICT (user_id, related_user_id, relationship_type) DO NOTHING;

-- Migrate from friend_requests
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
  COALESCE(fr.status, 'pending')::TEXT,
  jsonb_build_object('original_table', 'friend_requests', 'original_id', fr.id),
  fr.created_at,
  fr.updated_at
FROM public.friend_requests fr
WHERE fr.requester_id != fr.requestee_id
ON CONFLICT (user_id, related_user_id, relationship_type) DO NOTHING;

-- Migrate from matches
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
  jsonb_build_object('original_table', 'matches', 'original_id', m.id, 'event_id', m.event_id),
  m.created_at,
  m.updated_at
FROM public.matches m
WHERE m.user1_id != m.user2_id
ON CONFLICT (user_id, related_user_id, relationship_type) DO NOTHING;

-- Insert reverse match
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
  jsonb_build_object('original_table', 'matches', 'original_id', m.id, 'event_id', m.event_id, 'reverse', true),
  m.created_at,
  m.updated_at
FROM public.matches m
WHERE m.user1_id != m.user2_id
ON CONFLICT (user_id, related_user_id, relationship_type) DO NOTHING;

-- STEP 6: Update relationships table for events only
\i supabase/migrations/consolidation/update_relationships_for_events.sql

-- STEP 7: Migrate event interests to new relationships table
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
  r.user_id,
  'event' as related_entity_type,
  r.related_entity_id::UUID,
  r.relationship_type,
  r.metadata,
  r.created_at,
  r.updated_at
FROM temp_relationships_backup r
WHERE r.related_entity_type = 'event'
  AND r.relationship_type IN ('going', 'maybe', 'interest', 'not_going')
  AND r.related_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (user_id, related_entity_id, relationship_type) DO NOTHING;

-- Migrate from user_jambase_events
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
  uje.jambase_event_id::UUID,
  CASE 
    WHEN uje.interested = true THEN 'interest'
    WHEN uje.going = true THEN 'going'
    WHEN uje.maybe = true THEN 'maybe'
    ELSE 'interest'
  END,
  jsonb_build_object('original_table', 'user_jambase_events', 'original_id', uje.id),
  uje.created_at,
  uje.updated_at
FROM public.user_jambase_events uje
WHERE uje.jambase_event_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
ON CONFLICT (user_id, related_entity_id, relationship_type) DO NOTHING;

-- STEP 8: Drop unused tables
\i supabase/migrations/consolidation/drop_unused_tables.sql

-- Cleanup temp table
DROP TABLE IF EXISTS temp_relationships_backup;

