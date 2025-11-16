-- ============================================
-- DATABASE CONSOLIDATION: PHASE 4 - UPDATE VIEWS
-- ============================================
-- This migration updates all database views to reference new consolidated table names
-- Run this AFTER Phase 3 (data migration) is complete

-- ============================================
-- 4.2.1 UPDATE PUBLIC_REVIEWS_WITH_PROFILES VIEW
-- ============================================

-- Update public_reviews_with_profiles view
DROP VIEW IF EXISTS public.public_reviews_with_profiles CASCADE;

CREATE OR REPLACE VIEW public.public_reviews_with_profiles AS
SELECT 
    r.id,
    r.user_id,
    r.event_id,
    r.venue_id,
    r.artist_id,
    r.rating,
    r.performance_rating,
    r.venue_rating_new as venue_rating,
    r.overall_experience_rating,
    r.performance_review_text,
    r.venue_review_text,
    r.overall_experience_review_text,
    r.review_type,
    r.reaction_emoji,
    r.review_text,
    r.photos,
    r.videos,
    r.mood_tags,
    r.genre_tags,
    r.context_tags,
    r.venue_tags,
    r.artist_tags,
    r.likes_count,
    r.comments_count,
    r.shares_count,
    r.created_at,
    r.updated_at,
    r.is_draft,
    u.name as reviewer_name,
    u.avatar_url as reviewer_avatar,
    u.verified as reviewer_verified,
    u.account_type as reviewer_account_type,
    e.title as event_title,
    e.artist_name,
    e.venue_name,
    e.event_date
FROM public.reviews r
JOIN public.users u ON r.user_id = u.user_id
LEFT JOIN public.events e ON r.event_id = e.id
WHERE r.is_public = true;

-- Grant access to the updated view
GRANT SELECT ON public.public_reviews_with_profiles TO authenticated;
GRANT SELECT ON public.public_reviews_with_profiles TO anon;

-- ============================================
-- 4.2.2 UPDATE ENHANCED_REVIEWS_WITH_PROFILES VIEW
-- ============================================

-- Update enhanced_reviews_with_profiles view
DROP VIEW IF EXISTS public.enhanced_reviews_with_profiles CASCADE;

CREATE OR REPLACE VIEW public.enhanced_reviews_with_profiles AS
SELECT 
    r.id,
    r.user_id,
    r.event_id,
    r.venue_id,
    r.artist_id,
    r.rating,
    r.artist_rating,
    r.venue_rating,
    r.performance_rating,
    r.venue_rating_new,
    r.overall_experience_rating,
    r.review_type,
    r.reaction_emoji,
    r.review_text,
    r.performance_review_text,
    r.venue_review_text,
    r.overall_experience_review_text,
    r.photos,
    r.videos,
    r.mood_tags,
    r.genre_tags,
    r.context_tags,
    r.venue_tags,
    r.artist_tags,
    r.likes_count,
    r.comments_count,
    r.shares_count,
    r.created_at,
    r.updated_at,
    -- User profile data
    u.name as reviewer_name,
    u.avatar_url as reviewer_avatar,
    u.verified as reviewer_verified,
    u.account_type as reviewer_account_type,
    -- Event data
    e.title as event_title,
    e.artist_name,
    e.venue_name,
    e.event_date,
    -- Artist data (from normalized artists table)
    a.id as artist_uuid,
    a.name as artist_normalized_name,
    a.image_url as artist_image_url,
    a.url as artist_url,
    a.jambase_artist_id as artist_jambase_id,
    -- Venue data (from normalized venues table)
    v.id as venue_uuid,
    v.name as venue_normalized_name,
    v.image_url as venue_image_url,
    v.address as venue_address,
    v.geo as venue_geo,
    v.maximum_attendee_capacity
