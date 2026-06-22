-- List all interactions, reviews, and interests on the given venues AND on events at those venues.
-- Venue IDs:
--   Union Stage, Jammin' Java, Pearl Street Warehouse, Howard Theatre,
--   The Miracle Theatre, Capital Turnaround, Nationals Park

WITH target_venues (id, name) AS (
  VALUES
    ('7643ca2f-9e1e-4b09-8c3d-aa8c373fd2ed'::uuid, 'Union Stage'),
    ('c2d74611-50a1-4e6f-8110-7f6fb37a680c'::uuid, 'Jammin'' Java'),
    ('ef3cba02-f948-4574-b262-5d27dbd0a5f9'::uuid, 'Pearl Street Warehouse'),
    ('0f95d17a-b952-480c-90a9-effdb956f457'::uuid, 'Howard Theatre'),
    ('51731c80-680f-4d26-811d-8e9de8428f19'::uuid, 'The Miracle Theatre'),
    ('9b4d91f9-fd65-40f7-855e-74ff8e62b424'::uuid, 'Capital Turnaround'),
    ('24cb610a-50f7-4a55-9f16-043abb8e5079'::uuid, 'Nationals Park')
),
-- Event IDs at those venues
target_events AS (
  SELECT e.id AS event_id, e.venue_id, v.name AS venue_name
  FROM public.events e
  JOIN target_venues v ON v.id = e.venue_id
),

-- 1) Interactions (venue/event views, clicks, etc.)
interactions_rows AS (
  SELECT
    i.id AS row_id,
    'interaction'::TEXT AS source,
    i.user_id,
    i.entity_type,
    i.entity_uuid,
    i.event_type AS event_or_relationship_type,
    COALESCE(i.occurred_at, i.created_at) AS occurred_at,
    i.metadata,
    CASE
      WHEN i.entity_type = 'venue' THEN (SELECT name FROM target_venues WHERE id = i.entity_uuid)
      WHEN i.entity_type = 'event' THEN (SELECT venue_name FROM target_events WHERE event_id = i.entity_uuid)
      ELSE NULL
    END AS venue_or_event_venue_name
  FROM public.interactions i
  WHERE
    (i.entity_type = 'venue' AND i.entity_uuid IN (SELECT id FROM target_venues))
    OR (i.entity_type = 'event' AND i.entity_uuid IN (SELECT event_id FROM target_events))
),

-- 2) Reviews (for events at these venues, or for these venues when event_id is null)
reviews_rows AS (
  SELECT
    r.id AS row_id,
    'review'::TEXT AS source,
    r.user_id,
    'review'::TEXT AS entity_type,
    r.id AS entity_uuid,
    'create'::TEXT AS event_or_relationship_type,
    r.created_at AS occurred_at,
    COALESCE(
      (SELECT te.venue_name FROM target_events te WHERE te.event_id = r.event_id),
      (SELECT v.name FROM target_venues v WHERE v.id = r.venue_id)
    ) AS venue_or_event_venue_name
  FROM public.reviews r
  WHERE r.is_draft = false
    AND (
      (r.event_id IS NOT NULL AND r.event_id IN (SELECT event_id FROM target_events))
      OR (r.event_id IS NULL AND r.venue_id IN (SELECT id FROM target_venues))
    )
),

-- 3) Event interests (going / maybe / interested) for events at these venues
interests_rows AS (
  SELECT
    gen_random_uuid() AS row_id,
    'interest'::TEXT AS source,
    uer.user_id,
    'event'::TEXT AS entity_type,
    uer.event_id AS entity_uuid,
    uer.relationship_type AS event_or_relationship_type,
    uer.created_at AS occurred_at,
    (SELECT te.venue_name FROM target_events te WHERE te.event_id = uer.event_id) AS venue_or_event_venue_name
  FROM public.user_event_relationships uer
  WHERE uer.event_id IN (SELECT event_id FROM target_events)
    AND uer.relationship_type IN ('going', 'maybe', 'interested', 'interest')
)

SELECT
  row_id,
  source,
  user_id,
  entity_type,
  entity_uuid,
  event_or_relationship_type,
  occurred_at,
  metadata,
  venue_or_event_venue_name
FROM interactions_rows
UNION ALL
SELECT row_id, source, user_id, entity_type, entity_uuid, event_or_relationship_type, occurred_at, venue_or_event_venue_name
FROM reviews_rows
UNION ALL
SELECT row_id, source, user_id, entity_type, entity_uuid, event_or_relationship_type, occurred_at, venue_or_event_venue_name
FROM interests_rows
ORDER BY occurred_at DESC;
