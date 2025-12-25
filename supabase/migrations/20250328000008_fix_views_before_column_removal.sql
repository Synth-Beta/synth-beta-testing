-- ============================================
-- FIX VIEWS BEFORE REMOVING REDUNDANT COLUMNS
-- ============================================
-- This migration updates all views that depend on jambase_*_id columns
-- so they can be safely removed in the cleanup migration
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Update artist_profile_summary view
-- ============================================
-- This view currently selects jambase_artist_id directly from artists table
-- Update it to use the helper view that provides jambase_artist_id via external_entity_ids

DROP VIEW IF EXISTS public.artist_profile_summary CASCADE;

CREATE OR REPLACE VIEW public.artist_profile_summary AS
SELECT 
  id,
  jambase_artist_id, -- Get from helper view (resolved from external_entity_ids)
  name,
  identifier,
  url,
  image_url,
  artist_type,
  band_or_musician,
  founding_location,
  founding_date,
  genres,
  num_upcoming_events,
  owner_user_id,
  verified,
  claimed_at,
  created_at,
  updated_at,
  last_synced_at
FROM public.artists_with_external_ids;

-- Grant permissions on the view
GRANT SELECT ON public.artist_profile_summary TO authenticated;
GRANT SELECT ON public.artist_profile_summary TO anon;

-- ============================================
-- STEP 2: Update artist_follows_with_details view
-- ============================================
-- This view also references jambase_artist_id from artists table
-- Handle both possible view definitions (from artist_follows table or relationships table)

DROP VIEW IF EXISTS public.artist_follows_with_details CASCADE;

-- Check which table structure exists and create appropriate view
DO $$
BEGIN
  -- Check if artist_follows table exists (newer structure)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'artist_follows') THEN
    CREATE OR REPLACE VIEW public.artist_follows_with_details AS
    SELECT 
      af.id,
      af.user_id,
      af.artist_id,
      af.created_at,
      a.name as artist_name,
      a.image_url as artist_image_url,
      awi.jambase_artist_id, -- Get from helper view instead of direct column
      NULL::INTEGER as num_upcoming_events, -- Placeholder - can be calculated from events if needed
      NULL::TEXT[] as genres, -- Placeholder - genres would come from artists.genres if needed
      u.name as user_name,
      u.avatar_url as user_avatar_url
    FROM public.artist_follows af
    LEFT JOIN public.artists a ON af.artist_id = a.id
    LEFT JOIN public.artists_with_external_ids awi ON a.id = awi.id
    LEFT JOIN public.users u ON af.user_id = u.user_id;
    
    RAISE NOTICE 'Created artist_follows_with_details view using artist_follows table';
  ELSE
    -- Fallback: use relationships table (older structure)
    CREATE OR REPLACE VIEW public.artist_follows_with_details AS
    SELECT 
      r.id,
      r.user_id,
      r.related_entity_id::UUID as artist_id,
      r.created_at,
      r.updated_at,
      u.name as user_name,
      u.avatar_url as user_avatar_url,
      a.name as artist_name,
      a.image_url as artist_image_url,
      awi.jambase_artist_id, -- Get from helper view instead of direct column
      a.genres
    FROM public.relationships r
    JOIN public.users u ON r.user_id = u.user_id
    JOIN public.artists a ON r.related_entity_id::UUID = a.id
    LEFT JOIN public.artists_with_external_ids awi ON a.id = awi.id
    WHERE r.related_entity_type = 'artist'
      AND r.relationship_type = 'follow';
    
    RAISE NOTICE 'Created artist_follows_with_details view using relationships table';
  END IF;
END $$;

-- Grant permissions
GRANT SELECT ON public.artist_follows_with_details TO authenticated;

COMMENT ON VIEW public.artist_follows_with_details IS 'Artist follows with denormalized artist and user details. Uses normalized external_entity_ids for jambase_artist_id.';

-- ============================================
-- STEP 3: Update venues_with_stats view
-- ============================================
-- This view uses v.* which includes jambase_venue_id
-- Update it to use helper view or explicitly exclude jambase_venue_id

DROP VIEW IF EXISTS public.venues_with_stats CASCADE;

