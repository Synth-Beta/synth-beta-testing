-- ============================================
-- DATABASE CONSOLIDATION: PHASE 6 - RENAME TABLES TO FINAL NAMES
-- ============================================
-- This migration renames all _new tables to final names
-- Run this AFTER Phase 5 (update application code) is complete and verified
-- WARNING: This will break existing code that references old table names
-- Only run this after all application code has been updated

-- ============================================
-- 6.1 RENAME USERS_NEW → USERS
-- ============================================

-- Drop old profiles table if it exists (after verification)
-- First, rename old profiles table to profiles_old for backup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
    ALTER TABLE public.profiles RENAME TO profiles_old;
  END IF;
END $$;

-- Rename users_new to users
ALTER TABLE public.users_new RENAME TO users;

-- Update all indexes
ALTER INDEX IF EXISTS idx_users_new_user_id RENAME TO idx_users_user_id;
ALTER INDEX IF EXISTS idx_users_new_account_type RENAME TO idx_users_account_type;
ALTER INDEX IF EXISTS idx_users_new_verified RENAME TO idx_users_verified;
ALTER INDEX IF EXISTS idx_users_new_verification_level RENAME TO idx_users_verification_level;
ALTER INDEX IF EXISTS idx_users_new_subscription_tier RENAME TO idx_users_subscription_tier;
ALTER INDEX IF EXISTS idx_users_new_subscription_expires RENAME TO idx_users_subscription_expires;
ALTER INDEX IF EXISTS idx_users_new_business_info RENAME TO idx_users_business_info;
ALTER INDEX IF EXISTS idx_users_new_moderation_status RENAME TO idx_users_moderation_status;
ALTER INDEX IF EXISTS idx_users_new_last_active RENAME TO idx_users_last_active;

-- Update all triggers
DROP TRIGGER IF EXISTS update_users_new_updated_at ON public.users;
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON public.users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update all RLS policies
DO $$
BEGIN
  -- Drop old policies
  DROP POLICY IF EXISTS "Users can view all public profiles" ON public.users;
  DROP POLICY IF EXISTS "Users can view their own profile" ON public.users;
  DROP POLICY IF EXISTS "Users can update their own profile" ON public.users;
  DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users;
  
  -- Recreate policies with new names
  CREATE POLICY "Users can view all public profiles"
  ON public.users FOR SELECT
  USING (is_public_profile = true OR auth.uid() = user_id);

  CREATE POLICY "Users can view their own profile"
  ON public.users FOR SELECT
  USING (auth.uid() = user_id);

  CREATE POLICY "Users can update their own profile"
  ON public.users FOR UPDATE
  USING (auth.uid() = user_id);

  CREATE POLICY "Users can insert their own profile"
  ON public.users FOR INSERT
  WITH CHECK (auth.uid() = user_id);
END $$;

-- ============================================
-- 6.2 RENAME EVENTS_NEW → EVENTS
-- ============================================

-- Drop old jambase_events table if it exists (after verification)
-- First, rename old jambase_events table to jambase_events_old for backup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'jambase_events') THEN
    ALTER TABLE public.jambase_events RENAME TO jambase_events_old;
  END IF;
END $$;

-- Rename events_new to events
ALTER TABLE public.events_new RENAME TO events;

-- Update all indexes
-- First drop existing indexes if they exist from old table
DROP INDEX IF EXISTS public.idx_events_genres;
DROP INDEX IF EXISTS public.idx_events_promoted;
DROP INDEX IF EXISTS public.idx_events_promotion_dates;
DROP INDEX IF EXISTS public.idx_events_created_by;
DROP INDEX IF EXISTS public.idx_events_source;
DROP INDEX IF EXISTS public.idx_events_jambase_event_id;
DROP INDEX IF EXISTS public.idx_events_ticketmaster_event_id;
DROP INDEX IF EXISTS public.idx_events_artist_name;
DROP INDEX IF EXISTS public.idx_events_venue_name;
DROP INDEX IF EXISTS public.idx_events_event_date;
DROP INDEX IF EXISTS public.idx_events_artist_uuid;
DROP INDEX IF EXISTS public.idx_events_venue_uuid;

