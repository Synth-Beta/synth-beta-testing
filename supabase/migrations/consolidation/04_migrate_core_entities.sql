-- ============================================
-- DATABASE CONSOLIDATION: PHASE 3 - MIGRATE CORE ENTITIES
-- ============================================
-- This migration migrates core entity data from old tables to new consolidated tables
-- Run this AFTER Phase 2 (create consolidated tables) is complete

-- ============================================
-- 3.1 MIGRATE PROFILES → USERS
-- ============================================

-- Migrate profiles to users_new
INSERT INTO public.users_new (
  id,
  user_id,
  name,
  avatar_url,
  bio,
  instagram_handle,
  music_streaming_profile,
  gender,
  birthday,
  account_type,
  verified,
  verification_level,
  subscription_tier,
  subscription_expires_at,
  subscription_started_at,
  business_info,
  stripe_customer_id,
  stripe_subscription_id,
  is_public_profile,
  similar_users_notifications,
  trust_score,
  moderation_status,
  warning_count,
  last_warned_at,
  suspended_until,
  ban_reason,
  last_active_at,
  created_at,
  updated_at
)
SELECT 
  id,
  user_id,
  name,
  avatar_url,
  bio,
  instagram_handle,
  music_streaming_profile,
  gender,
  birthday,
  account_type,
  verified,
  verification_level,
  subscription_tier,
  subscription_expires_at,
  subscription_started_at,
  business_info,
  stripe_customer_id,
  stripe_subscription_id,
  is_public_profile,
  similar_users_notifications,
  trust_score,
  moderation_status,
  warning_count,
  last_warned_at,
  suspended_until,
  ban_reason,
  last_active_at,
  created_at,
  updated_at
FROM public.profiles
ON CONFLICT (user_id) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_profiles_count INTEGER;
  v_users_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_profiles_count FROM public.profiles;
  SELECT COUNT(*) INTO v_users_count FROM public.users_new;
  
  IF v_profiles_count != v_users_count THEN
    RAISE WARNING 'Profile migration mismatch: profiles=%, users_new=%', v_profiles_count, v_users_count;
  ELSE
    RAISE NOTICE 'Profile migration successful: % rows migrated', v_users_count;
  END IF;
END $$;

-- ============================================
-- 3.2 MIGRATE JAMBASE_EVENTS → EVENTS
-- ============================================

-- Migrate jambase_events to events_new
-- First, get promotion data from event_promotions table if it exists
INSERT INTO public.events_new (
  id,
  jambase_event_id,
  ticketmaster_event_id,
  title,
  artist_name,
  artist_id,
  artist_uuid,
  venue_name,
  venue_id,
  venue_uuid,
  event_date,
  doors_time,
  description,
  genres,
  venue_address,
  venue_city,
  venue_state,
  venue_zip,
  latitude,
  longitude,
  ticket_available,
  price_range,
  price_min,
  price_max,
  price_currency,
  ticket_urls,
  external_url,
  setlist,
  tour_name,
  source,
  event_status,
  classifications,
  sales_info,
  attraction_ids,
  venue_timezone,
  images,
  is_user_created,
  promoted,
  promotion_tier,
  promotion_start_date,
  promotion_end_date,
  is_featured,
  featured_until,
  created_by_user_id,
  created_at,
  updated_at
)
SELECT 
  je.id,
  je.jambase_event_id,
  je.ticketmaster_event_id,
  je.title,
  COALESCE(je.artist_name, 'Unknown Artist') as artist_name, -- Handle NULL artist_name
  je.artist_id,
  NULL::UUID as artist_uuid, -- Will be populated later by matching with artists_new
  COALESCE(je.venue_name, je.venue_city, 'Unknown Venue') as venue_name, -- Handle NULL venue_name
  je.venue_id,
  NULL::UUID as venue_uuid, -- Will be populated later by matching with venues_new
  je.event_date,
  je.doors_time,
  je.description,
  je.genres,
  je.venue_address,
  je.venue_city,
  je.venue_state,
  je.venue_zip,
  je.latitude,
  je.longitude,
  je.ticket_available,
  je.price_range,
  je.price_min,
  je.price_max,
  je.price_currency,
  je.ticket_urls,
  je.external_url,
  je.setlist,
  je.tour_name,
  COALESCE(je.source, 'jambase'),
  je.event_status,
  je.classifications,
  je.sales_info,
  je.attraction_ids,
  je.venue_timezone,
  je.images,
  COALESCE(je.is_user_created, false),
  -- Promotion fields from event_promotions table
  CASE WHEN ep.id IS NOT NULL AND ep.promotion_status = 'active' THEN true ELSE false END as promoted,
  ep.promotion_tier,
  ep.starts_at as promotion_start_date,
  ep.expires_at as promotion_end_date,
  je.is_featured,
  je.featured_until,
  je.created_by_user_id,
  je.created_at,
  je.updated_at
