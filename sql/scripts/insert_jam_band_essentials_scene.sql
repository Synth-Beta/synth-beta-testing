-- ============================================================
-- INSERT SCENE: Jam Band Essentials
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
  'Jam Band Essentials',
  'jam-band-essentials',
  'The ultimate passport for modern jam culture—classic pillars, festival mainstays, and next-generation touring acts that define the live improvisational scene today.',
  'The ultimate passport for modern jam culture',
  'vibrant',
  NULL, -- No specific era start
  NULL, -- Ongoing
  'These artists represent the core of modern jam band culture. From legendary pillars like Phish and Widespread Panic to next-generation acts like Goose and Billy Strings, they define the live improvisational music scene today.',
  1, -- discovery_threshold
  5, -- completion_threshold (experience 5 of 15 artists)
  true,
  true, -- Featured scene
  3, -- sort_order (third in general scenes)
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
    ('7bd92b5a-0a3b-4268-b5cf-dff441340289'::UUID, 'Joe Russo''s Almost Dead'),
    ('1b10b99e-67e6-41eb-95da-0eed94daa414'::UUID, 'Billy Strings'),
    ('47aab0f9-6262-4009-ad64-73796de5c866'::UUID, 'Dogs In A Pile'),
    ('c6f12172-af3f-475f-a8d8-43dfe324d2ba'::UUID, 'Eggy'),
    ('658d14d9-2ce8-4579-9564-ae9bea77cf67'::UUID, 'Goose'),
    ('0e749f30-1cfd-4ca8-8bc6-9c0ddcf4ac60'::UUID, 'Greensky Bluegrass'),
    ('d7d03868-ed1b-4034-a09f-c21220ebe11a'::UUID, 'Lotus'),
    ('a6054d1a-ac46-44c8-8a0d-11b7941af28d'::UUID, 'Marcus King'),
    ('c0f120f8-c6ce-4b6d-882e-15484d796cbe'::UUID, 'moe.'),
    ('39c16829-52fb-43c2-804f-f9f7e51d48b1'::UUID, 'Phish'),
    ('40e5661c-3dc9-4962-aba3-60012584261b'::UUID, 'STS9'),
    ('8c41ca4a-693c-464e-a4d7-01c785ccd1b2'::UUID, 'Tedeschi Trucks Band'),
    ('8d584d9d-d731-4869-ab54-b60df72bb477'::UUID, 'The Disco Biscuits'),
    ('1d615757-ba7a-4b3d-9ca0-6d670e69d382'::UUID, 'The String Cheese Incident'),
    ('32c2dfdb-6c40-4446-88f1-7646b4c6ff42'::UUID, 'Widespread Panic')
) AS artist_data(artist_uuid, artist_name)
JOIN public.artists a ON a.id = artist_data.artist_uuid
WHERE s.slug = 'jam-band-essentials'
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
WHERE s.slug = 'jam-band-essentials'
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
    ('7bd92b5a-0a3b-4268-b5cf-dff441340289'::UUID, 'Joe Russo''s Almost Dead'),
    ('1b10b99e-67e6-41eb-95da-0eed94daa414'::UUID, 'Billy Strings'),
    ('47aab0f9-6262-4009-ad64-73796de5c866'::UUID, 'Dogs In A Pile'),
    ('c6f12172-af3f-475f-a8d8-43dfe324d2ba'::UUID, 'Eggy'),
    ('658d14d9-2ce8-4579-9564-ae9bea77cf67'::UUID, 'Goose'),
    ('0e749f30-1cfd-4ca8-8bc6-9c0ddcf4ac60'::UUID, 'Greensky Bluegrass'),
    ('d7d03868-ed1b-4034-a09f-c21220ebe11a'::UUID, 'Lotus'),
    ('a6054d1a-ac46-44c8-8a0d-11b7941af28d'::UUID, 'Marcus King'),
    ('c0f120f8-c6ce-4b6d-882e-15484d796cbe'::UUID, 'moe.'),
    ('39c16829-52fb-43c2-804f-f9f7e51d48b1'::UUID, 'Phish'),
    ('40e5661c-3dc9-4962-aba3-60012584261b'::UUID, 'STS9'),
    ('8c41ca4a-693c-464e-a4d7-01c785ccd1b2'::UUID, 'Tedeschi Trucks Band'),
    ('8d584d9d-d731-4869-ab54-b60df72bb477'::UUID, 'The Disco Biscuits'),
    ('1d615757-ba7a-4b3d-9ca0-6d670e69d382'::UUID, 'The String Cheese Incident'),
    ('32c2dfdb-6c40-4446-88f1-7646b4c6ff42'::UUID, 'Widespread Panic')
) AS artist_data(artist_uuid, artist_name)
LEFT JOIN public.artists a ON a.id = artist_data.artist_uuid
WHERE a.id IS NULL
ORDER BY artist_data.artist_name;

-- Expected result: 0 rows (all artists should be found)