FROM public.reviews r
JOIN public.users u ON r.user_id = u.user_id
LEFT JOIN public.events e ON r.event_id = e.id
LEFT JOIN public.artists a ON r.artist_id = a.id
LEFT JOIN public.venues v ON r.venue_id = v.id
WHERE r.is_public = true;

-- Grant access to the updated view
GRANT SELECT ON public.enhanced_reviews_with_profiles TO authenticated;
GRANT SELECT ON public.enhanced_reviews_with_profiles TO anon;

-- ============================================
-- 4.2.3 UPDATE FRIENDS_REVIEWS_SIMPLE VIEW
-- ============================================

-- Update friends_reviews_simple view
DROP VIEW IF EXISTS public.friends_reviews_simple CASCADE;

CREATE OR REPLACE VIEW public.friends_reviews_simple AS
SELECT DISTINCT
  r.id as review_id,
  r.user_id as reviewer_id,
  r.event_id,
  r.rating,
  r.review_text,
  r.is_public,
  r.is_draft,
  r.photos,
  r.likes_count,
  r.comments_count,
  r.shares_count,
  r.created_at,
  r.updated_at,
  -- Profile information
  u.name as reviewer_name,
  u.avatar_url as reviewer_avatar,
  -- Event information
  e.title as event_title,
  e.artist_name,
  e.venue_name,
  e.event_date,
  e.venue_city,
  e.venue_state,
  e.artist_id,
  e.venue_id
FROM public.reviews r
JOIN public.users u ON r.user_id = u.user_id
JOIN public.events e ON r.event_id = e.id
JOIN public.relationships rel ON (
  r.user_id = rel.related_entity_id::UUID
  AND rel.user_id = auth.uid()
  AND rel.related_entity_type = 'user'
  AND rel.relationship_type = 'friend'
  AND rel.status = 'accepted'
)
WHERE r.is_public = true 
  AND r.is_draft = false
  AND r.review_text != 'ATTENDANCE_ONLY'
  AND r.review_text IS NOT NULL
  AND r.review_text != '';

-- Grant access to the updated view
GRANT SELECT ON public.friends_reviews_simple TO authenticated;

-- ============================================
-- 4.2.4 UPDATE PROFILES_WITH_ACCOUNT_INFO VIEW
-- ============================================

-- Update profiles_with_account_info view
DROP VIEW IF EXISTS public.profiles_with_account_info CASCADE;

CREATE OR REPLACE VIEW public.profiles_with_account_info AS
SELECT 
  u.id,
  u.user_id,
  u.name,
  u.avatar_url,
  u.bio,
  u.account_type,
  u.verified,
  u.verification_level,
  u.subscription_tier,
  u.subscription_expires_at,
  u.business_info,
  u.created_at,
  u.updated_at,
  -- Account permissions (if exists)
  ap.permission_key,
  ap.permission_name,
  ap.granted
FROM public.users u
LEFT JOIN public.account_permissions ap ON u.account_type = ap.account_type;

-- Grant access to the updated view
GRANT SELECT ON public.profiles_with_account_info TO authenticated;

-- ============================================
-- 4.2.5 UPDATE ARTIST_PROFILE_SUMMARY VIEW
-- ============================================

-- Update artist_profile_summary view
DROP VIEW IF EXISTS public.artist_profile_summary CASCADE;

CREATE OR REPLACE VIEW public.artist_profile_summary AS
SELECT 
  id,
  jambase_artist_id,
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
FROM public.artists;

-- Grant permissions on the view
GRANT SELECT ON public.artist_profile_summary TO authenticated;
GRANT SELECT ON public.artist_profile_summary TO anon;

-- ============================================
-- 4.2.6 UPDATE ANALYTICS_PROFILES VIEW
-- ============================================

