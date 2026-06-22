-- ============================================================
-- Auto-create verified group chats for popular artists and venues
-- ============================================================
-- This migration creates verified group chats for all artists
-- with >= 5 upcoming events and venues with >= 7 upcoming events
-- (based on averages: artist_avg ~4.49, venue_avg ~7.03)
-- Uses bulk INSERT for performance

-- Create verified chats for artists with >= 5 upcoming events
-- Only create chats for artists that don't already have one
INSERT INTO public.chats (
  chat_name,
  is_group_chat,
  entity_type,
  entity_id,
  entity_uuid,
  is_verified,
  member_count,
  users,
  created_at,
  updated_at
)
SELECT 
  a.name || ' Chat' AS chat_name,
  true AS is_group_chat,
  'artist' AS entity_type,
  COALESCE(a.jambase_artist_id, a.id::TEXT) AS entity_id,
  a.id AS entity_uuid,
  true AS is_verified,
  0 AS member_count,
  '{}'::UUID[] AS users,
  NOW() AS created_at,
  NOW() AS updated_at
FROM public.artists a
WHERE a.num_upcoming_events >= 5
  AND a.name IS NOT NULL
  AND (a.id IS NOT NULL OR a.jambase_artist_id IS NOT NULL)
  -- Exclude artists that already have a verified chat
  AND NOT EXISTS (
    SELECT 1
    FROM public.chats c
    WHERE c.entity_type = 'artist'
      AND c.is_verified = true
      AND (
        c.entity_uuid = a.id
        OR c.entity_id = a.jambase_artist_id
        OR c.entity_id = a.id::TEXT
      )
  )
ON CONFLICT DO NOTHING;

-- Create verified chats for venues with >= 7 upcoming events
-- Only create chats for venues that don't already have one
INSERT INTO public.chats (
  chat_name,
  is_group_chat,
  entity_type,
  entity_id,
  entity_uuid,
  is_verified,
  member_count,
  users,
  created_at,
  updated_at
)
SELECT 
  v.name || ' Chat' AS chat_name,
  true AS is_group_chat,
  'venue' AS entity_type,
  COALESCE(v.jambase_venue_id, v.id::TEXT) AS entity_id,
  v.id AS entity_uuid,
  true AS is_verified,
  0 AS member_count,
  '{}'::UUID[] AS users,
  NOW() AS created_at,
  NOW() AS updated_at
FROM public.venues v
WHERE v.num_upcoming_events >= 7
  AND v.name IS NOT NULL
  AND (v.id IS NOT NULL OR v.jambase_venue_id IS NOT NULL)
  -- Exclude venues that already have a verified chat
  AND NOT EXISTS (
    SELECT 1
    FROM public.chats c
    WHERE c.entity_type = 'venue'
      AND c.is_verified = true
      AND (
        c.entity_uuid = v.id
        OR c.entity_id = v.jambase_venue_id
        OR c.entity_id = v.id::TEXT
      )
  )
ON CONFLICT DO NOTHING;

-- Log summary
DO $$
DECLARE
  v_artist_count INTEGER;
  v_venue_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_artist_count
  FROM public.chats
  WHERE entity_type = 'artist' AND is_verified = true;
  
  SELECT COUNT(*) INTO v_venue_count
  FROM public.chats
  WHERE entity_type = 'venue' AND is_verified = true;
  
  RAISE NOTICE 'Migration completed! Verified chats: % artists, % venues', v_artist_count, v_venue_count;
END $$;

