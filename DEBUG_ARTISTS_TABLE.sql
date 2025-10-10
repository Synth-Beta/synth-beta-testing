-- ============================================
-- DEBUG ARTISTS TABLE ISSUES
-- ============================================
-- Run this in Supabase SQL Editor to diagnose the artists table

-- Step 1: Check if artists table exists
SELECT 
  'Table Exists Check' as step,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'artists') 
    THEN '✅ artists table exists'
    ELSE '❌ artists table does NOT exist'
  END as result;

-- Step 2: Check table structure
SELECT 
  'Table Structure' as step,
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns 
WHERE table_name = 'artists'
ORDER BY ordinal_position;

-- Step 3: Check if table has data
SELECT 
  'Table Data Count' as step,
  COUNT(*) as total_artists
FROM artists;

-- Step 4: Check if Landmvrks exists
SELECT 
  'Landmvrks Search' as step,
  id,
  name,
  jambase_artist_id,
  description,
  image_url
FROM artists 
WHERE name ILIKE '%Landmvrks%';

-- Step 5: Check artist_profile table too
SELECT 
  'Artist Profile Count' as step,
  COUNT(*) as total_artist_profiles
FROM artist_profile;

-- Step 6: Check if Landmvrks exists in artist_profile
SELECT 
  'Landmvrks in Profile' as step,
  id,
  name,
  jambase_artist_id,
  genres
FROM artist_profile 
WHERE name ILIKE '%Landmvrks%';

-- Step 7: Test the exact query that's failing (fixed version)
-- The original query was trying to select description which doesn't exist
SELECT 
  'Exact Query Test (Fixed)' as step,
  id,
  name,
  jambase_artist_id,
  image_url
FROM artists 
WHERE name = 'Landmvrks';

-- Step 8: Check RLS policies
SELECT 
  'RLS Policies' as step,
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'artists';

-- Step 9: Check if we can insert a test artist
-- (This will help us understand the table structure)
DO $$
BEGIN
  -- Try to insert a test artist
  INSERT INTO artists (
    jambase_artist_id,
    name,
    identifier
  ) VALUES (
    'test:123456',
    'Test Artist',
    'test:123456'
  ) ON CONFLICT (jambase_artist_id) DO NOTHING;
  
  RAISE NOTICE '✅ Test artist insert successful';
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '❌ Test artist insert failed: %', SQLERRM;
END $$;

-- Step 10: Clean up test data
DELETE FROM artists WHERE jambase_artist_id = 'test:123456';

-- Final summary
SELECT 
  'SUMMARY' as info,
  (SELECT COUNT(*) FROM artists) as artists_count,
  (SELECT COUNT(*) FROM artist_profile) as artist_profile_count,
  CASE 
    WHEN EXISTS (SELECT 1 FROM artists WHERE name ILIKE '%Landmvrks%') 
    THEN '✅ Landmvrks found in artists table'
    ELSE '❌ Landmvrks NOT found in artists table'
  END as landmvrks_status;