-- Update analytics_profiles view (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'analytics_profiles') THEN
    DROP VIEW IF EXISTS public.analytics_profiles CASCADE;
    
    CREATE OR REPLACE VIEW public.analytics_profiles AS
    SELECT 
      u.user_id,
      u.name,
      u.account_type,
      u.verified,
      u.subscription_tier,
      ad.date,
      ad.metrics
    FROM public.users u
    LEFT JOIN public.analytics_daily ad ON ad.entity_type = 'user' AND ad.entity_id = u.user_id::TEXT;
    
    GRANT SELECT ON public.analytics_profiles TO authenticated;
    
    RAISE NOTICE 'Analytics profiles view updated';
  ELSE
    RAISE NOTICE 'Analytics_profiles view does not exist, skipping update';
  END IF;
END $$;

-- ============================================
-- 4.2.7 UPDATE ARTIST_FOLLOWS_WITH_DETAILS VIEW
-- ============================================

-- Update artist_follows_with_details view (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'artist_follows_with_details') THEN
    DROP VIEW IF EXISTS public.artist_follows_with_details CASCADE;
    
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
      a.jambase_artist_id,
      a.genres
    FROM public.relationships r
    JOIN public.users u ON r.user_id = u.user_id
    JOIN public.artists a ON r.related_entity_id::UUID = a.id
    WHERE r.related_entity_type = 'artist'
      AND r.relationship_type = 'follow';
    
    GRANT SELECT ON public.artist_follows_with_details TO authenticated;
    
    RAISE NOTICE 'Artist follows with details view updated';
  ELSE
    RAISE NOTICE 'Artist_follows_with_details view does not exist, skipping update';
  END IF;
END $$;

-- ============================================
-- 4.2.8 UPDATE VENUE_FOLLOWS_WITH_DETAILS VIEW
-- ============================================

-- Update venue_follows_with_details view (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'venue_follows_with_details') THEN
    DROP VIEW IF EXISTS public.venue_follows_with_details CASCADE;
    
    CREATE OR REPLACE VIEW public.venue_follows_with_details AS
    SELECT 
      r.id,
      r.user_id,
      r.related_entity_id as venue_identifier,
      r.created_at,
      r.updated_at,
      u.name as user_name,
      u.avatar_url as user_avatar_url,
      (r.metadata->>'venue_name')::TEXT as venue_name,
      (r.metadata->>'venue_city')::TEXT as venue_city,
      (r.metadata->>'venue_state')::TEXT as venue_state,
      v.id as venue_id,
      v.name as venue_normalized_name,
      v.image_url as venue_image_url,
      v.address as venue_address,
      v.geo as venue_geo
    FROM public.relationships r
    JOIN public.users u ON r.user_id = u.user_id
    LEFT JOIN public.venues v ON r.related_entity_id = v.id::TEXT
      OR (r.metadata->>'venue_name')::TEXT = v.name
        AND (r.metadata->>'venue_city')::TEXT = (v.address->>'addressLocality')
        AND (r.metadata->>'venue_state')::TEXT = (v.address->>'addressRegion')
    WHERE r.related_entity_type = 'venue'
      AND r.relationship_type = 'follow';
    
    GRANT SELECT ON public.venue_follows_with_details TO authenticated;
    
    RAISE NOTICE 'Venue follows with details view updated';
  ELSE
    RAISE NOTICE 'Venue_follows_with_details view does not exist, skipping update';
  END IF;
END $$;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify all views updated
SELECT 
  'Views updated' as status,
  COUNT(*) as view_count
FROM information_schema.views
WHERE table_schema = 'public'
  AND (
    view_definition LIKE '%users_new%'
    OR view_definition LIKE '%events_new%'
    OR view_definition LIKE '%artists_new%'
    OR view_definition LIKE '%venues_new%'
    OR view_definition LIKE '%relationships_new%'
    OR view_definition LIKE '%reviews_new%'
    OR view_definition LIKE '%comments_new%'
    OR view_definition LIKE '%engagements_new%'
    OR view_definition LIKE '%interactions_new%'
    OR view_definition LIKE '%analytics_daily_new%'
    OR view_definition LIKE '%user_preferences_new%'
    -- Also check for old table names that might still be referenced
    OR view_definition LIKE '%jambase_events%'
    OR view_definition LIKE '%user_reviews%'
    OR view_definition LIKE '%event_comments%'
    OR view_definition LIKE '%review_comments%'
  );

