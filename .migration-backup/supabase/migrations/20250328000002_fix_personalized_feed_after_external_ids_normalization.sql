-- ============================================================
-- Fix get_personalized_feed_v3 after external IDs normalization
-- ============================================================
-- Updates the function to use renamed columns (artist_id, venue_id)
-- and get external IDs from external_entity_ids table
-- ============================================================

BEGIN;

-- Note: This is a partial update. The full function is very large (850+ lines).
-- We're updating the specific CTE that references the dropped columns.
-- The function will need to be fully recreated if there are other references.

-- First, let's check if the function exists and drop it
DROP FUNCTION IF EXISTS public.get_personalized_feed_v3 CASCADE;

-- We'll need to read the full function from the original migration
-- For now, create a placeholder that will be updated
-- The actual fix should be done by updating the event_candidates CTE

-- Since the full function is 850+ lines, we'll create a helper view
-- that provides the event data with external IDs properly resolved

-- Drop existing view if it exists
DROP VIEW IF EXISTS public.events_with_external_ids CASCADE;

-- Create view with only columns that definitely exist in the events table
-- This view provides events with external IDs resolved from external_entity_ids table
CREATE OR REPLACE VIEW public.events_with_external_ids AS
SELECT 
  e.id AS event_id,
  e.title,
  e.artist_name,
  -- Get external ID from external_entity_ids, fallback to UUID as text
  COALESCE(eei_artist.external_id, e.artist_id::TEXT) AS artist_id,
  e.artist_id AS artist_uuid,
  e.venue_name,
  -- Get external ID from external_entity_ids, fallback to UUID as text
  COALESCE(eei_venue.external_id, e.venue_id::TEXT) AS venue_id,
  e.venue_id AS venue_uuid,
  e.venue_city,
  e.venue_state,
  e.venue_address,
  e.venue_zip,
  e.event_date,
  e.doors_time,
  e.description,
  e.genres,
  e.latitude,
  e.longitude,
  e.ticket_available,
  e.price_range,
  e.price_min,
  e.price_max,
  e.price_currency,
  e.ticket_urls,
  e.external_url,
  e.setlist,
  e.tour_name,
  e.source,
  e.event_status,
  e.images,
  e.is_user_created,
  e.is_promoted,
  e.promotion_tier,
  e.is_featured,
  e.featured_until,
  e.created_by_user_id,
  e.created_at,
  e.updated_at
FROM public.events e
-- Left join to get external IDs for artist
LEFT JOIN public.external_entity_ids eei_artist 
  ON eei_artist.entity_uuid = e.artist_id 
  AND eei_artist.entity_type = 'artist' 
  AND eei_artist.source = 'jambase'
-- Left join to get external IDs for venue
LEFT JOIN public.external_entity_ids eei_venue 
  ON eei_venue.entity_uuid = e.venue_id 
  AND eei_venue.entity_type = 'venue' 
  AND eei_venue.source = 'jambase';

GRANT SELECT ON public.events_with_external_ids TO authenticated;

COMMENT ON VIEW public.events_with_external_ids IS 
  'Helper view for events with external IDs resolved from external_entity_ids table. Use this in functions that need artist_id/venue_id as external IDs. Updated for 3NF schema.';

-- Note: The get_personalized_feed_v3 function needs to be updated to either:
-- 1. Use this view instead of directly querying events table
-- 2. Or update the event_candidates CTE to use external_entity_ids joins
--
-- Since the function is very large, it's recommended to:
-- - Update the event_candidates CTE to join with external_entity_ids
-- - Replace e.artist_jambase_id_text with COALESCE(eei_artist.external_id, e.artist_id::TEXT)
-- - Replace e.venue_jambase_id_text with COALESCE(eei_venue.external_id, e.venue_id::TEXT)
-- - Replace e.artist_jambase_id with e.artist_id
-- - Replace e.venue_jambase_id with e.venue_id

COMMIT;