-- Now rename the indexes from _new tables
ALTER INDEX IF EXISTS idx_events_new_jambase_event_id RENAME TO idx_events_jambase_event_id;
ALTER INDEX IF EXISTS idx_events_new_ticketmaster_event_id RENAME TO idx_events_ticketmaster_event_id;
ALTER INDEX IF EXISTS idx_events_new_artist_name RENAME TO idx_events_artist_name;
ALTER INDEX IF EXISTS idx_events_new_venue_name RENAME TO idx_events_venue_name;
ALTER INDEX IF EXISTS idx_events_new_event_date RENAME TO idx_events_event_date;
ALTER INDEX IF EXISTS idx_events_new_artist_uuid RENAME TO idx_events_artist_uuid;
ALTER INDEX IF EXISTS idx_events_new_venue_uuid RENAME TO idx_events_venue_uuid;
ALTER INDEX IF EXISTS idx_events_new_genres RENAME TO idx_events_genres;
ALTER INDEX IF EXISTS idx_events_new_promoted RENAME TO idx_events_promoted;
ALTER INDEX IF EXISTS idx_events_new_promotion_dates RENAME TO idx_events_promotion_dates;
ALTER INDEX IF EXISTS idx_events_new_created_by RENAME TO idx_events_created_by;
ALTER INDEX IF EXISTS idx_events_new_source RENAME TO idx_events_source;

-- Update all triggers
DROP TRIGGER IF EXISTS update_events_new_updated_at ON public.events;
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update all RLS policies
DO $$
BEGIN
  -- Drop old policies
  DROP POLICY IF EXISTS "Events are viewable by everyone" ON public.events;
  DROP POLICY IF EXISTS "Events can be created by authenticated users" ON public.events;
  DROP POLICY IF EXISTS "Event owners can update their events" ON public.events;
  
  -- Recreate policies with new names
  CREATE POLICY "Events are viewable by everyone"
  ON public.events FOR SELECT
  USING (true);

  CREATE POLICY "Events can be created by authenticated users"
  ON public.events FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

  CREATE POLICY "Event owners can update their events"
  ON public.events FOR UPDATE
  USING (created_by_user_id = auth.uid() OR EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid()
    AND u.account_type IN ('admin', 'business', 'creator') -- 'promoter' is now 'business' with business_info.entity_type = 'promoter'
  ));
END $$;

-- ============================================
-- 6.3 RENAME ARTISTS_NEW → ARTISTS
-- ============================================

-- Drop old artists and artist_profile tables if they exist (after verification)
-- First, rename old tables for backup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'artists') THEN
    ALTER TABLE public.artists RENAME TO artists_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'artist_profile') THEN
    ALTER TABLE public.artist_profile RENAME TO artist_profile_old;
  END IF;
END $$;

-- Rename artists_new to artists
ALTER TABLE public.artists_new RENAME TO artists;

-- Update all indexes
-- First drop existing indexes if they exist from old table
DROP INDEX IF EXISTS public.idx_artists_jambase_id;
DROP INDEX IF EXISTS public.idx_artists_identifier;
DROP INDEX IF EXISTS public.idx_artists_name;
DROP INDEX IF EXISTS public.idx_artists_artist_type;
DROP INDEX IF EXISTS public.idx_artists_band_or_musician;
DROP INDEX IF EXISTS public.idx_artists_genres;
DROP INDEX IF EXISTS public.idx_artists_external_identifiers;
DROP INDEX IF EXISTS public.idx_artists_same_as;
DROP INDEX IF EXISTS public.idx_artists_owner;
DROP INDEX IF EXISTS public.idx_artists_verified;