FROM public.jambase_events je
LEFT JOIN public.event_promotions ep ON je.id = ep.event_id 
  AND ep.promotion_status = 'active'
  AND ep.expires_at > now()
ON CONFLICT (id) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_events_old_count INTEGER;
  v_events_new_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_events_old_count FROM public.jambase_events;
  SELECT COUNT(*) INTO v_events_new_count FROM public.events_new;
  
  IF v_events_old_count != v_events_new_count THEN
    RAISE WARNING 'Events migration mismatch: jambase_events=%, events_new=%', v_events_old_count, v_events_new_count;
  ELSE
    RAISE NOTICE 'Events migration successful: % rows migrated', v_events_new_count;
  END IF;
END $$;

-- ============================================
-- 3.3 MIGRATE ARTISTS + ARTIST_PROFILE → ARTISTS
-- ============================================

-- Migrate artist_profile to artists_new (use artist_profile as base, merge artists if needed)
-- Only migrate if artist_profile table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artist_profile'
  ) THEN
    INSERT INTO public.artists_new (
      id,
      jambase_artist_id,
      artist_data_source,
      name,
      identifier,
      url,
      image_url,
      date_published,
      date_modified,
      artist_type,
      band_or_musician,
      founding_location,
      founding_date,
      genres,
      members,
      member_of,
      external_identifiers,
      same_as,
      num_upcoming_events,
      raw_jambase_data,
      owner_user_id,
      verified,
      claimed_at,
      created_at,
      updated_at,
      last_synced_at
    )
    SELECT 
      ap.id,
      ap.jambase_artist_id,
      ap.artist_data_source,
      ap.name,
      ap.identifier,
      ap.url,
      ap.image_url,
      ap.date_published,
      ap.date_modified,
      ap.artist_type,
      ap.band_or_musician,
      ap.founding_location,
      ap.founding_date,
      ap.genres,
      ap.members,
      ap.member_of,
      ap.external_identifiers,
      ap.same_as,
      ap.num_upcoming_events,
      ap.raw_jambase_data,
      NULL as owner_user_id, -- Will be populated from ownership tracking if exists
      false as verified, -- Will be populated from verification system if exists
      NULL as claimed_at,
      ap.created_at,
      ap.updated_at,
      ap.last_synced_at
    FROM public.artist_profile ap
    ON CONFLICT (jambase_artist_id) DO NOTHING;
    
    RAISE NOTICE 'Migrated data from artist_profile table';
  ELSE
    RAISE NOTICE 'artist_profile table does not exist, skipping migration from artist_profile';
  END IF;
END $$;

