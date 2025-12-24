-- Test query: Find 10 artists with no genres that have Spotify IDs
-- This will help us verify the query logic before running the full backfill
-- external_identifiers structure: [{"source": "spotify", "identifier": ["4WqXqPmUuenMIr4QaFrZXN"]}]

SELECT 
  id,
  name,
  genres,
  external_identifiers,
  -- Extract Spotify ID for verification (identifier is an array, get first element)
  -- Format: [{"source": "spotify", "identifier": ["4WqXqPmUuenMIr4QaFrZXN"]}]
  -- Using jsonb_array_elements_text to extract first array element as text
  (
    SELECT (SELECT jsonb_array_elements_text(ext_id->'identifier') LIMIT 1)
    FROM jsonb_array_elements(external_identifiers) AS ext_id
    WHERE ext_id->>'source' = 'spotify'
      AND ext_id->'identifier' IS NOT NULL
      AND jsonb_array_length(ext_id->'identifier') > 0
    LIMIT 1
  ) AS spotify_id
FROM public.artists
WHERE (
  genres IS NULL 
  OR array_length(genres, 1) IS NULL 
  OR array_length(genres, 1) = 0
)
AND external_identifiers IS NOT NULL
AND external_identifiers::text LIKE '%"source": "spotify"%'
ORDER BY created_at ASC
LIMIT 10;