-- Now rename the indexes from _new tables
ALTER INDEX IF EXISTS idx_artists_new_jambase_id RENAME TO idx_artists_jambase_id;
ALTER INDEX IF EXISTS idx_artists_new_identifier RENAME TO idx_artists_identifier;
ALTER INDEX IF EXISTS idx_artists_new_name RENAME TO idx_artists_name;
ALTER INDEX IF EXISTS idx_artists_new_artist_type RENAME TO idx_artists_artist_type;
ALTER INDEX IF EXISTS idx_artists_new_band_or_musician RENAME TO idx_artists_band_or_musician;
ALTER INDEX IF EXISTS idx_artists_new_genres RENAME TO idx_artists_genres;
ALTER INDEX IF EXISTS idx_artists_new_external_identifiers RENAME TO idx_artists_external_identifiers;
ALTER INDEX IF EXISTS idx_artists_new_same_as RENAME TO idx_artists_same_as;
ALTER INDEX IF EXISTS idx_artists_new_owner RENAME TO idx_artists_owner;
ALTER INDEX IF EXISTS idx_artists_new_verified RENAME TO idx_artists_verified;

-- Update all triggers
DROP TRIGGER IF EXISTS update_artists_new_updated_at ON public.artists;
CREATE TRIGGER update_artists_updated_at
  BEFORE UPDATE ON public.artists
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update all RLS policies
DO $$
BEGIN
  -- Drop old policies
  DROP POLICY IF EXISTS "Artists are viewable by everyone" ON public.artists;
  DROP POLICY IF EXISTS "Artists can be created by authenticated users" ON public.artists;
  DROP POLICY IF EXISTS "Artists can be updated by authenticated users" ON public.artists;
  DROP POLICY IF EXISTS "Artists can be deleted by authenticated users" ON public.artists;
  
  -- Recreate policies with new names
  CREATE POLICY "Artists are viewable by everyone"
  ON public.artists FOR SELECT
  USING (true);

  CREATE POLICY "Artists can be created by authenticated users"
  ON public.artists FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

  CREATE POLICY "Artists can be updated by authenticated users"
  ON public.artists FOR UPDATE
  USING (auth.role() = 'authenticated');

  CREATE POLICY "Artists can be deleted by authenticated users"
  ON public.artists FOR DELETE
  USING (auth.role() = 'authenticated');
END $$;

-- ============================================
-- 6.4 RENAME VENUES_NEW → VENUES
-- ============================================

-- Drop old venues and venue_profile tables if they exist (after verification)
-- First, rename old tables for backup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'venues') THEN
    ALTER TABLE public.venues RENAME TO venues_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'venue_profile') THEN
    ALTER TABLE public.venue_profile RENAME TO venue_profile_old;
  END IF;
END $$;

-- Rename venues_new to venues
ALTER TABLE public.venues_new RENAME TO venues;

-- Update all indexes
-- First drop existing indexes if they exist from old table
DROP INDEX IF EXISTS public.idx_venues_jambase_id;
DROP INDEX IF EXISTS public.idx_venues_name;
DROP INDEX IF EXISTS public.idx_venues_identifier;
DROP INDEX IF EXISTS public.idx_venues_address;
DROP INDEX IF EXISTS public.idx_venues_geo;
DROP INDEX IF EXISTS public.idx_venues_same_as;
DROP INDEX IF EXISTS public.idx_venues_owner;
DROP INDEX IF EXISTS public.idx_venues_verified;
DROP INDEX IF EXISTS public.idx_venues_last_synced;

-- Now rename the indexes from _new tables
ALTER INDEX IF EXISTS idx_venues_new_jambase_id RENAME TO idx_venues_jambase_id;
ALTER INDEX IF EXISTS idx_venues_new_name RENAME TO idx_venues_name;
ALTER INDEX IF EXISTS idx_venues_new_identifier RENAME TO idx_venues_identifier;
ALTER INDEX IF EXISTS idx_venues_new_address RENAME TO idx_venues_address;
ALTER INDEX IF EXISTS idx_venues_new_geo RENAME TO idx_venues_geo;
ALTER INDEX IF EXISTS idx_venues_new_same_as RENAME TO idx_venues_same_as;
ALTER INDEX IF EXISTS idx_venues_new_owner RENAME TO idx_venues_owner;
ALTER INDEX IF EXISTS idx_venues_new_verified RENAME TO idx_venues_verified;
ALTER INDEX IF EXISTS idx_venues_new_last_synced RENAME TO idx_venues_last_synced;

