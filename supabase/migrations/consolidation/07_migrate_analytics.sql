-- ============================================
-- DATABASE CONSOLIDATION: PHASE 3 - MIGRATE ANALYTICS
-- ============================================
-- This migration migrates all analytics_*_daily tables to unified analytics_daily table
-- Run this AFTER Phase 3.3 (migrate content) is complete

-- ============================================
-- 3.4.1 MIGRATE ANALYTICS_USER_DAILY → ANALYTICS_DAILY
-- ============================================

-- Migrate analytics_user_daily to analytics_daily_new
INSERT INTO public.analytics_daily_new (
  entity_type,
  entity_id,
  date,
  metrics,
  created_at,
  updated_at
)
SELECT 
  'user' as entity_type,
  aud.user_id::TEXT as entity_id,
  aud.date,
  jsonb_build_object(
    'events_viewed', aud.events_viewed,
    'events_clicked', aud.events_clicked,
    'events_interested', aud.events_interested,
    'events_attended', aud.events_attended,
    'ticket_links_clicked', aud.ticket_links_clicked,
    'reviews_written', aud.reviews_written,
    'reviews_viewed', aud.reviews_viewed,
    'reviews_liked', aud.reviews_liked,
    'reviews_commented', aud.reviews_commented,
    'artists_followed', aud.artists_followed,
    'venues_followed', aud.venues_followed,
    'friends_added', aud.friends_added,
    'messages_sent', aud.messages_sent,
    'shares_sent', aud.shares_sent,
    'searches_performed', aud.searches_performed,
    'sessions_count', aud.sessions_count,
    'total_time_seconds', aud.total_time_seconds,
    'avg_session_duration_seconds', aud.avg_session_duration_seconds
  ) as metrics,
  aud.created_at,
  aud.updated_at
FROM public.analytics_user_daily aud
ON CONFLICT (entity_type, entity_id, date) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_analytics_user_daily_count INTEGER;
  v_analytics_daily_user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_analytics_user_daily_count FROM public.analytics_user_daily;
  SELECT COUNT(*) INTO v_analytics_daily_user_count 
  FROM public.analytics_daily_new 
  WHERE entity_type = 'user';
  
  IF v_analytics_user_daily_count != v_analytics_daily_user_count THEN
    RAISE WARNING 'User analytics migration mismatch: analytics_user_daily=%, analytics_daily_new (user)=%', 
      v_analytics_user_daily_count, v_analytics_daily_user_count;
  ELSE
    RAISE NOTICE 'User analytics migration successful: % rows migrated', v_analytics_daily_user_count;
  END IF;
END $$;

-- ============================================
-- 3.4.2 MIGRATE ANALYTICS_EVENT_DAILY → ANALYTICS_DAILY
-- ============================================

-- Migrate analytics_event_daily to analytics_daily_new
INSERT INTO public.analytics_daily_new (
  entity_type,
  entity_id,
  date,
  metrics,
  created_at,
  updated_at
)
SELECT 
  'event' as entity_type,
  aed.event_id::TEXT as entity_id,
  aed.date,
  jsonb_build_object(
    'impressions', aed.impressions,
    'unique_viewers', aed.unique_viewers,
    'clicks', aed.clicks,
    'click_through_rate', aed.click_through_rate,
    'interested_count', aed.interested_count,
    'attended_count', aed.attended_count,
    'review_count', aed.review_count,
    'avg_rating', aed.avg_rating,
    'likes_count', aed.likes_count,
    'comments_count', aed.comments_count,
    'shares_count', aed.shares_count,
    'ticket_link_clicks', aed.ticket_link_clicks,
    'ticket_conversion_rate', aed.ticket_conversion_rate,
    'viewer_demographics', aed.viewer_demographics,
    'viewer_locations', aed.viewer_locations
  ) as metrics,
  aed.created_at,
  aed.updated_at
