-- ============================================
-- DATABASE CONSOLIDATION: PHASE 3 - MIGRATE RELATIONSHIPS
-- ============================================
-- This migration migrates all relationship data to unified relationships table
-- Run this AFTER Phase 3.1 (migrate core entities) is complete

-- ============================================
-- 3.2.1 MIGRATE ARTIST_FOLLOWS → RELATIONSHIPS
-- ============================================

-- Migrate artist_follows to relationships_new
INSERT INTO public.relationships_new (
  user_id,
  related_entity_type,
  related_entity_id,
  relationship_type,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT 
  af.user_id,
  'artist' as related_entity_type,
  an.id::TEXT as related_entity_id, -- Convert UUID to TEXT
  'follow' as relationship_type,
  'accepted' as status,
  jsonb_build_object(
    'artist_name', an.name,
    'jambase_artist_id', an.jambase_artist_id
  ) as metadata,
  af.created_at,
  COALESCE(af.updated_at, af.created_at) as updated_at
FROM public.artist_follows af
JOIN public.artists_new an ON af.artist_id = an.id
ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_artist_follows_count INTEGER;
  v_relationships_artist_follows_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_artist_follows_count FROM public.artist_follows;
  SELECT COUNT(*) INTO v_relationships_artist_follows_count 
  FROM public.relationships_new 
  WHERE related_entity_type = 'artist' AND relationship_type = 'follow';
  
  IF v_artist_follows_count != v_relationships_artist_follows_count THEN
    RAISE WARNING 'Artist follows migration mismatch: artist_follows=%, relationships=%', 
      v_artist_follows_count, v_relationships_artist_follows_count;
  ELSE
    RAISE NOTICE 'Artist follows migration successful: % rows migrated', v_relationships_artist_follows_count;
  END IF;
END $$;

-- ============================================
-- 3.2.2 MIGRATE VENUE_FOLLOWS → RELATIONSHIPS
-- ============================================

-- Migrate venue_follows to relationships_new
-- Note: venue_follows uses name+city+state, not UUID
INSERT INTO public.relationships_new (
  user_id,
  related_entity_type,
  related_entity_id,
  relationship_type,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT 
  vf.user_id,
  'venue' as related_entity_type,
  COALESCE(vn.id::TEXT, vf.venue_name || '|' || COALESCE(vf.venue_city, '') || '|' || COALESCE(vf.venue_state, '')) as related_entity_id,
  'follow' as relationship_type,
  'accepted' as status,
  jsonb_build_object(
    'venue_name', vf.venue_name,
    'venue_city', vf.venue_city,
    'venue_state', vf.venue_state,
    'venue_id', vn.id
  ) as metadata,
  vf.created_at,
  vf.updated_at
FROM public.venue_follows vf
LEFT JOIN public.venues_new vn ON vf.venue_name = vn.name 
  AND vf.venue_city = (vn.address->>'addressLocality')
  AND vf.venue_state = (vn.address->>'addressRegion')
ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_venue_follows_count INTEGER;
  v_relationships_venue_follows_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_venue_follows_count FROM public.venue_follows;
  SELECT COUNT(*) INTO v_relationships_venue_follows_count 
  FROM public.relationships_new 
  WHERE related_entity_type = 'venue' AND relationship_type = 'follow';
  
  IF v_venue_follows_count != v_relationships_venue_follows_count THEN
    RAISE WARNING 'Venue follows migration mismatch: venue_follows=%, relationships=%', 
      v_venue_follows_count, v_relationships_venue_follows_count;
  ELSE
    RAISE NOTICE 'Venue follows migration successful: % rows migrated', v_relationships_venue_follows_count;
  END IF;
END $$;

-- ============================================
-- 3.2.3 MIGRATE USER_JAMBASE_EVENTS → RELATIONSHIPS
-- ============================================

-- Migrate user_jambase_events to relationships_new
-- Convert rsvp_status to relationship_type ('interest', 'going', 'maybe', 'not_going')
INSERT INTO public.relationships_new (
  user_id,
  related_entity_type,
  related_entity_id,
  relationship_type,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT 
  uje.user_id,
  'event' as related_entity_type,
  uje.jambase_event_id::TEXT as related_entity_id,
  CASE 
    WHEN uje.rsvp_status = 'going' THEN 'going'
    WHEN uje.rsvp_status = 'maybe' THEN 'maybe'
    WHEN uje.rsvp_status = 'not_going' THEN 'not_going'
    ELSE 'interest' -- Default to 'interest' if rsvp_status is NULL or 'interested'
  END as relationship_type,
  'accepted' as status,
  jsonb_build_object(
    'rsvp_status', uje.rsvp_status,
    'event_id', uje.jambase_event_id
  ) as metadata,
  uje.created_at,
  uje.created_at as updated_at
FROM public.user_jambase_events uje
ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_user_jambase_events_count INTEGER;
  v_relationships_event_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_user_jambase_events_count FROM public.user_jambase_events;
  SELECT COUNT(*) INTO v_relationships_event_count 
  FROM public.relationships_new 
  WHERE related_entity_type = 'event';
  
  -- Note: user_jambase_events might create multiple relationship types (interest, going, maybe)
  -- so the counts might not match exactly
  RAISE NOTICE 'Event interests migration: user_jambase_events=%, relationships=%', 
    v_user_jambase_events_count, v_relationships_event_count;
END $$;

-- ============================================
-- 3.2.4 MIGRATE FRIENDS → RELATIONSHIPS
-- ============================================

-- Migrate friends to relationships_new
-- Create 2 rows for each friendship (bidirectional)
INSERT INTO public.relationships_new (
  user_id,
  related_entity_type,
  related_entity_id,
  relationship_type,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT 
  f.user1_id as user_id,
  'user' as related_entity_type,
  f.user2_id::TEXT as related_entity_id,
  'friend' as relationship_type,
  'accepted' as status,
  jsonb_build_object(
    'friendship_id', f.id,
    'friend_user_id', f.user2_id
  ) as metadata,
  f.created_at,
  f.created_at as updated_at
FROM public.friends f
UNION ALL
SELECT 
  f.user2_id as user_id,
  'user' as related_entity_type,
  f.user1_id::TEXT as related_entity_id,
  'friend' as relationship_type,
  'accepted' as status,
  jsonb_build_object(
    'friendship_id', f.id,
    'friend_user_id', f.user1_id
  ) as metadata,
  f.created_at,
  f.created_at as updated_at
FROM public.friends f
ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_friends_count INTEGER;
  v_relationships_friends_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_friends_count FROM public.friends;
  SELECT COUNT(*) INTO v_relationships_friends_count 
  FROM public.relationships_new 
  WHERE related_entity_type = 'user' AND relationship_type = 'friend';
  
  -- Friends table creates 2 relationship rows per friendship
  IF v_friends_count * 2 != v_relationships_friends_count THEN
    RAISE WARNING 'Friends migration mismatch: friends=%, relationships=% (expected %)', 
      v_friends_count, v_relationships_friends_count, v_friends_count * 2;
  ELSE
    RAISE NOTICE 'Friends migration successful: % friendships migrated (% relationship rows)', 
      v_friends_count, v_relationships_friends_count;
  END IF;
END $$;

-- ============================================
-- 3.2.5 MIGRATE FRIEND_REQUESTS → RELATIONSHIPS
-- ============================================

-- Migrate friend_requests to relationships_new
INSERT INTO public.relationships_new (
  user_id,
  related_entity_type,
  related_entity_id,
  relationship_type,
  status,
  metadata,
  created_at,
  updated_at
)
SELECT 
  fr.sender_id as user_id,
  'user' as related_entity_type,
  fr.receiver_id::TEXT as related_entity_id,
  'friend' as relationship_type,
  fr.status, -- 'pending', 'accepted', 'declined'
  jsonb_build_object(
    'friend_request_id', fr.id,
    'sender_id', fr.sender_id,
    'receiver_id', fr.receiver_id
  ) as metadata,
  fr.created_at,
  fr.updated_at
FROM public.friend_requests fr
ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_friend_requests_count INTEGER;
  v_relationships_friend_requests_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_friend_requests_count FROM public.friend_requests;
  SELECT COUNT(*) INTO v_relationships_friend_requests_count 
  FROM public.relationships_new 
  WHERE related_entity_type = 'user' 
    AND relationship_type = 'friend' 
    AND status = 'pending';
  
  RAISE NOTICE 'Friend requests migration: friend_requests=%, relationships (pending)=%', 
    v_friend_requests_count, v_relationships_friend_requests_count;
END $$;

-- ============================================
-- 3.2.6 MIGRATE MATCHES → RELATIONSHIPS
-- ============================================

-- Migrate matches to relationships_new (if matches table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'matches') THEN
    -- Migrate matches
    INSERT INTO public.relationships_new (
      user_id,
      related_entity_type,
      related_entity_id,
      relationship_type,
      status,
      metadata,
      created_at,
      updated_at
    )
    SELECT 
      m.user1_id as user_id,
      'user' as related_entity_type,
      m.user2_id::TEXT as related_entity_id,
      'match' as relationship_type,
      'accepted' as status,
      jsonb_build_object(
        'match_id', m.id,
        'event_id', m.event_id,
        'matched_user_id', m.user2_id
      ) as metadata,
      m.created_at,
      m.created_at as updated_at
    FROM public.matches m
    ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) DO NOTHING;
    
    -- Also create reverse relationship (bidirectional match)
    INSERT INTO public.relationships_new (
      user_id,
      related_entity_type,
      related_entity_id,
      relationship_type,
      status,
      metadata,
      created_at,
      updated_at
    )
    SELECT 
      m.user2_id as user_id,
      'user' as related_entity_type,
      m.user1_id::TEXT as related_entity_id,
      'match' as relationship_type,
      'accepted' as status,
      jsonb_build_object(
        'match_id', m.id,
        'event_id', m.event_id,
        'matched_user_id', m.user1_id
      ) as metadata,
      m.created_at,
      m.created_at as updated_at
    FROM public.matches m
    ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) DO NOTHING;
    
    RAISE NOTICE 'Matches migration completed';
  ELSE
    RAISE NOTICE 'Matches table does not exist, skipping migration';
  END IF;
END $$;

-- ============================================
-- 3.2.7 MIGRATE USER_BLOCKS → RELATIONSHIPS
-- ============================================

-- Migrate user_blocks to relationships_new (if user_blocks table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_blocks') THEN
    -- Migrate user_blocks
    INSERT INTO public.relationships_new (
      user_id,
      related_entity_type,
      related_entity_id,
      relationship_type,
      status,
      metadata,
      created_at,
      updated_at
    )
    SELECT 
      ub.blocker_user_id as user_id,
      'user' as related_entity_type,
      ub.blocked_user_id::TEXT as related_entity_id,
      'block' as relationship_type,
      'accepted' as status,
      jsonb_build_object(
        'block_id', ub.id,
        'block_reason', ub.block_reason,
        'blocked_user_id', ub.blocked_user_id
      ) as metadata,
      ub.created_at,
      ub.created_at as updated_at
    FROM public.user_blocks ub
    ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) DO NOTHING;
    
    RAISE NOTICE 'User blocks migration completed';
  ELSE
    RAISE NOTICE 'User_blocks table does not exist, skipping migration';
  END IF;
END $$;

-- ============================================
-- 3.2.8 MIGRATE USER_SWIPES → ENGAGEMENTS
-- ============================================

-- Migrate user_swipes to engagements_new (if user_swipes table exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_swipes') THEN
    -- Migrate user_swipes
    -- Note: user_swipes uses swiper_user_id, swiped_user_id, and is_interested (boolean)
    INSERT INTO public.engagements_new (
      user_id,
      entity_type,
      entity_id,
      engagement_type,
      engagement_value,
      metadata,
      created_at
    )
    SELECT 
      us.swiper_user_id as user_id,
      'user' as entity_type,
      us.swiped_user_id as entity_id, -- Keep as UUID, not TEXT
      'swipe' as engagement_type,
      CASE 
        WHEN us.is_interested = true THEN 'right'
        ELSE 'left'
      END as engagement_value,
      jsonb_build_object(
        'swipe_id', us.id,
        'event_id', us.event_id,
        'swiped_user_id', us.swiped_user_id,
        'is_interested', us.is_interested
      ) as metadata,
      us.created_at
    FROM public.user_swipes us
    ON CONFLICT (user_id, entity_type, entity_id, engagement_type) DO NOTHING;
    
    RAISE NOTICE 'User swipes migration completed';
  ELSE
    RAISE NOTICE 'User_swipes table does not exist, skipping migration';
  END IF;
END $$;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify all relationships migrated
SELECT 
  'Relationships migration complete' as status,
  (SELECT COUNT(*) FROM public.relationships_new WHERE related_entity_type = 'artist' AND relationship_type = 'follow') as artist_follows_count,
  (SELECT COUNT(*) FROM public.relationships_new WHERE related_entity_type = 'venue' AND relationship_type = 'follow') as venue_follows_count,
  (SELECT COUNT(*) FROM public.relationships_new WHERE related_entity_type = 'event') as event_relationships_count,
  (SELECT COUNT(*) FROM public.relationships_new WHERE related_entity_type = 'user' AND relationship_type = 'friend') as friends_count,
  (SELECT COUNT(*) FROM public.relationships_new WHERE related_entity_type = 'user' AND relationship_type = 'match') as matches_count,
  (SELECT COUNT(*) FROM public.relationships_new WHERE related_entity_type = 'user' AND relationship_type = 'block') as blocks_count,
  (SELECT COUNT(*) FROM public.relationships_new) as total_relationships_count,
  (SELECT COUNT(*) FROM public.artist_follows) as artist_follows_old_count,
  (SELECT COUNT(*) FROM public.venue_follows) as venue_follows_old_count,
  (SELECT COUNT(*) FROM public.user_jambase_events) as user_jambase_events_old_count,
  (SELECT COUNT(*) FROM public.friends) as friends_old_count,
  (SELECT COUNT(*) FROM public.friend_requests) as friend_requests_old_count;

