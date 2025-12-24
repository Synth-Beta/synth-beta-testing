-- Verification query to check verified chat coverage for entities
-- This shows which entities have verified chats and which don't

-- Summary: Count of entities with and without verified chats
WITH entity_counts AS (
  -- Events
  SELECT 
    'event' AS entity_type,
    COUNT(*) AS total_entities,
    COUNT(DISTINCT c.entity_uuid) FILTER (WHERE c.is_verified = true) AS entities_with_chat,
    COUNT(*) - COUNT(DISTINCT c.entity_uuid) FILTER (WHERE c.is_verified = true) AS entities_without_chat
  FROM public.events e
  LEFT JOIN public.chats c ON c.entity_type = 'event' AND c.entity_uuid = e.id AND c.is_verified = true
  
  UNION ALL
  
  -- Artists
  SELECT 
    'artist' AS entity_type,
    COUNT(*) AS total_entities,
    COUNT(DISTINCT c.entity_uuid) FILTER (WHERE c.is_verified = true) AS entities_with_chat,
    COUNT(*) - COUNT(DISTINCT c.entity_uuid) FILTER (WHERE c.is_verified = true) AS entities_without_chat
  FROM public.artists a
  LEFT JOIN public.chats c ON c.entity_type = 'artist' AND c.entity_uuid = a.id AND c.is_verified = true
  
  UNION ALL
  
  -- Venues
  SELECT 
    'venue' AS entity_type,
    COUNT(*) AS total_entities,
    COUNT(DISTINCT c.entity_uuid) FILTER (WHERE c.is_verified = true) AS entities_with_chat,
    COUNT(*) - COUNT(DISTINCT c.entity_uuid) FILTER (WHERE c.is_verified = true) AS entities_without_chat
  FROM public.venues v
  LEFT JOIN public.chats c ON c.entity_type = 'venue' AND c.entity_uuid = v.id AND c.is_verified = true
)
SELECT 
  entity_type,
  total_entities,
  entities_with_chat,
  entities_without_chat,
  ROUND(100.0 * entities_with_chat / NULLIF(total_entities, 0), 2) AS coverage_percent
FROM entity_counts
ORDER BY entity_type;

-- Detailed: Show sample entities without verified chats
SELECT 
  'Events without verified chats' AS category,
  e.id,
  e.title AS name,
  e.artist_name,
  e.event_date
FROM public.events e
WHERE NOT EXISTS (
  SELECT 1 FROM public.chats c 
  WHERE c.entity_type = 'event' 
    AND c.entity_uuid = e.id 
    AND c.is_verified = true
)
ORDER BY e.event_date DESC
LIMIT 10;

SELECT 
  'Artists without verified chats' AS category,
  a.id,
  a.name,
  a.jambase_artist_id
FROM public.artists a
WHERE NOT EXISTS (
  SELECT 1 FROM public.chats c 
  WHERE c.entity_type = 'artist' 
    AND c.entity_uuid = a.id 
    AND c.is_verified = true
)
ORDER BY a.name
LIMIT 10;

SELECT 
  'Venues without verified chats' AS category,
  v.id,
  v.name,
  v.jambase_venue_id
FROM public.venues v
WHERE NOT EXISTS (
  SELECT 1 FROM public.chats c 
  WHERE c.entity_type = 'venue' 
    AND c.entity_uuid = v.id 
    AND c.is_verified = true
)
ORDER BY v.name
LIMIT 10;

-- Show all verified chats that exist
SELECT 
  c.id AS chat_id,
  c.chat_name,
  c.entity_type,
  c.entity_id,
  c.entity_uuid,
  c.member_count,
  c.last_activity_at,
  c.created_at,
  CASE 
    WHEN c.entity_type = 'event' THEN e.title
    WHEN c.entity_type = 'artist' THEN a.name
    WHEN c.entity_type = 'venue' THEN v.name
  END AS entity_name
FROM public.chats c
LEFT JOIN public.events e ON c.entity_type = 'event' AND c.entity_uuid = e.id
LEFT JOIN public.artists a ON c.entity_type = 'artist' AND c.entity_uuid = a.id
LEFT JOIN public.venues v ON c.entity_type = 'venue' AND c.entity_uuid = v.id
WHERE c.is_verified = true
ORDER BY c.entity_type, c.created_at DESC;

