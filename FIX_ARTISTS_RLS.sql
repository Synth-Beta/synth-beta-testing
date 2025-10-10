-- ============================================
-- FIX ARTISTS TABLE RLS POLICIES
-- ============================================
-- Run this in Supabase SQL Editor to fix the 406 error

-- Step 1: Check current RLS status
SELECT 
  'RLS Status' as info,
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE tablename = 'artists';

-- Step 2: Check existing policies
SELECT 
  'Existing Policies' as info,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'artists';

-- Step 3: Drop existing policies if they exist (to start fresh)
DROP POLICY IF EXISTS "Enable read access for all users" ON artists;
DROP POLICY IF EXISTS "Enable insert access for all users" ON artists;
DROP POLICY IF EXISTS "Enable update access for all users" ON artists;

-- Step 4: Create new policies for artists table
-- Allow everyone to read artists (public data)
CREATE POLICY "Enable read access for all users" ON artists
  FOR SELECT USING (true);

-- Allow authenticated users to insert new artists
CREATE POLICY "Enable insert access for authenticated users" ON artists
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update artists they created or any artist (for now)
CREATE POLICY "Enable update access for authenticated users" ON artists
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Step 5: Verify the policies were created
SELECT 
  'New Policies' as info,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies 
WHERE tablename = 'artists';

-- Step 6: Test the query that was failing
SELECT 
  'Test Query' as info,
  id,
  name,
  jambase_artist_id,
  image_url
FROM artists 
WHERE name = 'Landmvrks';

-- Step 7: Test with a broader search
SELECT 
  'Broader Search' as info,
  id,
  name,
  jambase_artist_id
FROM artists 
WHERE name ILIKE '%landmvrks%'
LIMIT 5;
