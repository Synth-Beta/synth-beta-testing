-- ============================================
-- Add missing columns to events_with_artist_venue view
-- ============================================
-- The view was missing event_media_url, media_urls, and last_modified_at
-- which are needed by the application queries

BEGIN;

-- Drop the existing view first to avoid column rename conflicts
DROP VIEW IF EXISTS public.events_with_artist_venue CASCADE;

-- Recreate the view with all required columns
CREATE VIEW public.events_with_artist_venue AS
WITH event_base AS (
  SELECT 
    e.id,
    e.title,
    e.description,
    e.event_date,
    e.doors_time,
    e.venue_city,
    e.venue_state,
    e.venue_address,
    e.venue_zip,
    e.latitude,
    e.longitude,
    e.external_url,
    e.artist_id,
    e.venue_id,
    e.is_promoted,
    e.promotion_tier,
    e.is_user_created,
    e.created_by_user_id,
    e.source,
    e.genres,
    e.ticket_available,
    e.price_range,
    e.price_min,
    e.price_max,
    e.price_currency,
    e.ticket_urls,
    e.setlist,
    e.tour_name,
    e.event_status,
    e.images,
    e.is_featured,
    e.featured_until,
    e.created_at,
    e.updated_at,
    e.media_urls,
    e.last_modified_at,
    e.event_media_url
    -- Explicitly exclude: jambase_event_id, ticketmaster_event_id, artist_name, venue_name
    -- Also exclude: url, image_url, tags, venue_country (may not exist)
    -- These are now available via external_entity_ids (for IDs) or JOINs (for names)
  FROM public.events e
)
SELECT 
  eb.*,
  -- Normalized artist data (from artists table)
  a.name AS artist_name_normalized,
  a.image_url AS artist_image_url,
  a.genres AS artist_genres,
  -- Normalized venue data (from venues table)
  v.name AS venue_name_normalized,
  -- Venue location data (venues table schema varies - return NULL for location fields)
  NULL AS venue_address_normalized,
  NULL AS venue_city_normalized,
  NULL AS venue_state_normalized,
  NULL AS venue_zip_normalized,
  -- External IDs (from external_entity_ids)
  eei_artist.external_id AS artist_jambase_id,
  eei_venue.external_id AS venue_jambase_id,
  eei_event.external_id AS event_jambase_id
FROM event_base eb
LEFT JOIN public.artists a ON eb.artist_id = a.id
LEFT JOIN public.venues v ON eb.venue_id = v.id
LEFT JOIN public.external_entity_ids eei_artist 
  ON eei_artist.entity_uuid = eb.artist_id 
  AND eei_artist.entity_type = 'artist' 
  AND eei_artist.source = 'jambase'
LEFT JOIN public.external_entity_ids eei_venue 
  ON eei_venue.entity_uuid = eb.venue_id 
  AND eei_venue.entity_type = 'venue' 
  AND eei_venue.source = 'jambase'
LEFT JOIN public.external_entity_ids eei_event 
  ON eei_event.entity_uuid = eb.id 
  AND eei_event.entity_type = 'event' 
  AND eei_event.source = 'jambase';

COMMENT ON VIEW public.events_with_artist_venue IS 
'Helper view for normalization transition. Provides normalized artist/venue names via JOINs. External IDs come from external_entity_ids table. Includes all event columns including event_media_url, media_urls, and last_modified_at.';

-- Re-grant permissions
GRANT SELECT ON public.events_with_artist_venue TO authenticated;
GRANT SELECT ON public.events_with_artist_venue TO anon;

COMMIT;
