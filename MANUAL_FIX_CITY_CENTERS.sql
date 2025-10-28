-- MANUAL FIX: Run this BEFORE the migration to ensure city_centers table allows NULL states
-- Copy and paste this entire block into Supabase SQL Editor and run it

-- Step 1: Drop everything that depends on the table
DROP FUNCTION IF EXISTS get_events_by_city_coordinates(TEXT[], TEXT[], FLOAT, INT) CASCADE;
DROP FUNCTION IF EXISTS get_available_cities_for_filter(INT, INT) CASCADE;
DROP FUNCTION IF EXISTS update_city_centers() CASCADE;

-- Step 2: Force drop the table
DROP TABLE IF EXISTS city_centers CASCADE;

-- Step 3: Wait a moment (PostgreSQL doesn't need this, but being explicit)
-- The table should now be completely gone

-- Step 4: Verify it's gone (this query should return 0 rows)
SELECT COUNT(*) as should_be_zero
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'city_centers';

-- Step 5: Create table with surrogate UUID primary key and UNIQUE constraint
-- PRIMARY KEY forces NOT NULL, but UNIQUE constraints allow NULLs
CREATE TABLE city_centers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  city_name TEXT NOT NULL,
  state TEXT,  -- NO NOT NULL - explicitly nullable for international cities
  center_latitude DECIMAL(10, 8) NOT NULL,
  center_longitude DECIMAL(11, 8) NOT NULL,
  event_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (city_name, state) -- UNIQUE allows NULLs (each NULL is distinct)
);

-- Step 6: Verify state column is nullable
SELECT 
  column_name,
  is_nullable,
  data_type
FROM information_schema.columns
WHERE table_name = 'city_centers' AND column_name = 'state';
-- Should show: state | YES | text

-- Step 7: Create indexes
CREATE INDEX IF NOT EXISTS idx_city_centers_location 
ON city_centers(center_latitude, center_longitude);

CREATE INDEX IF NOT EXISTS idx_city_centers_city_state 
ON city_centers(city_name, state);

-- If you see "state | YES" in step 6, the table is correct!
-- Now run the full migration file