-- Update all triggers
DROP TRIGGER IF EXISTS update_venues_new_updated_at ON public.venues;
CREATE TRIGGER update_venues_updated_at
  BEFORE UPDATE ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update all RLS policies
DO $$
BEGIN
  -- Drop old policies
  DROP POLICY IF EXISTS "Venues are viewable by everyone" ON public.venues;
  DROP POLICY IF EXISTS "Venues can be created by authenticated users" ON public.venues;
  DROP POLICY IF EXISTS "Venues can be updated by authenticated users" ON public.venues;
  
  -- Recreate policies with new names
  CREATE POLICY "Venues are viewable by everyone"
  ON public.venues FOR SELECT
  USING (true);

  CREATE POLICY "Venues can be created by authenticated users"
  ON public.venues FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

  CREATE POLICY "Venues can be updated by authenticated users"
  ON public.venues FOR UPDATE
  USING (auth.role() = 'authenticated');
END $$;

-- ============================================
-- 6.5 RENAME RELATIONSHIPS_NEW → RELATIONSHIPS
-- ============================================

-- Rename relationships_new to relationships
ALTER TABLE public.relationships_new RENAME TO relationships;

-- Update all indexes
ALTER INDEX IF EXISTS idx_relationships_new_user_id RENAME TO idx_relationships_user_id;
ALTER INDEX IF EXISTS idx_relationships_new_entity_type RENAME TO idx_relationships_entity_type;
ALTER INDEX IF EXISTS idx_relationships_new_entity_id RENAME TO idx_relationships_entity_id;
ALTER INDEX IF EXISTS idx_relationships_new_type RENAME TO idx_relationships_type;
ALTER INDEX IF EXISTS idx_relationships_new_status RENAME TO idx_relationships_status;
ALTER INDEX IF EXISTS idx_relationships_new_metadata RENAME TO idx_relationships_metadata;
ALTER INDEX IF EXISTS idx_relationships_new_user_entity RENAME TO idx_relationships_user_entity;
ALTER INDEX IF EXISTS idx_relationships_new_created_at RENAME TO idx_relationships_created_at;

-- Update all triggers
DROP TRIGGER IF EXISTS update_relationships_new_updated_at ON public.relationships;
CREATE TRIGGER update_relationships_updated_at
  BEFORE UPDATE ON public.relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update all RLS policies
DO $$
BEGIN
  -- Drop old policies
  DROP POLICY IF EXISTS "Users can view their own relationships" ON public.relationships;
  DROP POLICY IF EXISTS "Users can create their own relationships" ON public.relationships;
  DROP POLICY IF EXISTS "Users can update their own relationships" ON public.relationships;
  DROP POLICY IF EXISTS "Users can delete their own relationships" ON public.relationships;
  
  -- Recreate policies with new names
  CREATE POLICY "Users can view their own relationships"
  ON public.relationships FOR SELECT
  USING (auth.uid() = user_id);

  CREATE POLICY "Users can create their own relationships"
  ON public.relationships FOR INSERT
  WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can update their own relationships"
  ON public.relationships FOR UPDATE
  USING (auth.uid() = user_id);

  CREATE POLICY "Users can delete their own relationships"
  ON public.relationships FOR DELETE
  USING (auth.uid() = user_id);
END $$;

-- ============================================
-- 6.6 RENAME REVIEWS_NEW → REVIEWS
-- ============================================

-- Drop old user_reviews table if it exists (after verification)
-- First, rename old user_reviews table to user_reviews_old for backup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_reviews') THEN
    ALTER TABLE public.user_reviews RENAME TO user_reviews_old;
  END IF;
END $$;

-- Rename reviews_new to reviews
ALTER TABLE public.reviews_new RENAME TO reviews;

