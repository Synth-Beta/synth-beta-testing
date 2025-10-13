-- ============================================
-- QUICK FIX FOR ARTISTS TABLE RLS
-- ============================================
-- Run this in Supabase SQL Editor to fix the 406 error immediately

-- Allow everyone to read from artists table
CREATE POLICY "Enable read access for all users" ON artists
  FOR SELECT USING (true);

-- Allow authenticated users to insert into artists table  
CREATE POLICY "Enable insert access for authenticated users" ON artists
  FOR INSERT WITH CHECK (auth.role() = 'authenticated');

-- Allow authenticated users to update artists table
CREATE POLICY "Enable update access for authenticated users" ON artists
  FOR UPDATE USING (auth.role() = 'authenticated');

-- Test the query that was failing
SELECT id, name, jambase_artist_id, image_url
FROM artists 
WHERE name = 'Landmvrks';
