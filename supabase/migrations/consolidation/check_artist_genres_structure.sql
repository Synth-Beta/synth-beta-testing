-- ============================================
-- CHECK artist_genres TABLE STRUCTURE
-- ============================================
-- Determine if it's a reference table (id, name) or mapping table (artist_id, genre)

-- Check columns
SELECT 
  'Column Structure' as check_type,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
  AND table_name = 'artist_genres'
ORDER BY ordinal_position;

-- Sample data - check first 10 rows
SELECT 
  'Sample Data' as check_type,
  *
FROM public.artist_genres
LIMIT 10;