-- Update all indexes
ALTER INDEX IF EXISTS idx_reviews_new_user_id RENAME TO idx_reviews_user_id;
ALTER INDEX IF EXISTS idx_reviews_new_event_id RENAME TO idx_reviews_event_id;
ALTER INDEX IF EXISTS idx_reviews_new_artist_id RENAME TO idx_reviews_artist_id;
ALTER INDEX IF EXISTS idx_reviews_new_venue_id RENAME TO idx_reviews_venue_id;
ALTER INDEX IF EXISTS idx_reviews_new_rating RENAME TO idx_reviews_rating;
ALTER INDEX IF EXISTS idx_reviews_new_created_at RENAME TO idx_reviews_created_at;
ALTER INDEX IF EXISTS idx_reviews_new_public RENAME TO idx_reviews_public;
ALTER INDEX IF EXISTS idx_reviews_new_draft RENAME TO idx_reviews_draft;
ALTER INDEX IF EXISTS idx_reviews_new_mood_tags RENAME TO idx_reviews_mood_tags;
ALTER INDEX IF EXISTS idx_reviews_new_genre_tags RENAME TO idx_reviews_genre_tags;
ALTER INDEX IF EXISTS idx_reviews_new_photos RENAME TO idx_reviews_photos;

-- Update all triggers
DROP TRIGGER IF EXISTS update_reviews_new_updated_at ON public.reviews;
CREATE TRIGGER update_reviews_updated_at
  BEFORE UPDATE ON public.reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update all RLS policies
DO $$
BEGIN
  -- Drop old policies
  DROP POLICY IF EXISTS "Public reviews are viewable by everyone" ON public.reviews;
  DROP POLICY IF EXISTS "Users can view their own reviews" ON public.reviews;
  DROP POLICY IF EXISTS "Users can create their own reviews" ON public.reviews;
  DROP POLICY IF EXISTS "Users can update their own reviews" ON public.reviews;
  DROP POLICY IF EXISTS "Users can delete their own reviews" ON public.reviews;
  
  -- Recreate policies with new names
  CREATE POLICY "Public reviews are viewable by everyone"
  ON public.reviews FOR SELECT
  USING (is_public = true);

  CREATE POLICY "Users can view their own reviews"
  ON public.reviews FOR SELECT
  USING (auth.uid() = user_id);

  CREATE POLICY "Users can create their own reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can update their own reviews"
  ON public.reviews FOR UPDATE
  USING (auth.uid() = user_id);

  CREATE POLICY "Users can delete their own reviews"
  ON public.reviews FOR DELETE
  USING (auth.uid() = user_id);
END $$;

-- ============================================
-- 6.7 RENAME COMMENTS_NEW → COMMENTS
-- ============================================

-- Drop old event_comments and review_comments tables if they exist (after verification)
-- First, rename old tables for backup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_comments') THEN
    ALTER TABLE public.event_comments RENAME TO event_comments_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'review_comments') THEN
    ALTER TABLE public.review_comments RENAME TO review_comments_old;
  END IF;
END $$;

-- Rename comments_new to comments
ALTER TABLE public.comments_new RENAME TO comments;

-- Update all indexes
ALTER INDEX IF EXISTS idx_comments_new_user_id RENAME TO idx_comments_user_id;
ALTER INDEX IF EXISTS idx_comments_new_entity_type RENAME TO idx_comments_entity_type;
ALTER INDEX IF EXISTS idx_comments_new_entity_id RENAME TO idx_comments_entity_id;
ALTER INDEX IF EXISTS idx_comments_new_parent_id RENAME TO idx_comments_parent_id;
ALTER INDEX IF EXISTS idx_comments_new_entity RENAME TO idx_comments_entity;
ALTER INDEX IF EXISTS idx_comments_new_created_at RENAME TO idx_comments_created_at;

-- Update all triggers
DROP TRIGGER IF EXISTS update_comments_new_updated_at ON public.comments;
CREATE TRIGGER update_comments_updated_at
  BEFORE UPDATE ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update all RLS policies
DO $$
BEGIN
  -- Drop old policies
  DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments;
  DROP POLICY IF EXISTS "Users can create their own comments" ON public.comments;
  DROP POLICY IF EXISTS "Users can update their own comments" ON public.comments;
  DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments;
  
  -- Recreate policies with new names
  CREATE POLICY "Comments are viewable by everyone"
  ON public.comments FOR SELECT
  USING (true);

  CREATE POLICY "Users can create their own comments"
  ON public.comments FOR INSERT
  WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can update their own comments"
  ON public.comments FOR UPDATE
  USING (auth.uid() = user_id);

  CREATE POLICY "Users can delete their own comments"
  ON public.comments FOR DELETE
  USING (auth.uid() = user_id);
