-- ============================================================
-- INSERT SCENE: Modern Iconic Rooms
-- All 10 venues found in database - ready to insert
-- ============================================================

-- ============================================================
-- STEP 1: INSERT THE SCENE
-- ============================================================
INSERT INTO public.scenes (
  name,
  slug,
  description,
  short_description,
  energy_level,
  era_start_year,
  era_end_year,
  cultural_significance,
  discovery_threshold,
  completion_threshold,
  is_active,
  is_featured,
  sort_order,
  metadata
) VALUES (
  'Modern Iconic Rooms',
  'modern-iconic-rooms',
  'Establishes shared cultural landmarks. No artist bias.',
  'Iconic venues that define live music culture',
  'vibrant',
  NULL, -- No specific era
  NULL, -- Ongoing
  'These venues represent the most iconic and culturally significant performance spaces in modern live music. Each venue has hosted countless legendary performances and serves as a pilgrimage site for music fans.',
  1, -- discovery_threshold
  5, -- completion_threshold (visit 5 of 10 venues)
  true,
  true, -- Featured scene
  1, -- sort_order (first in general scenes)
  '{"category": "general", "venue_only": true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  short_description = EXCLUDED.short_description,
  updated_at = NOW()
RETURNING id;

-- ============================================================
-- STEP 2: INSERT VENUE PARTICIPANTS
-- ============================================================
-- This links all 10 venues to the scene using their UUIDs
-- The query finds venues by name and links them to the scene

INSERT INTO public.scene_participants (scene_id, participant_type, venue_id, text_value)
SELECT 
  s.id as scene_id,
  'venue'::TEXT as participant_type,
  v.id as venue_id,
  NULL::TEXT as text_value
FROM public.scenes s
CROSS JOIN (
  VALUES
    ('Red Rocks Amphitheatre'),
    ('Madison Square Garden'),
    ('Hollywood Bowl'),
    ('Ryman Auditorium'),
    ('The Gorge Amphitheatre'),
    ('Radio City Music Hall'),
    ('The Greek Theatre (LA)'),
    ('Fillmore San Francisco'),
    ('Union Stage (DC)'),
    ('Bowery Ballroom')
) AS venue_names(name)
LEFT JOIN public.venues v ON (
  -- Exact match (case-insensitive)
  LOWER(TRIM(v.name)) = LOWER(TRIM(venue_names.name))
  -- Fuzzy match - contains the search name
  OR LOWER(TRIM(v.name)) LIKE '%' || LOWER(TRIM(venue_names.name)) || '%'
  OR LOWER(TRIM(venue_names.name)) LIKE '%' || LOWER(TRIM(v.name)) || '%'
  -- Handle variations like "The Greek Theatre" vs "Greek Theatre"
  OR LOWER(REPLACE(TRIM(v.name), 'the ', '')) = LOWER(REPLACE(TRIM(venue_names.name), 'the ', ''))
  OR LOWER(REPLACE(TRIM(venue_names.name), 'the ', '')) = LOWER(REPLACE(TRIM(v.name), 'the ', ''))
)
WHERE s.slug = 'modern-iconic-rooms'
  AND v.id IS NOT NULL
  -- Avoid duplicates
  AND NOT EXISTS (
    SELECT 1 FROM public.scene_participants sp
    WHERE sp.scene_id = s.id AND sp.venue_id = v.id
  );

-- ============================================================
-- STEP 3: VERIFY INSERTION
-- ============================================================
-- Check that all venues were linked
SELECT 
  s.name as scene_name,
  s.slug,
  sp.participant_type,
  v.name as venue_name,
  v.id as venue_id,
  COUNT(*) OVER (PARTITION BY s.id) as total_venues_linked
FROM public.scenes s
JOIN public.scene_participants sp ON s.id = sp.scene_id
JOIN public.venues v ON sp.venue_id = v.id
WHERE s.slug = 'modern-iconic-rooms'
ORDER BY v.name;

-- Expected result: 10 rows, one for each venue
