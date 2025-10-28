-- Fix city_centers table to allow NULL states for international cities
-- Run this FIRST if you're getting NOT NULL constraint errors
-- Then run the full migration which will populate the table

-- Step 1: Drop the table completely if it exists
DROP TABLE IF EXISTS city_centers CASCADE;

-- Step 2: Recreate it with NULL allowed
CREATE TABLE city_centers (
  city_name TEXT NOT NULL,
  state TEXT, -- Explicitly nullable for international cities
  center_latitude DECIMAL(10, 8) NOT NULL,
  center_longitude DECIMAL(11, 8) NOT NULL,
  event_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (city_name, state)
);

-- Step 3: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_city_centers_location 
ON city_centers(center_latitude, center_longitude);

CREATE INDEX IF NOT EXISTS idx_city_centers_city_state 
ON city_centers(city_name, state);

-- Step 4: Run the full migration (20250228000002_add_coordinate_based_city_filtering.sql)
-- which will create the update_city_centers() function and populate this table

