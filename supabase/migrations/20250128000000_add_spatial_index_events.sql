-- ============================================================
-- MIGRATION: Add Spatial Index for Events
-- Creates composite index on latitude/longitude for faster
-- bounding box queries in distance-based filtering
-- ============================================================

-- Composite index on latitude and longitude for spatial queries
-- This significantly speeds up bounding box filtering
CREATE INDEX IF NOT EXISTS idx_events_latitude_longitude 
ON public.events (latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Additional index for date + location queries (common pattern)
-- Note: Cannot use CURRENT_DATE in index predicate (not immutable)
-- Date filtering will be done in queries, but this index helps with sorting
CREATE INDEX IF NOT EXISTS idx_events_date_location 
ON public.events (event_date, latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

-- Index for city + state + coordinates (helps with city filtering)
CREATE INDEX IF NOT EXISTS idx_events_city_state_coords 
ON public.events (venue_city, venue_state, latitude, longitude) 
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

