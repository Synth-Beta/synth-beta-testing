-- ============================================
-- CREATE HELPER VIEWS FOR NORMALIZATION TRANSITION
-- ============================================
-- These views help ease the transition from denormalized to normalized schema
-- They provide backward-compatible access patterns while we update application code
-- ============================================

BEGIN;

-- ============================================
-- VIEW: events_with_artist_venue
-- ============================================
-- Provides normalized artist/venue names via JOINs
-- Use this instead of events.artist_name / events.venue_name
CREATE OR REPLACE VIEW public.events_with_artist_venue AS
SELECT 
  e.*,
  -- Normalized artist data (from artists table)
  a.name AS artist_name_normalized,
  a.image_url AS artist_image_url,
  a.genres AS artist_genres,
  -- Normalized venue data (from venues table)
  v.name AS venue_name_normalized,
  -- Venue location data (venues table schema varies - return NULL for location fields)
  -- Note: Venues table may have address as JSONB or no location columns at all
  -- Location data should come from events table (venue_city, venue_state, etc.) or be NULL
  NULL AS venue_address_normalized,
  NULL AS venue_city_normalized,
  NULL AS venue_state_normalized,
  NULL AS venue_zip_normalized,
  -- External IDs (from external_entity_ids)
  eei_artist.external_id AS artist_jambase_id,
  eei_venue.external_id AS venue_jambase_id,
  eei_event.external_id AS event_jambase_id
FROM public.events e
LEFT JOIN public.artists a ON e.artist_id = a.id
LEFT JOIN public.venues v ON e.venue_id = v.id
LEFT JOIN public.external_entity_ids eei_artist 
  ON eei_artist.entity_uuid = e.artist_id 
  AND eei_artist.entity_type = 'artist' 
  AND eei_artist.source = 'jambase'
LEFT JOIN public.external_entity_ids eei_venue 
  ON eei_venue.entity_uuid = e.venue_id 
  AND eei_venue.entity_type = 'venue' 
  AND eei_venue.source = 'jambase'
LEFT JOIN public.external_entity_ids eei_event 
  ON eei_event.entity_uuid = e.id 
  AND eei_event.entity_type = 'event' 
  AND eei_event.source = 'jambase';

COMMENT ON VIEW public.events_with_artist_venue IS 
'Helper view for normalization transition. Provides normalized artist/venue names via JOINs. Use this instead of events.artist_name/venue_name.';

-- ============================================
-- VIEW: artists_with_external_ids
-- ============================================
-- Provides external IDs via external_entity_ids table
-- Use this instead of artists.jambase_artist_id
-- Note: Uses subquery to exclude jambase_artist_id and artist_data_source to avoid duplicates
CREATE OR REPLACE VIEW public.artists_with_external_ids AS
WITH artist_base AS (
  SELECT 
    a.id,
    a.name,
    a.identifier,
    a.url,
    a.image_url,
    a.date_published,
    a.date_modified,
    a.artist_type,
    a.band_or_musician,
    a.founding_location,
    a.founding_date,
    a.genres,
    a.members,
    a.member_of,
    a.external_identifiers,
    a.same_as,
    a.num_upcoming_events,
    a.raw_jambase_data,
    a.owner_user_id,
    a.verified,
    a.claimed_at,
    a.created_at,
    a.updated_at,
    a.last_synced_at
  FROM public.artists a
)
SELECT 
  ab.*,
  -- External IDs from external_entity_ids (replaces jambase_artist_id and artist_data_source)
  eei_jambase.external_id AS jambase_artist_id,
  eei_ticketmaster.external_id AS ticketmaster_artist_id,
  eei_spotify.external_id AS spotify_artist_id,
  COALESCE(
    CASE WHEN eei_jambase.external_id IS NOT NULL THEN 'jambase' END,
    CASE WHEN eei_ticketmaster.external_id IS NOT NULL THEN 'ticketmaster' END,
    CASE WHEN eei_spotify.external_id IS NOT NULL THEN 'spotify' END,
    'jambase'
  ) AS artist_data_source
FROM artist_base ab
LEFT JOIN public.external_entity_ids eei_jambase 
  ON eei_jambase.entity_uuid = ab.id 
  AND eei_jambase.entity_type = 'artist' 
  AND eei_jambase.source = 'jambase'
LEFT JOIN public.external_entity_ids eei_ticketmaster 
  ON eei_ticketmaster.entity_uuid = ab.id 
  AND eei_ticketmaster.entity_type = 'artist' 
  AND eei_ticketmaster.source = 'ticketmaster'
LEFT JOIN public.external_entity_ids eei_spotify 
  ON eei_spotify.entity_uuid = ab.id 
  AND eei_spotify.entity_type = 'artist' 
  AND eei_spotify.source = 'spotify';

COMMENT ON VIEW public.artists_with_external_ids IS 
'Helper view for normalization transition. Provides external IDs via external_entity_ids table. Use this instead of artists.jambase_artist_id.';

-- ============================================
-- VIEW: venues_with_external_ids
-- ============================================
-- Provides external IDs via external_entity_ids table
-- Note: Uses subquery to exclude jambase_venue_id to avoid duplicates
CREATE OR REPLACE VIEW public.venues_with_external_ids AS
WITH venue_base AS (
  SELECT 
    v.id,
    v.name,
    v.identifier,
    v.url,
    v.image_url,
    v.date_published,
    v.date_modified,
    v.maximum_attendee_capacity,
    v.num_upcoming_events,
    v.same_as,
    v.last_synced_at,
    v.owner_user_id,
    v.verified,
    v.claimed_at,
    v.created_at,
    v.updated_at
  FROM public.venues v
)
SELECT 
  vb.*,
  -- External IDs from external_entity_ids (replaces jambase_venue_id)
  eei_jambase.external_id AS jambase_venue_id,
  eei_ticketmaster.external_id AS ticketmaster_venue_id
FROM venue_base vb
LEFT JOIN public.external_entity_ids eei_jambase 
  ON eei_jambase.entity_uuid = vb.id 
  AND eei_jambase.entity_type = 'venue' 
  AND eei_jambase.source = 'jambase'
LEFT JOIN public.external_entity_ids eei_ticketmaster 
  ON eei_ticketmaster.entity_uuid = vb.id 
  AND eei_ticketmaster.entity_type = 'venue' 
  AND eei_ticketmaster.source = 'ticketmaster';

COMMENT ON VIEW public.venues_with_external_ids IS 
'Helper view for normalization transition. Provides external IDs via external_entity_ids table. Use this instead of venues.jambase_venue_id.';

-- Grant permissions
GRANT SELECT ON public.events_with_artist_venue TO authenticated;
GRANT SELECT ON public.events_with_artist_venue TO anon;
GRANT SELECT ON public.artists_with_external_ids TO authenticated;
GRANT SELECT ON public.artists_with_external_ids TO anon;
GRANT SELECT ON public.venues_with_external_ids TO authenticated;
GRANT SELECT ON public.venues_with_external_ids TO anon;

COMMIT;