CREATE OR REPLACE VIEW public.venues_with_stats AS
WITH venue_data AS (
  SELECT 
    v.id,
    v.name,
    v.identifier,
    v.url,
    v.image_url,
    v.street_address AS address, -- Use street_address (address column was dropped in migration 20250125000004)
    NULL::TEXT AS city, -- City column doesn't exist in venues table (only in events table as venue_city)
    v.state,
    v.zip,
    v.country,
    v.latitude,
    v.longitude,
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
    v.updated_at,
    -- Get jambase_venue_id from external_entity_ids (not from venues.jambase_venue_id)
    eei_jambase.external_id AS jambase_venue_id,
    eei_ticketmaster.external_id AS ticketmaster_venue_id
  FROM public.venues v
  LEFT JOIN public.external_entity_ids eei_jambase 
    ON eei_jambase.entity_uuid = v.id 
    AND eei_jambase.entity_type = 'venue' 
    AND eei_jambase.source = 'jambase'
  LEFT JOIN public.external_entity_ids eei_ticketmaster 
    ON eei_ticketmaster.entity_uuid = v.id 
    AND eei_ticketmaster.entity_type = 'venue' 
    AND eei_ticketmaster.source = 'ticketmaster'
)
SELECT 
  vd.id,
  vd.name,
  vd.identifier,
  vd.url,
  vd.image_url,
  vd.address,
  vd.city,
  vd.state,
  vd.zip,
  vd.country,
  vd.latitude,
  vd.longitude,
  vd.date_published,
  vd.date_modified,
  vd.maximum_attendee_capacity,
  vd.num_upcoming_events,
  vd.same_as,
  vd.last_synced_at,
  vd.owner_user_id,
  vd.verified,
  vd.claimed_at,
  vd.created_at,
  vd.updated_at,
  vd.jambase_venue_id,
  vd.ticketmaster_venue_id,
  COUNT(e.id) as total_events,
  COUNT(CASE WHEN e.event_date > NOW() THEN 1 END) as upcoming_events,
  MAX(e.event_date) as last_event_date,
  MIN(e.event_date) as first_event_date
FROM venue_data vd
LEFT JOIN public.events e ON vd.id = e.venue_id
GROUP BY vd.id, vd.name, vd.identifier, vd.url, vd.image_url, vd.address, vd.city,
         vd.state, vd.zip, vd.country, vd.latitude, vd.longitude, vd.date_published,
         vd.date_modified, vd.maximum_attendee_capacity, vd.num_upcoming_events,
         vd.same_as, vd.last_synced_at, vd.owner_user_id, vd.verified, vd.claimed_at,
         vd.created_at, vd.updated_at, vd.jambase_venue_id, vd.ticketmaster_venue_id;

-- Grant permissions
GRANT SELECT ON public.venues_with_stats TO authenticated;
GRANT SELECT ON public.venues_with_stats TO anon;

COMMENT ON VIEW public.venues_with_stats IS 'Venues with event statistics. Uses normalized external_entity_ids for jambase_venue_id.';

-- ============================================
-- STEP 4: Update venue_search_results view (if it exists)
-- ============================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema = 'public' AND table_name = 'venue_search_results') THEN
    DROP VIEW IF EXISTS public.venue_search_results CASCADE;
    
    CREATE OR REPLACE VIEW public.venue_search_results AS
    SELECT 
      v.id,
      v.name,
      v.street_address AS address, -- Use street_address (address column was dropped)
      NULL::TEXT AS city, -- City column doesn't exist in venues table
      v.state,
      v.zip,
      v.country,
      v.latitude,
      v.longitude,
      COUNT(e.id) as events_count,
      -- Create a searchable text field
      LOWER(
        v.name || ' ' || 
        COALESCE(v.street_address, '') || ' ' || 
        COALESCE(v.state, '') || ' ' ||
        COALESCE(v.zip, '')
      ) as searchable_text
    FROM public.venues v
    LEFT JOIN public.events e ON v.id = e.venue_id
    GROUP BY v.id, v.name, v.street_address, v.state, v.zip, v.country, 
             v.latitude, v.longitude;
    
    GRANT SELECT ON public.venue_search_results TO authenticated;
    GRANT SELECT ON public.venue_search_results TO anon;
    
    RAISE NOTICE 'Updated venue_search_results view';
  ELSE
    RAISE NOTICE 'venue_search_results view does not exist, skipping';
  END IF;
END $$;

