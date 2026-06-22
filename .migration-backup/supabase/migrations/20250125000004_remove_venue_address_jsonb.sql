-- ============================================
-- Remove address JSONB column from venues table
-- ============================================
-- This migration removes the address JSONB column after data has been
-- migrated to individual columns in the previous migration.
-- 
-- WARNING: This permanently removes the address JSONB column.
-- Make sure migration 20250125000003_migrate_venue_address_data.sql
-- has been successfully run and verified before executing this.

-- Step 1: Drop dependent views that reference the address column
DROP VIEW IF EXISTS public.venues_with_stats CASCADE;
DROP VIEW IF EXISTS public.venue_search_results CASCADE;

-- Step 2: Drop the address JSONB column
ALTER TABLE public.venues
DROP COLUMN IF EXISTS address;

-- Step 3: Recreate views using the new individual address columns
-- Recreate venues_with_stats view
CREATE OR REPLACE VIEW public.venues_with_stats AS
SELECT 
  v.*,
  COUNT(je.id) as total_events,
  COUNT(CASE WHEN je.event_date > NOW() THEN 1 END) as upcoming_events,
  MAX(je.event_date) as last_event_date,
  MIN(je.event_date) as first_event_date
FROM public.venues v
LEFT JOIN public.events je ON v.id = je.venue_jambase_id
GROUP BY v.id;

-- Recreate venue_search_results view
CREATE OR REPLACE VIEW public.venue_search_results AS
SELECT 
  v.id,
  v.name,
  v.street_address as address,
  v.state,
  v.country,
  v.zip,
  v.latitude,
  v.longitude,
  COUNT(je.id) as events_count,
  -- Create a searchable text field using new columns
  LOWER(
    v.name || ' ' || 
    COALESCE(v.street_address, '') || ' ' || 
    COALESCE(v.state, '') || ' ' || 
    COALESCE(v.country, '') || ' ' ||
    COALESCE(v.zip, '')
  ) as searchable_text
FROM public.venues v
LEFT JOIN public.events je ON v.id = je.venue_jambase_id
GROUP BY v.id, v.name, v.street_address, v.state, v.country, v.zip, v.latitude, v.longitude;

-- Step 4: Grant permissions on recreated views
GRANT SELECT ON public.venues_with_stats TO authenticated;
GRANT SELECT ON public.venues_with_stats TO anon;
GRANT SELECT ON public.venue_search_results TO authenticated;
GRANT SELECT ON public.venue_search_results TO anon;

-- Note: We keep the geo JSONB column as it may contain additional
-- geographic metadata beyond just latitude/longitude
-- If you want to remove geo as well, uncomment the line below:
-- ALTER TABLE public.venues DROP COLUMN IF EXISTS geo;

-- Add comment documenting the change
COMMENT ON TABLE public.venues IS 
'Venue information. Address data is stored in individual columns (street_address, state, country, zip) rather than JSONB for better query performance.';