END $$;

-- ============================================
-- 6.8 RENAME ENGAGEMENTS_NEW → ENGAGEMENTS
-- ============================================

-- Drop old engagement tables if they exist (after verification)
-- First, rename old tables for backup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'event_likes') THEN
    ALTER TABLE public.event_likes RENAME TO event_likes_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'review_likes') THEN
    ALTER TABLE public.review_likes RENAME TO review_likes_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'comment_likes') THEN
    ALTER TABLE public.comment_likes RENAME TO comment_likes_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'review_shares') THEN
    ALTER TABLE public.review_shares RENAME TO review_shares_old;
  END IF;
END $$;

-- Rename engagements_new to engagements
ALTER TABLE public.engagements_new RENAME TO engagements;

-- Update all indexes
ALTER INDEX IF EXISTS idx_engagements_new_user_id RENAME TO idx_engagements_user_id;
ALTER INDEX IF EXISTS idx_engagements_new_entity_type RENAME TO idx_engagements_entity_type;
ALTER INDEX IF EXISTS idx_engagements_new_entity_id RENAME TO idx_engagements_entity_id;
ALTER INDEX IF EXISTS idx_engagements_new_type RENAME TO idx_engagements_type;
ALTER INDEX IF EXISTS idx_engagements_new_value RENAME TO idx_engagements_value;
ALTER INDEX IF EXISTS idx_engagements_new_metadata RENAME TO idx_engagements_metadata;
ALTER INDEX IF EXISTS idx_engagements_new_entity RENAME TO idx_engagements_entity;
ALTER INDEX IF EXISTS idx_engagements_new_created_at RENAME TO idx_engagements_created_at;

-- Update all RLS policies
DO $$
BEGIN
  -- Drop old policies
  DROP POLICY IF EXISTS "Engagements are viewable by everyone" ON public.engagements;
  DROP POLICY IF EXISTS "Users can create their own engagements" ON public.engagements;
  DROP POLICY IF EXISTS "Users can delete their own engagements" ON public.engagements;
  
  -- Recreate policies with new names
  CREATE POLICY "Engagements are viewable by everyone"
  ON public.engagements FOR SELECT
  USING (true);

  CREATE POLICY "Users can create their own engagements"
  ON public.engagements FOR INSERT
  WITH CHECK (auth.uid() = user_id);

  CREATE POLICY "Users can delete their own engagements"
  ON public.engagements FOR DELETE
  USING (auth.uid() = user_id);
END $$;

-- ============================================
-- 6.9 RENAME INTERACTIONS_NEW → INTERACTIONS
-- ============================================

-- Drop old user_interactions table if it exists (after verification)
-- First, rename old user_interactions table to user_interactions_old for backup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_interactions') THEN
    ALTER TABLE public.user_interactions RENAME TO user_interactions_old;
  END IF;
END $$;

-- Rename interactions_new to interactions
ALTER TABLE public.interactions_new RENAME TO interactions;

-- Update all indexes
ALTER INDEX IF EXISTS idx_interactions_new_user_id RENAME TO idx_interactions_user_id;
ALTER INDEX IF EXISTS idx_interactions_new_global_user_id RENAME TO idx_interactions_global_user_id;
ALTER INDEX IF EXISTS idx_interactions_new_session_id RENAME TO idx_interactions_session_id;
ALTER INDEX IF EXISTS idx_interactions_new_event_type RENAME TO idx_interactions_event_type;
ALTER INDEX IF EXISTS idx_interactions_new_entity_type RENAME TO idx_interactions_entity_type;
ALTER INDEX IF EXISTS idx_interactions_new_entity_id RENAME TO idx_interactions_entity_id;
ALTER INDEX IF EXISTS idx_interactions_new_occurred_at RENAME TO idx_interactions_occurred_at;
ALTER INDEX IF EXISTS idx_interactions_new_metadata RENAME TO idx_interactions_metadata;