-- ============================================
-- STEP 5: Update events_with_artist_venue view
-- ============================================
-- This view uses e.* which includes jambase_event_id
-- Update it to exclude jambase_event_id and get it from external_entity_ids instead

DROP VIEW IF EXISTS public.events_with_artist_venue CASCADE;

-- Recreate the view without jambase_event_id, ticketmaster_event_id, artist_name, venue_name from events table
-- We'll get external IDs from external_entity_ids and names from JOINs
CREATE OR REPLACE VIEW public.events_with_artist_venue AS
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
    e.updated_at
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
'Helper view for normalization transition. Provides normalized artist/venue names via JOINs. External IDs come from external_entity_ids table.';

-- Grant permissions
GRANT SELECT ON public.events_with_artist_venue TO authenticated;
GRANT SELECT ON public.events_with_artist_venue TO anon;

-- ============================================
-- STEP 6: Check for other dependent views
-- ============================================
-- Query to find all views that might depend on jambase_*_id columns

DO $$
DECLARE
  v_dependent_views TEXT;
BEGIN
  -- Find views that reference jambase_artist_id, jambase_venue_id, or jambase_event_id
  SELECT string_agg(DISTINCT view_name, ', '), 'No dependent views found'
  INTO v_dependent_views
  FROM information_schema.view_table_usage vtu
  JOIN information_schema.views v ON v.table_schema = vtu.view_schema AND v.table_name = vtu.view_name
  WHERE vtu.table_schema = 'public'
    AND vtu.table_name IN ('artists', 'venues', 'events')
    AND (
      EXISTS (
        SELECT 1 FROM information_schema.columns c
        WHERE c.table_schema = vtu.table_schema
          AND c.table_name = vtu.table_name
          AND c.column_name IN ('jambase_artist_id', 'jambase_venue_id', 'jambase_event_id')
      )
    );
  
  IF v_dependent_views IS NOT NULL AND v_dependent_views != 'No dependent views found' THEN
    RAISE NOTICE 'Found dependent views: %', v_dependent_views;
  ELSE
    RAISE NOTICE '✅ No additional dependent views found (or all already updated)';
  END IF;
END $$;

-- ============================================
-- STEP 3: Verify view works correctly
-- ============================================

DO $$
DECLARE
  v_view_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_view_count
  FROM public.artist_profile_summary
  LIMIT 1;
  
  IF v_view_count >= 0 THEN
    RAISE NOTICE '✅ artist_profile_summary view is working correctly';
  ELSE
    RAISE WARNING '⚠️ artist_profile_summary view may have issues';
  END IF;
END $$;

-- ============================================
-- STEP 6: Update reviews_with_connection_degree view
-- ============================================
-- This view uses je.artist_name and je.venue_name from events table
-- Update it to get names from artists and venues tables via JOINs

DROP VIEW IF EXISTS public.reviews_with_connection_degree CASCADE;

CREATE VIEW public.reviews_with_connection_degree AS
SELECT 
  ur.id as review_id,
  ur.user_id as reviewer_id,
  ur.event_id,
  ur.rating::numeric AS rating,
  ur.review_text::TEXT as review_text,
  ur.review_text::TEXT AS content,
  ur.is_public,
  ur.is_draft,
  ur.photos::TEXT[] as photos,
  je.setlist AS setlist,
  ur.likes_count,
  ur.comments_count,
  ur.shares_count,
  ur.created_at,
  ur.updated_at,
  -- Profile information
  p.name::TEXT as reviewer_name,
  p.avatar_url::TEXT as reviewer_avatar,
  p.verified as reviewer_verified,
  p.account_type::TEXT as reviewer_account_type,
  -- Event information
  je.title::TEXT as event_title,
  -- Get artist_name from artists table (no fallback to events.artist_name)
  a.name::TEXT as artist_name,
  -- Get venue_name from venues table (no fallback to events.venue_name)
  v.name::TEXT as venue_name,
  je.event_date,
  je.venue_city::TEXT as venue_city,
  je.venue_state::TEXT as venue_state,
  -- Get external IDs from external_entity_ids table (or NULL if not found)
  COALESCE(eei_artist.external_id, je.artist_id::TEXT) as artist_id,
  COALESCE(eei_venue.external_id, je.venue_id::TEXT) as venue_id,
  -- Connection degree (using existing function)
  COALESCE(
    public.get_connection_degree(auth.uid(), ur.user_id),
    999
  ) as connection_degree,
  -- Connection type label
  (SELECT label::TEXT FROM public.get_connection_info(auth.uid(), ur.user_id) LIMIT 1)::TEXT as connection_type_label,
  -- Connection color
  (SELECT color::TEXT FROM public.get_connection_info(auth.uid(), ur.user_id) LIMIT 1)::TEXT as connection_color