FROM public.analytics_event_daily aed
JOIN public.events_new e ON aed.event_id = e.id
ON CONFLICT (entity_type, entity_id, date) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_analytics_event_daily_count INTEGER;
  v_analytics_daily_event_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_analytics_event_daily_count FROM public.analytics_event_daily;
  SELECT COUNT(*) INTO v_analytics_daily_event_count 
  FROM public.analytics_daily_new 
  WHERE entity_type = 'event';
  
  IF v_analytics_event_daily_count != v_analytics_daily_event_count THEN
    RAISE WARNING 'Event analytics migration mismatch: analytics_event_daily=%, analytics_daily_new (event)=%', 
      v_analytics_event_daily_count, v_analytics_daily_event_count;
  ELSE
    RAISE NOTICE 'Event analytics migration successful: % rows migrated', v_analytics_daily_event_count;
  END IF;
END $$;

-- ============================================
-- 3.4.3 MIGRATE ANALYTICS_ARTIST_DAILY → ANALYTICS_DAILY
-- ============================================

-- Migrate analytics_artist_daily to analytics_daily_new
-- Note: analytics_artist_daily uses artist_name (TEXT) not UUID
DO $$
DECLARE
  v_has_active_events BOOLEAN;
  v_has_events_hosted BOOLEAN;
  v_has_avg_rating BOOLEAN;
  v_has_avg_artist_rating BOOLEAN;
  v_has_profile_clicks BOOLEAN;
  v_has_total_review_likes BOOLEAN;
  v_has_total_engagement BOOLEAN;
  v_has_fan_demographics BOOLEAN;
  v_has_fan_locations BOOLEAN;
  v_has_visitor_demographics BOOLEAN;
  v_has_visitor_locations BOOLEAN;
  v_sql TEXT;
BEGIN
  -- Check which columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_artist_daily' 
    AND column_name = 'active_events'
  ) INTO v_has_active_events;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_artist_daily' 
    AND column_name = 'events_hosted'
  ) INTO v_has_events_hosted;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_artist_daily' 
    AND column_name = 'avg_rating'
  ) INTO v_has_avg_rating;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_artist_daily' 
    AND column_name = 'avg_artist_rating'
  ) INTO v_has_avg_artist_rating;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_artist_daily' 
    AND column_name = 'profile_clicks'
  ) INTO v_has_profile_clicks;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_artist_daily' 
    AND column_name = 'total_review_likes'
  ) INTO v_has_total_review_likes;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_artist_daily' 
    AND column_name = 'total_engagement'
  ) INTO v_has_total_engagement;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_artist_daily' 
    AND column_name = 'fan_demographics'
  ) INTO v_has_fan_demographics;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_artist_daily' 
    AND column_name = 'fan_locations'
  ) INTO v_has_fan_locations;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_artist_daily' 
    AND column_name = 'visitor_demographics'
  ) INTO v_has_visitor_demographics;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'analytics_artist_daily' 
    AND column_name = 'visitor_locations'
  ) INTO v_has_visitor_locations;
  
  -- Build dynamic SQL based on which columns exist
  v_sql := '
    INSERT INTO public.analytics_daily_new (
      entity_type,
      entity_id,
      date,
      metrics,
      created_at,
      updated_at
    )
    SELECT 
      ''artist'' as entity_type,
      aad.artist_name as entity_id,
      aad.date,
      jsonb_build_object(
        ''profile_views'', COALESCE(aad.profile_views, 0),
        ''profile_clicks'', ' || CASE WHEN v_has_profile_clicks THEN 'COALESCE(aad.profile_clicks, 0)' ELSE '0' END || ',
        ''new_followers'', COALESCE(aad.new_followers, 0),
        ''total_followers'', COALESCE(aad.total_followers, 0),
        ''unfollows'', COALESCE(aad.unfollows, 0),
        ''active_events'', ' || CASE 
          WHEN v_has_active_events THEN 'COALESCE(aad.active_events, 0)'
          WHEN v_has_events_hosted THEN 'COALESCE(aad.events_hosted, 0)'
          ELSE '0'
        END || ',
        ''event_impressions'', COALESCE(aad.event_impressions, 0),
        ''event_clicks'', COALESCE(aad.event_clicks, 0),
        ''ticket_clicks'', COALESCE(aad.ticket_clicks, 0),
        ''reviews_received'', COALESCE(aad.reviews_received, 0),
        ''avg_rating'', ' || CASE 
          WHEN v_has_avg_rating THEN 'aad.avg_rating'
          WHEN v_has_avg_artist_rating THEN 'aad.avg_artist_rating'
          ELSE 'NULL'
        END || ',
        ''total_review_likes'', ' || CASE WHEN v_has_total_review_likes THEN 'COALESCE(aad.total_review_likes, 0)' ELSE '0' END || ',
        ''total_engagement'', ' || CASE WHEN v_has_total_engagement THEN 'COALESCE(aad.total_engagement, 0)' ELSE '0' END || ',
        ''fan_demographics'', ' || CASE 
          WHEN v_has_fan_demographics THEN 'COALESCE(aad.fan_demographics, ''{}''::jsonb)'
          WHEN v_has_visitor_demographics THEN 'COALESCE(aad.visitor_demographics, ''{}''::jsonb)'
          ELSE '''{}''::jsonb'
        END || ',
        ''fan_locations'', ' || CASE 
          WHEN v_has_fan_locations THEN 'COALESCE(aad.fan_locations, ''{}''::jsonb)'
          WHEN v_has_visitor_locations THEN 'COALESCE(aad.visitor_locations, ''{}''::jsonb)'
          ELSE '''{}''::jsonb'
        END || '
      ) as metrics,
      aad.created_at,
      aad.updated_at
    FROM public.analytics_artist_daily aad
    ON CONFLICT (entity_type, entity_id, date) DO NOTHING;
  ';
  
  EXECUTE v_sql;
  
  RAISE NOTICE 'Artist analytics migration completed';