-- Update all RLS policies
DO $$
BEGIN
  -- Drop old policies
  DROP POLICY IF EXISTS "Users can view their own interactions" ON public.interactions;
  DROP POLICY IF EXISTS "Users can create their own interactions" ON public.interactions;
  
  -- Recreate policies with new names
  CREATE POLICY "Users can view their own interactions"
  ON public.interactions FOR SELECT
  USING (auth.uid() = user_id);

  CREATE POLICY "Users can create their own interactions"
  ON public.interactions FOR INSERT
  WITH CHECK (auth.uid() = user_id);
END $$;

-- ============================================
-- 6.10 RENAME ANALYTICS_DAILY_NEW → ANALYTICS_DAILY
-- ============================================

-- Drop old analytics tables if they exist (after verification)
-- First, rename old tables for backup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analytics_user_daily') THEN
    ALTER TABLE public.analytics_user_daily RENAME TO analytics_user_daily_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analytics_event_daily') THEN
    ALTER TABLE public.analytics_event_daily RENAME TO analytics_event_daily_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analytics_artist_daily') THEN
    ALTER TABLE public.analytics_artist_daily RENAME TO analytics_artist_daily_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analytics_venue_daily') THEN
    ALTER TABLE public.analytics_venue_daily RENAME TO analytics_venue_daily_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'analytics_campaign_daily') THEN
    ALTER TABLE public.analytics_campaign_daily RENAME TO analytics_campaign_daily_old;
  END IF;
END $$;

-- Rename analytics_daily_new to analytics_daily
ALTER TABLE public.analytics_daily_new RENAME TO analytics_daily;

-- Update all indexes
ALTER INDEX IF EXISTS idx_analytics_daily_new_entity_type RENAME TO idx_analytics_daily_entity_type;
ALTER INDEX IF EXISTS idx_analytics_daily_new_entity_id RENAME TO idx_analytics_daily_entity_id;
ALTER INDEX IF EXISTS idx_analytics_daily_new_date RENAME TO idx_analytics_daily_date;
ALTER INDEX IF EXISTS idx_analytics_daily_new_entity_date RENAME TO idx_analytics_daily_entity_date;
ALTER INDEX IF EXISTS idx_analytics_daily_new_metrics RENAME TO idx_analytics_daily_metrics;

-- Update all triggers
DROP TRIGGER IF EXISTS update_analytics_daily_new_updated_at ON public.analytics_daily;
CREATE TRIGGER update_analytics_daily_updated_at
  BEFORE UPDATE ON public.analytics_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update all RLS policies
DO $$
BEGIN
  -- Drop old policies
  DROP POLICY IF EXISTS "Users can view their own analytics" ON public.analytics_daily;
  DROP POLICY IF EXISTS "Admins can view all analytics" ON public.analytics_daily;
  
  -- Recreate policies with new names
  CREATE POLICY "Users can view their own analytics"
  ON public.analytics_daily FOR SELECT
  USING (
    (entity_type = 'user' AND entity_id = auth.uid()::TEXT)
    OR EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
      AND u.account_type IN ('admin', 'business', 'creator') -- 'promoter' is now 'business' with business_info.entity_type = 'promoter'
    )
  );

  CREATE POLICY "Admins can view all analytics"
  ON public.analytics_daily FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = auth.uid()
      AND u.account_type = 'admin'
    )
  );
END $$;

-- ============================================
-- 6.11 RENAME USER_PREFERENCES_NEW → USER_PREFERENCES
-- ============================================

-- Drop old preferences tables if they exist (after verification)
-- First, rename old tables for backup
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'streaming_profiles') THEN
    ALTER TABLE public.streaming_profiles RENAME TO streaming_profiles_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_streaming_stats_summary') THEN
    ALTER TABLE public.user_streaming_stats_summary RENAME TO user_streaming_stats_summary_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'music_preference_signals') THEN
    ALTER TABLE public.music_preference_signals RENAME TO music_preference_signals_old;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_recommendations_cache') THEN
    ALTER TABLE public.user_recommendations_cache RENAME TO user_recommendations_cache_old;
  END IF;
