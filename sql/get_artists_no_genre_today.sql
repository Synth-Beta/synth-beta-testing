-- Get all artists added today with empty genres array
-- Using date comparison for timestampz created_at column

SELECT 
  id, 
  name, 
  external_identifiers, 
  genres
FROM public.artists
WHERE genres = '{}' 
  AND created_at >= CURRENT_DATE
  AND created_at < CURRENT_DATE + INTERVAL '1 day'
ORDER BY created_at DESC;

