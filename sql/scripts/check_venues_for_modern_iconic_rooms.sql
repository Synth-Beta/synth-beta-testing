-- ============================================================
-- CHECK VENUES FOR MODERN ICONIC ROOMS SCENE
-- Fuzzy match venue names to find existing venue IDs
-- ============================================================

-- Check which venues exist in the database (fuzzy match by name)
WITH venue_names AS (
  SELECT unnest(ARRAY[
    'Red Rocks Amphitheatre',
    'Madison Square Garden',
    'Hollywood Bowl',
    'Ryman Auditorium',
    'The Gorge Amphitheatre',
    'Radio City Music Hall',
    'The Greek Theatre',
    'Fillmore San Francisco',
    'Union Stage',
    'Bowery Ballroom'
  ]) AS search_name
)
SELECT 
  vn.search_name AS requested_name,
  v.id AS venue_id,
  v.name AS matched_name,
  v.identifier,
  CASE 
    WHEN v.id IS NOT NULL THEN 'FOUND'
    ELSE 'MISSING'
  END AS status
FROM venue_names vn
LEFT JOIN public.venues v ON (
  -- Exact match (case-insensitive)
  LOWER(TRIM(v.name)) = LOWER(TRIM(vn.search_name))
  -- Fuzzy match - contains the search name
  OR LOWER(TRIM(v.name)) LIKE '%' || LOWER(TRIM(vn.search_name)) || '%'
  OR LOWER(TRIM(vn.search_name)) LIKE '%' || LOWER(TRIM(v.name)) || '%'
  -- Handle variations like "The Greek Theatre" vs "Greek Theatre"
  OR LOWER(REPLACE(TRIM(v.name), 'the ', '')) = LOWER(REPLACE(TRIM(vn.search_name), 'the ', ''))
  OR LOWER(REPLACE(TRIM(vn.search_name), 'the ', '')) = LOWER(REPLACE(TRIM(v.name), 'the ', ''))
)
ORDER BY 
  CASE WHEN v.id IS NOT NULL THEN 0 ELSE 1 END,
  vn.search_name;

-- ============================================================
-- ALTERNATIVE: More detailed fuzzy matching
-- ============================================================
-- This version shows similarity scores and multiple matches

WITH venue_names AS (
  SELECT unnest(ARRAY[
    'Red Rocks Amphitheatre',
    'Madison Square Garden',
    'Hollywood Bowl',
    'Ryman Auditorium',
    'The Gorge Amphitheatre',
    'Radio City Music Hall',
    'The Greek Theatre',
    'Fillmore San Francisco',
    'Union Stage',
    'Bowery Ballroom'
  ]) AS search_name
),
matches AS (
  SELECT 
    vn.search_name,
    v.id,
    v.name,
    v.identifier,
    -- Calculate similarity: 1 = exact match, lower = less similar
    CASE 
      WHEN LOWER(TRIM(v.name)) = LOWER(TRIM(vn.search_name)) THEN 1.0
      WHEN LOWER(TRIM(v.name)) LIKE LOWER(TRIM(vn.search_name)) || '%' THEN 0.9
      WHEN LOWER(TRIM(vn.search_name)) LIKE LOWER(TRIM(v.name)) || '%' THEN 0.9
      WHEN LOWER(REPLACE(TRIM(v.name), 'the ', '')) = LOWER(REPLACE(TRIM(vn.search_name), 'the ', '')) THEN 0.95
      WHEN LOWER(TRIM(v.name)) LIKE '%' || LOWER(TRIM(vn.search_name)) || '%' THEN 0.7
      ELSE 0.5
    END AS similarity
  FROM venue_names vn
  CROSS JOIN public.venues v
  WHERE (
    LOWER(TRIM(v.name)) = LOWER(TRIM(vn.search_name))
    OR LOWER(TRIM(v.name)) LIKE '%' || LOWER(TRIM(vn.search_name)) || '%'
    OR LOWER(TRIM(vn.search_name)) LIKE '%' || LOWER(TRIM(v.name)) || '%'
    OR LOWER(REPLACE(TRIM(v.name), 'the ', '')) = LOWER(REPLACE(TRIM(vn.search_name), 'the ', ''))
  )
)
SELECT 
  search_name AS requested_name,
  id AS venue_id,
  name AS matched_name,
  identifier,
  similarity,
  CASE 
    WHEN similarity >= 0.9 THEN 'HIGH_MATCH'
    WHEN similarity >= 0.7 THEN 'MEDIUM_MATCH'
    ELSE 'LOW_MATCH'
  END AS match_quality
FROM matches
WHERE similarity >= 0.5
ORDER BY search_name, similarity DESC;

-- ============================================================
-- SUMMARY: Count found vs missing
-- ============================================================
SELECT 
  COUNT(DISTINCT CASE WHEN v.id IS NOT NULL THEN vn.search_name END) AS found_count,
  COUNT(DISTINCT CASE WHEN v.id IS NULL THEN vn.search_name END) AS missing_count,
  COUNT(DISTINCT vn.search_name) AS total_count
FROM (
  SELECT unnest(ARRAY[
    'Red Rocks Amphitheatre',
    'Madison Square Garden',
    'Hollywood Bowl',
    'Ryman Auditorium',
    'The Gorge Amphitheatre',
    'Radio City Music Hall',
    'The Greek Theatre',
    'Fillmore San Francisco',
    'Union Stage',
    'Bowery Ballroom'
  ]) AS search_name
) vn
LEFT JOIN public.venues v ON (
  LOWER(TRIM(v.name)) = LOWER(TRIM(vn.search_name))
  OR LOWER(TRIM(v.name)) LIKE '%' || LOWER(TRIM(vn.search_name)) || '%'
  OR LOWER(TRIM(vn.search_name)) LIKE '%' || LOWER(TRIM(v.name)) || '%'
  OR LOWER(REPLACE(TRIM(v.name), 'the ', '')) = LOWER(REPLACE(TRIM(vn.search_name), 'the ', ''))
);