END $$;

-- Verify migration
DO $$
DECLARE
  v_analytics_artist_daily_count INTEGER;
  v_analytics_daily_artist_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_analytics_artist_daily_count FROM public.analytics_artist_daily;
  SELECT COUNT(*) INTO v_analytics_daily_artist_count 
  FROM public.analytics_daily_new 
  WHERE entity_type = 'artist';
  
  IF v_analytics_artist_daily_count != v_analytics_daily_artist_count THEN
    RAISE WARNING 'Artist analytics migration mismatch: analytics_artist_daily=%, analytics_daily_new (artist)=%', 
      v_analytics_artist_daily_count, v_analytics_daily_artist_count;
  ELSE
    RAISE NOTICE 'Artist analytics migration successful: % rows migrated', v_analytics_daily_artist_count;
  END IF;
END $$;

-- ============================================
-- 3.4.4 MIGRATE ANALYTICS_VENUE_DAILY → ANALYTICS_DAILY
-- ============================================

-- Migrate analytics_venue_daily to analytics_daily_new
-- Note: analytics_venue_daily uses venue_name+city+state (TEXT) not UUID
INSERT INTO public.analytics_daily_new (
  entity_type,
  entity_id,
  date,
  metrics,
  created_at,
  updated_at
)
SELECT 
  'venue' as entity_type,
  avd.venue_name || '|' || COALESCE(avd.venue_city, '') || '|' || COALESCE(avd.venue_state, '') as entity_id,
  avd.date,
  jsonb_build_object(
    'profile_views', avd.profile_views,
    'profile_clicks', avd.profile_clicks,
    'new_followers', avd.new_followers,
    'total_followers', avd.total_followers,
    'unfollows', avd.unfollows,
    'events_hosted', avd.events_hosted,
    'event_impressions', avd.event_impressions,
    'event_clicks', avd.event_clicks,
    'ticket_clicks', avd.ticket_clicks,
    'total_attendance', avd.total_attendance,
    'capacity_utilization', avd.capacity_utilization,
    'reviews_received', avd.reviews_received,
    'avg_venue_rating', avd.avg_venue_rating,
    'visitor_demographics', avd.visitor_demographics,
    'visitor_locations', avd.visitor_locations
  ) as metrics,
  avd.created_at,
  avd.updated_at