END $$;

-- Rename user_preferences_new to user_preferences
ALTER TABLE public.user_preferences_new RENAME TO user_preferences;

-- Update all indexes
ALTER INDEX IF EXISTS idx_user_preferences_new_user_id RENAME TO idx_user_preferences_user_id;
ALTER INDEX IF EXISTS idx_user_preferences_new_genres RENAME TO idx_user_preferences_genres;
ALTER INDEX IF EXISTS idx_user_preferences_new_artists RENAME TO idx_user_preferences_artists;
ALTER INDEX IF EXISTS idx_user_preferences_new_venues RENAME TO idx_user_preferences_venues;
ALTER INDEX IF EXISTS idx_user_preferences_new_notification_prefs RENAME TO idx_user_preferences_notification_prefs;
ALTER INDEX IF EXISTS idx_user_preferences_new_email_prefs RENAME TO idx_user_preferences_email_prefs;
ALTER INDEX IF EXISTS idx_user_preferences_new_privacy_settings RENAME TO idx_user_preferences_privacy_settings;
ALTER INDEX IF EXISTS idx_user_preferences_new_streaming_stats RENAME TO idx_user_preferences_streaming_stats;
ALTER INDEX IF EXISTS idx_user_preferences_new_achievements RENAME TO idx_user_preferences_achievements;
ALTER INDEX IF EXISTS idx_user_preferences_new_music_signals RENAME TO idx_user_preferences_music_signals;
ALTER INDEX IF EXISTS idx_user_preferences_new_recommendation_cache RENAME TO idx_user_preferences_recommendation_cache;

-- Update all triggers
DROP TRIGGER IF EXISTS update_user_preferences_new_updated_at ON public.user_preferences;
CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Update all RLS policies
DO $$
BEGIN
  -- Drop old policies
  DROP POLICY IF EXISTS "Users can view their own preferences" ON public.user_preferences;
  DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
  DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.user_preferences;
  
  -- Recreate policies with new names
  CREATE POLICY "Users can view their own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

  CREATE POLICY "Users can update their own preferences"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

  CREATE POLICY "Users can insert their own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);
END $$;

-- ============================================
-- 6.12 UPDATE FOREIGN KEY REFERENCES
-- ============================================

-- Update foreign key references in events table
-- Note: This may require dropping and recreating foreign keys
-- Update events.artist_uuid to reference artists.id
-- Update events.venue_uuid to reference venues.id
-- Update events.created_by_user_id to reference users.user_id

-- Update foreign key references in reviews table
-- Note: This may require dropping and recreating foreign keys
-- Update reviews.user_id to reference users.user_id
-- Update reviews.event_id to reference events.id
-- Update reviews.artist_id to reference artists.id
-- Update reviews.venue_id to reference venues.id

-- Update foreign key references in comments table
-- Note: This may require dropping and recreating foreign keys
-- Update comments.user_id to reference users.user_id
-- Update comments.parent_comment_id to reference comments.id

-- Update foreign key references in engagements table
-- Note: This may require dropping and recreating foreign keys
-- Update engagements.user_id to reference users.user_id

-- Update foreign key references in relationships table
-- Note: This may require dropping and recreating foreign keys
-- Update relationships.user_id to reference users.user_id

-- Update foreign key references in interactions table
-- Note: This may require dropping and recreating foreign keys
-- Update interactions.user_id to reference users.user_id

-- Update foreign key references in user_preferences table
-- Note: This may require dropping and recreating foreign keys
-- Update user_preferences.user_id to reference users.user_id

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify all tables renamed
SELECT 
  'Tables renamed to final names' as status,
  COUNT(*) as table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users',
    'events',
    'artists',
    'venues',
    'relationships',
    'reviews',
    'comments',
    'engagements',
    'interactions',
    'analytics_daily',
    'user_preferences'
  );

-- Verify old tables renamed for backup
SELECT 
  'Old tables renamed for backup' as status,
  COUNT(*) as old_table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%_old';

