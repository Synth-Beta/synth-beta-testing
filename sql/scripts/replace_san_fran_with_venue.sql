-- ============================================================
-- REPLACE "San Fran" WITH VENUE UUID IN SCENE_PARTICIPANTS
-- ============================================================

-- First, check what we're working with
SELECT 
  'Current entries with San Fran' as info,
  sp.id,
  sp.scene_id,
  sp.participant_type,
  sp.venue_id,
  sp.text_value,
  s.name as scene_name,
  v.name as venue_name
FROM public.scene_participants sp
JOIN public.scenes s ON sp.scene_id = s.id
LEFT JOIN public.venues v ON sp.venue_id = v.id
WHERE 
  (sp.text_value ILIKE '%san fran%' OR sp.text_value ILIKE '%san francisco%')
  OR (v.name ILIKE '%san fran%' OR v.name ILIKE '%san francisco%')
ORDER BY s.name, sp.participant_type;

-- Check the target venue
SELECT 
  'Target venue' as info,
  id,
  name,
  identifier
FROM public.venues
WHERE id = 'e5c9a306-4ab2-4958-a2ca-fd80fa272f38';

-- Update: Replace "Fillmore San Francisco" or any "San Fran" venue with the new venue
-- This assumes it's a venue participant, not a city participant
UPDATE public.scene_participants
SET 
  venue_id = 'e5c9a306-4ab2-4958-a2ca-fd80fa272f38'::UUID,
  text_value = NULL,
  participant_type = 'venue'
WHERE 
  participant_type = 'venue'
  AND (
    -- Match by venue name
    venue_id IN (
      SELECT id FROM public.venues 
      WHERE name ILIKE '%san fran%' 
         OR name ILIKE '%san francisco%'
         OR name ILIKE '%fillmore%san fran%'
    )
    -- Or if it's stored as text_value (shouldn't happen for venues, but just in case)
    OR (text_value ILIKE '%san fran%' AND participant_type = 'venue')
  );

-- If "San Fran" is stored as a city (text_value), update it to be a venue instead
UPDATE public.scene_participants
SET 
  participant_type = 'venue',
  venue_id = 'e5c9a306-4ab2-4958-a2ca-fd80fa272f38'::UUID,
  text_value = NULL
WHERE 
  participant_type = 'city'
  AND text_value ILIKE '%san fran%';

-- Verify the update
SELECT 
  'Updated entries' as info,
  sp.id,
  sp.scene_id,
  sp.participant_type,
  sp.venue_id,
  sp.text_value,
  s.name as scene_name,
  v.name as venue_name
FROM public.scene_participants sp
JOIN public.scenes s ON sp.scene_id = s.id
LEFT JOIN public.venues v ON sp.venue_id = v.id
WHERE sp.venue_id = 'e5c9a306-4ab2-4958-a2ca-fd80fa272f38'::UUID
ORDER BY s.name;