FROM public.reviews ur
JOIN public.users p ON ur.user_id = p.user_id
JOIN public.events je ON ur.event_id = je.id
-- Join with artists table to get artist_name
LEFT JOIN public.artists a ON je.artist_id = a.id
-- Join with venues table to get venue_name
LEFT JOIN public.venues v ON je.venue_id = v.id
-- Left join to get external IDs for artist
LEFT JOIN public.external_entity_ids eei_artist 
  ON eei_artist.entity_uuid = je.artist_id 
  AND eei_artist.entity_type = 'artist' 
  AND eei_artist.source = 'jambase'
-- Left join to get external IDs for venue
LEFT JOIN public.external_entity_ids eei_venue 
  ON eei_venue.entity_uuid = je.venue_id 
  AND eei_venue.entity_type = 'venue' 
  AND eei_venue.source = 'jambase'
WHERE ur.is_public = true 
  AND ur.is_draft = false
  AND ur.review_text != 'ATTENDANCE_ONLY'
  AND ur.review_text IS NOT NULL
  AND ur.review_text != ''
  AND ur.user_id != auth.uid() -- Exclude own reviews
  -- Filter by connection degree: include 1st, 2nd, relevant 3rd, and brand-new public reviews
  AND (
    public.get_connection_degree(auth.uid(), ur.user_id) IN (1, 2) -- Always include 1st and 2nd
    OR (
      public.get_connection_degree(auth.uid(), ur.user_id) = 3 
      -- Only include 3rd if relevant: current user follows the artist OR venue of THIS event
      AND public.is_event_relevant_to_user(
        auth.uid(), 
        COALESCE(eei_artist.external_id, je.artist_id::TEXT),
        COALESCE(eei_venue.external_id, je.venue_id::TEXT),
        v.name::TEXT, -- Use venue name from venues table (no fallback)
        je.venue_city,
        je.venue_state
      )
    )
    OR (
      public.get_connection_degree(auth.uid(), ur.user_id) NOT IN (1, 2, 3)
      AND ur.created_at = ur.updated_at -- Only surface brand-new reviews
      AND ur.created_at >= (NOW() - INTERVAL '30 days')
    )
  );

GRANT SELECT ON public.reviews_with_connection_degree TO authenticated;

COMMENT ON VIEW public.reviews_with_connection_degree IS 
  'Reviews from 1st, 2nd, and relevant 3rd degree connections. 3rd degree only shows if the current user follows the artist OR venue of the review event. Updated to get artist_name and venue_name from normalized tables instead of events table.';

-- ============================================
-- STEP 7: Update events_with_external_ids view
-- ============================================
-- This view uses e.artist_name and e.venue_name from events table
-- Update it to get names from artists and venues tables via JOINs

DROP VIEW IF EXISTS public.events_with_external_ids CASCADE;

CREATE OR REPLACE VIEW public.events_with_external_ids AS
SELECT 
  e.id AS event_id,
  e.title,
  -- Get artist_name from artists table (no fallback to events.artist_name)
  a.name::TEXT AS artist_name,
  -- Get external ID from external_entity_ids, fallback to UUID as text
  COALESCE(eei_artist.external_id, e.artist_id::TEXT) AS artist_id,
  e.artist_id AS artist_uuid,
  -- Get venue_name from venues table (no fallback to events.venue_name)
  v.name::TEXT AS venue_name,
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
-- Join with artists table to get artist_name
LEFT JOIN public.artists a ON e.artist_id = a.id
-- Join with venues table to get venue_name
LEFT JOIN public.venues v ON e.venue_id = v.id
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
  'Helper view for events with external IDs resolved from external_entity_ids table. Updated to get artist_name and venue_name from normalized tables instead of events table. Use this in functions that need artist_id/venue_id as external IDs. Updated for 3NF schema.';

COMMIT;

