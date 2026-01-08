-- ============================================================
-- INSERT SCENE: EDM Essentials
-- 15 artists - all with UUIDs provided
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
  'EDM Essentials',
  'edm-essentials',
  'The foundational passport of modern electronic music—global headliners, genre-defining producers, and live acts that shape festival lineups, club culture, and the sound of electronic music today.',
  'The foundational passport of modern electronic music',
  'vibrant',
  NULL, -- No specific era start
  NULL, -- Ongoing
  'These artists represent the core of modern electronic dance music. From festival headliners to underground innovators, they define the sound and culture of EDM today.',
  1, -- discovery_threshold
  5, -- completion_threshold (experience 5 of 15 artists)
  true,
  true, -- Featured scene
  2, -- sort_order (second in general scenes, after Modern Iconic Rooms)
  '{"category": "general", "artist_only": true}'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  short_description = EXCLUDED.short_description,
  updated_at = NOW()
RETURNING id;

-- ============================================================
-- STEP 2: INSERT ARTIST PARTICIPANTS
-- ============================================================
-- This links all 15 artists to the scene using their UUIDs
-- All UUIDs are provided, so we insert them directly

INSERT INTO public.scene_participants (scene_id, participant_type, artist_id, text_value)
SELECT 
  s.id as scene_id,
  'artist'::TEXT as participant_type,
  a.id as artist_id,
  NULL::TEXT as text_value
FROM public.scenes s
CROSS JOIN (
  VALUES
    ('2f38f51c-8d3c-4d9f-aa4a-ed67952f64e7'::UUID, 'Above & Beyond'),
    ('fae8b1fc-3751-46d5-a169-3f3907edf7cd'::UUID, 'Armin van Buuren'),
    ('3f814829-3250-420d-8131-2ac9ea39d7c4'::UUID, 'Calvin Harris'),
    ('647a14d7-25bd-4c70-aa66-ac544cc57728'::UUID, 'Charlotte de Witte'),
    ('6c032c43-6649-4114-a48c-699f034389b4'::UUID, 'Eric Prydz'),
    ('d8d0993a-91b5-4212-8e7a-7ed65cb9bf9e'::UUID, 'Four Tet'),
    ('f0e7a304-4d26-4c46-9bed-379a2ac302a4'::UUID, 'Fred again..'),
    ('fdc30f00-4ece-49cd-b67a-627fdb3a7016'::UUID, 'Galantis'),
    ('c450e516-f857-4e27-9e4d-bf45acd9e2a5'::UUID, 'John Summit'),
    ('285106ac-bc45-4caf-8a02-0fcc01739d0e'::UUID, 'LP Giobbi'),
    ('910145e5-25d7-4874-8c4d-0802acf5f863'::UUID, 'Martin Garrix'),
    ('30a3e9a4-27f8-42df-b5e4-4d78153b71c9'::UUID, 'Peggy Gou'),
    ('e86550e1-bf43-4945-a2d0-75ef3e9e532b'::UUID, 'RÜFÜS DU SOL'),
    ('e752c1f6-52d0-4cda-bb49-11f9d833b345'::UUID, 'Skrillex'),
    ('351dfe53-2185-48f1-93bc-a4dddc2c977a'::UUID, 'The xx')
) AS artist_data(artist_uuid, artist_name)
JOIN public.artists a ON a.id = artist_data.artist_uuid
WHERE s.slug = 'edm-essentials'
  -- Avoid duplicates
  AND NOT EXISTS (
    SELECT 1 FROM public.scene_participants sp
    WHERE sp.scene_id = s.id AND sp.artist_id = a.id
  );

-- ============================================================
-- STEP 3: VERIFY INSERTION
-- ============================================================
-- Check that all artists were linked
SELECT 
  s.name as scene_name,
  s.slug,
  sp.participant_type,
  a.name as artist_name,
  a.id as artist_id,
  COUNT(*) OVER (PARTITION BY s.id) as total_artists_linked
FROM public.scenes s
JOIN public.scene_participants sp ON s.id = sp.scene_id
JOIN public.artists a ON sp.artist_id = a.id
WHERE s.slug = 'edm-essentials'
ORDER BY a.name;

-- Expected result: 15 rows, one for each artist

-- ============================================================
-- STEP 4: CHECK FOR MISSING ARTISTS
-- ============================================================
-- If any artists weren't found, this will show them
SELECT 
  artist_data.artist_name,
  artist_data.artist_uuid,
  CASE 
    WHEN a.id IS NULL THEN 'NOT FOUND'
    ELSE 'FOUND'
  END as status
FROM (
  VALUES
    ('2f38f51c-8d3c-4d9f-aa4a-ed67952f64e7'::UUID, 'Above & Beyond'),
    ('fae8b1fc-3751-46d5-a169-3f3907edf7cd'::UUID, 'Armin van Buuren'),
    ('3f814829-3250-420d-8131-2ac9ea39d7c4'::UUID, 'Calvin Harris'),
    ('647a14d7-25bd-4c70-aa66-ac544cc57728'::UUID, 'Charlotte de Witte'),
    ('6c032c43-6649-4114-a48c-699f034389b4'::UUID, 'Eric Prydz'),
    ('d8d0993a-91b5-4212-8e7a-7ed65cb9bf9e'::UUID, 'Four Tet'),
    ('f0e7a304-4d26-4c46-9bed-379a2ac302a4'::UUID, 'Fred again..'),
    ('fdc30f00-4ece-49cd-b67a-627fdb3a7016'::UUID, 'Galantis'),
    ('c450e516-f857-4e27-9e4d-bf45acd9e2a5'::UUID, 'John Summit'),
    ('285106ac-bc45-4caf-8a02-0fcc01739d0e'::UUID, 'LP Giobbi'),
    ('910145e5-25d7-4874-8c4d-0802acf5f863'::UUID, 'Martin Garrix'),
    ('30a3e9a4-27f8-42df-b5e4-4d78153b71c9'::UUID, 'Peggy Gou'),
    ('e86550e1-bf43-4945-a2d0-75ef3e9e532b'::UUID, 'RÜFÜS DU SOL'),
    ('e752c1f6-52d0-4cda-bb49-11f9d833b345'::UUID, 'Skrillex'),
    ('351dfe53-2185-48f1-93bc-a4dddc2c977a'::UUID, 'The xx')
) AS artist_data(artist_uuid, artist_name)
LEFT JOIN public.artists a ON a.id = artist_data.artist_uuid
WHERE a.id IS NULL
ORDER BY artist_data.artist_name;

-- Expected result: 0 rows (all artists should be found)

