-- Migrate any artists that don't exist in artist_profile
INSERT INTO public.artists_new (
  id,
  jambase_artist_id,
  artist_data_source,
  name,
  identifier,
  url,
  image_url,
  date_published,
  date_modified,
  artist_type,
  band_or_musician,
  founding_location,
  founding_date,
  genres,
  members,
  member_of,
  external_identifiers,
  same_as,
  num_upcoming_events,
  raw_jambase_data,
  owner_user_id,
  verified,
  claimed_at,
  created_at,
  updated_at,
  last_synced_at
)
SELECT 
  a.id,
  a.jambase_artist_id,
  'jambase' as artist_data_source,
  a.name,
  a.identifier,
  a.url,
  a.image_url,
  a.date_published,
  a.date_modified,
  NULL as artist_type,
  NULL as band_or_musician,
  NULL as founding_location,
  NULL as founding_date,
  ARRAY[]::TEXT[] as genres,
  NULL::JSONB as members,
  NULL::JSONB as member_of,
  NULL::JSONB as external_identifiers,
  NULL::JSONB as same_as,
  0 as num_upcoming_events,
  NULL::JSONB as raw_jambase_data,
  NULL as owner_user_id,
  false as verified,
  NULL as claimed_at,
  a.created_at,
  a.updated_at,
  NULL as last_synced_at
FROM public.artists a
WHERE NOT EXISTS (
  SELECT 1 FROM public.artists_new an 
  WHERE an.jambase_artist_id = a.jambase_artist_id
)
ON CONFLICT (jambase_artist_id) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_artist_profile_count INTEGER := 0;
  v_artists_count INTEGER;
  v_artists_new_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artist_profile'
  ) THEN
    SELECT COUNT(*) INTO v_artist_profile_count FROM public.artist_profile;
  END IF;
  
  SELECT COUNT(*) INTO v_artists_count FROM public.artists;
  SELECT COUNT(*) INTO v_artists_new_count FROM public.artists_new;
  
  RAISE NOTICE 'Artist migration: artist_profile=%, artists=%, artists_new=%', 
    v_artist_profile_count, v_artists_count, v_artists_new_count;
END $$;

-- ============================================
-- 3.4 MIGRATE VENUES + VENUE_PROFILE → VENUES
-- ============================================

-- Migrate venue_profile to venues_new (use venue_profile as base, merge venues if needed)
-- Only migrate if venue_profile table exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'venue_profile'
  ) THEN
    INSERT INTO public.venues_new (
      id,
      jambase_venue_id,
      name,
      identifier,
      address,
      geo,
      maximum_attendee_capacity,
      num_upcoming_events,
      image_url,
      url,
      same_as,
      date_published,
      date_modified,
      last_synced_at,
      owner_user_id,
      verified,
      claimed_at,
      created_at,
      updated_at
    )
    SELECT 
      vp.id,
      vp.jambase_venue_id,
      vp.name,
      vp.identifier,
      vp.address,
      vp.geo,
      vp.maximum_attendee_capacity,
      vp.num_upcoming_events,
      vp.image_url,
      vp.url,
      vp.same_as,
      vp.date_published,
      vp.date_modified,
      vp.last_synced_at,
      NULL as owner_user_id, -- Will be populated from ownership tracking if exists
      false as verified, -- Will be populated from verification system if exists
      NULL as claimed_at,
      vp.created_at,
      vp.updated_at
    FROM public.venue_profile vp
    ON CONFLICT DO NOTHING;
    
    RAISE NOTICE 'Migrated data from venue_profile table';
  ELSE
    RAISE NOTICE 'venue_profile table does not exist, skipping migration from venue_profile';
  END IF;
END $$;

-- Migrate any venues that don't exist in venue_profile
-- Note: venue_profile uses identifier as unique key, venues uses jambase_venue_id
INSERT INTO public.venues_new (
  id,
  jambase_venue_id,
  name,
  identifier,
  address,
  geo,
  maximum_attendee_capacity,
  num_upcoming_events,
  image_url,
  url,
  same_as,
  date_published,
  date_modified,
  last_synced_at,
  owner_user_id,
  verified,
  claimed_at,
  created_at,
  updated_at
)
SELECT 
  v.id,
  v.jambase_venue_id,
  v.name,
  v.identifier,
  jsonb_build_object(
    'streetAddress', v.address,
    'addressLocality', v.city,
    'addressRegion', v.state,
    'postalCode', v.zip,
    'addressCountry', v.country
  ) as address,
  jsonb_build_object(
    'latitude', v.latitude,
    'longitude', v.longitude
  ) as geo,
  NULL as maximum_attendee_capacity,
  0 as num_upcoming_events,
  v.image_url,
  v.url,
  ARRAY[]::TEXT[] as same_as,
  v.date_published,
  v.date_modified,
  NULL as last_synced_at,
  NULL as owner_user_id,
  false as verified,
  NULL as claimed_at,
  v.created_at,
  v.updated_at