FROM public.analytics_venue_daily avd
ON CONFLICT (entity_type, entity_id, date) DO NOTHING;

-- Verify migration
DO $$
DECLARE
  v_analytics_venue_daily_count INTEGER;
  v_analytics_daily_venue_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_analytics_venue_daily_count FROM public.analytics_venue_daily;
  SELECT COUNT(*) INTO v_analytics_daily_venue_count 
  FROM public.analytics_daily_new 
  WHERE entity_type = 'venue';
  
  IF v_analytics_venue_daily_count != v_analytics_daily_venue_count THEN
    RAISE WARNING 'Venue analytics migration mismatch: analytics_venue_daily=%, analytics_daily_new (venue)=%', 
      v_analytics_venue_daily_count, v_analytics_daily_venue_count;
  ELSE
    RAISE NOTICE 'Venue analytics migration successful: % rows migrated', v_analytics_daily_venue_count;
  END IF;
END $$;

-- ============================================
-- 3.4.5 MIGRATE ANALYTICS_CAMPAIGN_DAILY → ANALYTICS_DAILY
-- ============================================

-- Migrate analytics_campaign_daily to analytics_daily_new (if it exists)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analytics_campaign_daily') THEN
    -- Migrate analytics_campaign_daily
    INSERT INTO public.analytics_daily_new (
      entity_type,
      entity_id,
      date,
      metrics,
      created_at,
      updated_at
    )
    SELECT 
      'campaign' as entity_type,
      acd.campaign_id::TEXT as entity_id,
      acd.date,
      jsonb_build_object(
        'impressions', acd.impressions,
        'unique_viewers', acd.unique_viewers,
        'clicks', acd.clicks,
        'click_through_rate', acd.click_through_rate,
        'spend', acd.spend,
        'cost_per_click', acd.cost_per_click,
        'cost_per_impression', acd.cost_per_impression,
        'conversions', acd.conversions,
        'conversion_rate', acd.conversion_rate,
        'cost_per_conversion', acd.cost_per_conversion,
        'revenue_attributed', acd.revenue_attributed,
        'roas', acd.roas,
        'audience_demographics', acd.audience_demographics,
        'audience_locations', acd.audience_locations
      ) as metrics,
      acd.created_at,
      acd.updated_at
    FROM public.analytics_campaign_daily acd
    ON CONFLICT (entity_type, entity_id, date) DO NOTHING;
    
    RAISE NOTICE 'Campaign analytics migration completed';
  ELSE
    RAISE NOTICE 'Analytics_campaign_daily table does not exist, skipping migration';
  END IF;
END $$;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify all analytics migrated
SELECT 
  'Analytics migration complete' as status,
  (SELECT COUNT(*) FROM public.analytics_daily_new WHERE entity_type = 'user') as user_analytics_count,
  (SELECT COUNT(*) FROM public.analytics_daily_new WHERE entity_type = 'event') as event_analytics_count,
  (SELECT COUNT(*) FROM public.analytics_daily_new WHERE entity_type = 'artist') as artist_analytics_count,
  (SELECT COUNT(*) FROM public.analytics_daily_new WHERE entity_type = 'venue') as venue_analytics_count,
  (SELECT COUNT(*) FROM public.analytics_daily_new WHERE entity_type = 'campaign') as campaign_analytics_count,
  (SELECT COUNT(*) FROM public.analytics_daily_new) as total_analytics_count,
  (SELECT COUNT(*) FROM public.analytics_user_daily) as analytics_user_daily_old_count,
  (SELECT COUNT(*) FROM public.analytics_event_daily) as analytics_event_daily_old_count,
  (SELECT COUNT(*) FROM public.analytics_artist_daily) as analytics_artist_daily_old_count,
  (SELECT COUNT(*) FROM public.analytics_venue_daily) as analytics_venue_daily_old_count;