-- Verify views were created/updated successfully
SELECT 
  'Views Created/Updated' as status,
  table_name as view_name,
  CASE 
    WHEN table_name IN ('public_reviews_with_profiles', 'enhanced_reviews_with_profiles', 'friends_reviews_simple', 'profiles_with_account_info', 'artist_profile_summary')
    THEN 'Core view'
    WHEN table_name IN ('analytics_profiles', 'artist_follows_with_details', 'venue_follows_with_details')
    THEN 'Optional view (may not exist)'
    ELSE 'Other view'
  END as view_type
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN (
    'public_reviews_with_profiles',
    'enhanced_reviews_with_profiles',
    'friends_reviews_simple',
    'profiles_with_account_info',
    'artist_profile_summary',
    'analytics_profiles',
    'artist_follows_with_details',
    'venue_follows_with_details'
  )
ORDER BY table_name;

-- List all views that still reference old table names
SELECT 
  'Views still referencing old tables' as status,
  table_name as view_name
FROM information_schema.views
WHERE table_schema = 'public'
  AND (
    view_definition LIKE '%profiles%'
    OR view_definition LIKE '%jambase_events%'
    OR view_definition LIKE '%artist_profile%'
    OR view_definition LIKE '%venue_profile%'
    OR view_definition LIKE '%artist_follows%'
    OR view_definition LIKE '%venue_follows%'
    OR view_definition LIKE '%user_jambase_events%'
    OR view_definition LIKE '%friends%'
    OR view_definition LIKE '%friend_requests%'
    OR view_definition LIKE '%matches%'
    OR view_definition LIKE '%user_blocks%'
    OR view_definition LIKE '%user_reviews%'
    OR view_definition LIKE '%event_comments%'
    OR view_definition LIKE '%review_comments%'
    OR view_definition LIKE '%event_likes%'
    OR view_definition LIKE '%review_likes%'
    OR view_definition LIKE '%comment_likes%'
    OR view_definition LIKE '%review_shares%'
    OR view_definition LIKE '%user_swipes%'
    OR view_definition LIKE '%user_interactions%'
    OR view_definition LIKE '%analytics_user_daily%'
    OR view_definition LIKE '%analytics_event_daily%'
    OR view_definition LIKE '%analytics_artist_daily%'
    OR view_definition LIKE '%analytics_venue_daily%'
    OR view_definition LIKE '%analytics_campaign_daily%'
    OR view_definition LIKE '%streaming_profiles%'
    OR view_definition LIKE '%user_streaming_stats_summary%'
    OR view_definition LIKE '%music_preference_signals%'
    OR view_definition LIKE '%user_recommendations_cache%'
  )
  AND table_name NOT LIKE '%_old';

-- ============================================
-- SUMMARY
-- ============================================

-- Final summary of views that were created/updated
SELECT 
  'View Update Summary' as summary_type,
  COUNT(*) as total_views_created,
  COUNT(*) FILTER (WHERE table_name IN ('public_reviews_with_profiles', 'enhanced_reviews_with_profiles', 'friends_reviews_simple', 'profiles_with_account_info', 'artist_profile_summary')) as core_views,
  COUNT(*) FILTER (WHERE table_name IN ('analytics_profiles', 'artist_follows_with_details', 'venue_follows_with_details')) as optional_views
FROM information_schema.views
WHERE table_schema = 'public'
  AND table_name IN (
    'public_reviews_with_profiles',
    'enhanced_reviews_with_profiles',
    'friends_reviews_simple',
    'profiles_with_account_info',
    'artist_profile_summary',
    'analytics_profiles',
    'artist_follows_with_details',
    'venue_follows_with_details'
  );