FROM public.venues v
WHERE NOT EXISTS (
  SELECT 1 FROM public.venues_new vn 
  WHERE vn.jambase_venue_id = v.jambase_venue_id
    OR vn.identifier = v.identifier
)
ON CONFLICT DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_venue_profile_count INTEGER := 0;
  v_venues_count INTEGER;
  v_venues_new_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'venue_profile'
  ) THEN
    SELECT COUNT(*) INTO v_venue_profile_count FROM public.venue_profile;
  END IF;
  
  SELECT COUNT(*) INTO v_venues_count FROM public.venues;
  SELECT COUNT(*) INTO v_venues_new_count FROM public.venues_new;
  
  RAISE NOTICE 'Venue migration: venue_profile=%, venues=%, venues_new=%', 
    v_venue_profile_count, v_venues_count, v_venues_new_count;
END $$;

-- ============================================
-- 3.5 UPDATE FOREIGN KEY REFERENCES IN EVENTS
-- ============================================

-- Update artist_uuid in events_new based on jambase_artist_id matching
UPDATE public.events_new e
SET artist_uuid = a.id
FROM public.artists_new a
WHERE e.artist_id = a.jambase_artist_id
  AND e.artist_uuid IS NULL;

-- Update venue_uuid in events_new based on jambase_venue_id or name matching
UPDATE public.events_new e
SET venue_uuid = v.id
FROM public.venues_new v
WHERE (e.venue_id = v.jambase_venue_id 
    OR (e.venue_id IS NULL AND e.venue_name = v.name 
        AND e.venue_city = (v.address->>'addressLocality')
        AND e.venue_state = (v.address->>'addressRegion')))
  AND e.venue_uuid IS NULL;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify all core entities migrated
DO $$
DECLARE
  v_users_count INTEGER;
  v_events_count INTEGER;
  v_artists_count INTEGER;
  v_venues_count INTEGER;
  v_profiles_old_count INTEGER;
  v_events_old_count INTEGER;
  v_artist_profile_old_count INTEGER := 0;
  v_venue_profile_old_count INTEGER := 0;
BEGIN
  SELECT COUNT(*) INTO v_users_count FROM public.users_new;
  SELECT COUNT(*) INTO v_events_count FROM public.events_new;
  SELECT COUNT(*) INTO v_artists_count FROM public.artists_new;
  SELECT COUNT(*) INTO v_venues_count FROM public.venues_new;
  SELECT COUNT(*) INTO v_profiles_old_count FROM public.profiles;
  SELECT COUNT(*) INTO v_events_old_count FROM public.jambase_events;
  
  -- Check artist_profile count if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artist_profile'
  ) THEN
    SELECT COUNT(*) INTO v_artist_profile_old_count FROM public.artist_profile;
  END IF;
  
  -- Check venue_profile count if table exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'venue_profile'
  ) THEN
    SELECT COUNT(*) INTO v_venue_profile_old_count FROM public.venue_profile;
  END IF;
  
  RAISE NOTICE 'Core entities migration complete:';
  RAISE NOTICE '  users_new: %, events_new: %, artists_new: %, venues_new: %', 
    v_users_count, v_events_count, v_artists_count, v_venues_count;
  RAISE NOTICE '  profiles (old): %, jambase_events (old): %', 
    v_profiles_old_count, v_events_old_count;
  RAISE NOTICE '  artist_profile (old): %, venue_profile (old): %', 
    v_artist_profile_old_count, v_venue_profile_old_count;
END $$;

