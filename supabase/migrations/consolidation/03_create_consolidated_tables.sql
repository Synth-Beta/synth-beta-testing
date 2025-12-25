-- ============================================
-- DATABASE CONSOLIDATION: PHASE 2 - CREATE CONSOLIDATED TABLES
-- ============================================
-- This migration creates the 15 consolidated tables with proper 3NF structure
-- Run this AFTER Phase 1 (audit) is complete
-- These tables are created alongside existing tables - no data loss

-- ============================================
-- 1. USERS TABLE (from profiles)
-- ============================================

-- Create users table (consolidated from profiles)
-- Using temporary name during migration
CREATE TABLE IF NOT EXISTS public.users_new (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar_url TEXT,
  bio TEXT,
  instagram_handle TEXT,
  music_streaming_profile TEXT,
  gender TEXT,
  birthday DATE,
  account_type account_type DEFAULT 'user' NOT NULL,
  verified BOOLEAN DEFAULT false,
  verification_level verification_level DEFAULT 'none',
  subscription_tier subscription_tier DEFAULT 'free',
  subscription_expires_at TIMESTAMPTZ,
  subscription_started_at TIMESTAMPTZ,
  business_info JSONB DEFAULT '{}',
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  is_public_profile BOOLEAN DEFAULT true,
  similar_users_notifications BOOLEAN DEFAULT false,
  trust_score NUMERIC,
  moderation_status TEXT DEFAULT 'good_standing' CHECK (moderation_status IN ('good_standing', 'warned', 'restricted', 'suspended', 'banned')),
  warning_count INTEGER DEFAULT 0,
  last_warned_at TIMESTAMPTZ,
  suspended_until TIMESTAMPTZ,
  ban_reason TEXT,
  last_active_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for users
CREATE INDEX IF NOT EXISTS idx_users_new_user_id ON public.users_new(user_id);
CREATE INDEX IF NOT EXISTS idx_users_new_account_type ON public.users_new(account_type);
CREATE INDEX IF NOT EXISTS idx_users_new_verified ON public.users_new(verified);
CREATE INDEX IF NOT EXISTS idx_users_new_verification_level ON public.users_new(verification_level);
CREATE INDEX IF NOT EXISTS idx_users_new_subscription_tier ON public.users_new(subscription_tier);
CREATE INDEX IF NOT EXISTS idx_users_new_subscription_expires ON public.users_new(subscription_expires_at);
CREATE INDEX IF NOT EXISTS idx_users_new_business_info ON public.users_new USING GIN(business_info);
CREATE INDEX IF NOT EXISTS idx_users_new_moderation_status ON public.users_new(moderation_status);
CREATE INDEX IF NOT EXISTS idx_users_new_last_active ON public.users_new(last_active_at);

-- Enable RLS on users
ALTER TABLE public.users_new ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. EVENTS TABLE (from jambase_events + promotions)
-- ============================================

-- Create events table (consolidated from jambase_events + promotion fields)
-- Using temporary name during migration
CREATE TABLE IF NOT EXISTS public.events_new (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jambase_event_id TEXT UNIQUE,
  ticketmaster_event_id TEXT UNIQUE,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  artist_id TEXT,
  artist_uuid UUID, -- Foreign key will be added after artists_new is created
  venue_name TEXT NOT NULL,
  venue_id TEXT,
  venue_uuid UUID, -- Foreign key will be added after venues_new is created
  event_date TIMESTAMPTZ NOT NULL,
  doors_time TIMESTAMPTZ,
  description TEXT,
  genres TEXT[],
  venue_address TEXT,
  venue_city TEXT,
  venue_state TEXT,
  venue_zip TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  ticket_available BOOLEAN DEFAULT false,
  price_range TEXT,
  price_min DECIMAL(10,2),
  price_max DECIMAL(10,2),
  price_currency TEXT DEFAULT 'USD',
  ticket_urls TEXT[],
  external_url TEXT,
  setlist JSONB,
  tour_name TEXT,
  source TEXT DEFAULT 'jambase' CHECK (source IN ('jambase', 'ticketmaster', 'manual')),
  event_status TEXT,
  classifications JSONB,
  sales_info JSONB,
  attraction_ids TEXT[],
  venue_timezone TEXT,
  images JSONB,
  is_user_created BOOLEAN DEFAULT false,
  -- Promotion fields
  is_promoted BOOLEAN DEFAULT false,
  promotion_tier TEXT CHECK (promotion_tier IN ('basic', 'premium', 'featured')),
  promotion_start_date TIMESTAMPTZ,
  promotion_end_date TIMESTAMPTZ,
  is_featured BOOLEAN DEFAULT false,
  featured_until TIMESTAMPTZ,
  -- Ownership
  created_by_user_id UUID REFERENCES public.users_new(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for events
CREATE INDEX IF NOT EXISTS idx_events_new_jambase_event_id ON public.events_new(jambase_event_id);
CREATE INDEX IF NOT EXISTS idx_events_new_ticketmaster_event_id ON public.events_new(ticketmaster_event_id);
CREATE INDEX IF NOT EXISTS idx_events_new_artist_name ON public.events_new(artist_name);
CREATE INDEX IF NOT EXISTS idx_events_new_venue_name ON public.events_new(venue_name);
CREATE INDEX IF NOT EXISTS idx_events_new_event_date ON public.events_new(event_date);
CREATE INDEX IF NOT EXISTS idx_events_new_artist_uuid ON public.events_new(artist_uuid);
CREATE INDEX IF NOT EXISTS idx_events_new_venue_uuid ON public.events_new(venue_uuid);
CREATE INDEX IF NOT EXISTS idx_events_new_genres ON public.events_new USING GIN(genres);
CREATE INDEX IF NOT EXISTS idx_events_new_is_promoted ON public.events_new(is_promoted) WHERE is_promoted = true;
CREATE INDEX IF NOT EXISTS idx_events_new_promotion_dates ON public.events_new(promotion_start_date, promotion_end_date);
CREATE INDEX IF NOT EXISTS idx_events_new_created_by ON public.events_new(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_events_new_source ON public.events_new(source);

-- Enable RLS on events
ALTER TABLE public.events_new ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 3. ARTISTS TABLE (merge artists + artist_profile)
-- ============================================

-- Create consolidated artists table (temporary name during migration)
CREATE TABLE IF NOT EXISTS public.artists_new (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jambase_artist_id TEXT UNIQUE NOT NULL,
  artist_data_source TEXT NOT NULL DEFAULT 'jambase',
  name TEXT NOT NULL,
  identifier TEXT UNIQUE NOT NULL,
  url TEXT,
  image_url TEXT,
  date_published TIMESTAMPTZ,
  date_modified TIMESTAMPTZ,
  artist_type TEXT CHECK (artist_type IN ('MusicGroup', 'Person')),
  band_or_musician TEXT CHECK (band_or_musician IN ('band', 'musician')),
  founding_location TEXT,
  founding_date TEXT,
  genres TEXT[],
  members JSONB,
  member_of JSONB,
  external_identifiers JSONB,
  same_as JSONB,
  num_upcoming_events INTEGER DEFAULT 0,
  raw_jambase_data JSONB,
  -- Ownership fields
  owner_user_id UUID REFERENCES public.users_new(user_id) ON DELETE SET NULL,
  verified BOOLEAN DEFAULT false,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ,
  -- Constraints
  CONSTRAINT valid_artist_data_source CHECK (artist_data_source IN (
    'axs', 'dice', 'etix', 'eventbrite', 'eventim-de', 'jambase', 
    'seated', 'seatgeek', 'spotify', 'ticketmaster', 'viagogo', 'musicbrainz'
  ))
);

-- Create indexes for artists
CREATE INDEX IF NOT EXISTS idx_artists_new_jambase_id ON public.artists_new(jambase_artist_id);
CREATE INDEX IF NOT EXISTS idx_artists_new_identifier ON public.artists_new(identifier);
CREATE INDEX IF NOT EXISTS idx_artists_new_name ON public.artists_new(name);
CREATE INDEX IF NOT EXISTS idx_artists_new_artist_type ON public.artists_new(artist_type);
CREATE INDEX IF NOT EXISTS idx_artists_new_band_or_musician ON public.artists_new(band_or_musician);
CREATE INDEX IF NOT EXISTS idx_artists_new_genres ON public.artists_new USING GIN(genres);
CREATE INDEX IF NOT EXISTS idx_artists_new_external_identifiers ON public.artists_new USING GIN(external_identifiers);
CREATE INDEX IF NOT EXISTS idx_artists_new_same_as ON public.artists_new USING GIN(same_as);
CREATE INDEX IF NOT EXISTS idx_artists_new_owner ON public.artists_new(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_artists_new_verified ON public.artists_new(verified);

-- Enable RLS on artists
ALTER TABLE public.artists_new ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 4. VENUES TABLE (merge venues + venue_profile)
-- ============================================

-- Create consolidated venues table (temporary name during migration)
CREATE TABLE IF NOT EXISTS public.venues_new (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jambase_venue_id TEXT,
  name TEXT NOT NULL,
  identifier TEXT,
  address JSONB,
  geo JSONB,
  maximum_attendee_capacity INTEGER,
  num_upcoming_events INTEGER DEFAULT 0,
  image_url TEXT,
  url TEXT,
  same_as TEXT[],
  date_published TIMESTAMPTZ,
  date_modified TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  -- Ownership fields
  owner_user_id UUID REFERENCES public.users_new(user_id) ON DELETE SET NULL,
  verified BOOLEAN DEFAULT false,
  claimed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for venues
CREATE INDEX IF NOT EXISTS idx_venues_new_jambase_id ON public.venues_new(jambase_venue_id);
CREATE INDEX IF NOT EXISTS idx_venues_new_name ON public.venues_new(name);
CREATE INDEX IF NOT EXISTS idx_venues_new_identifier ON public.venues_new(identifier);
CREATE INDEX IF NOT EXISTS idx_venues_new_address ON public.venues_new USING GIN(address);
CREATE INDEX IF NOT EXISTS idx_venues_new_geo ON public.venues_new USING GIN(geo);
CREATE INDEX IF NOT EXISTS idx_venues_new_same_as ON public.venues_new USING GIN(same_as);
CREATE INDEX IF NOT EXISTS idx_venues_new_owner ON public.venues_new(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_venues_new_verified ON public.venues_new(verified);
CREATE INDEX IF NOT EXISTS idx_venues_new_last_synced ON public.venues_new(last_synced_at);

-- Enable RLS on venues
ALTER TABLE public.venues_new ENABLE ROW LEVEL SECURITY;

-- ============================================
-- ADD FOREIGN KEY CONSTRAINTS (after all tables created)
-- ============================================

-- Add foreign key constraints for events_new
ALTER TABLE public.events_new
  ADD CONSTRAINT fk_events_new_artist_uuid 
  FOREIGN KEY (artist_uuid) 
  REFERENCES public.artists_new(id) 
  ON DELETE SET NULL;

ALTER TABLE public.events_new
  ADD CONSTRAINT fk_events_new_venue_uuid 
  FOREIGN KEY (venue_uuid) 
  REFERENCES public.venues_new(id) 
  ON DELETE SET NULL;

-- ============================================
-- 5. RELATIONSHIPS TABLE (unified relationship table)
-- ============================================

-- Create unified relationships table
-- Using temporary name during migration
CREATE TABLE IF NOT EXISTS public.relationships_new (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users_new(user_id) ON DELETE CASCADE,
  related_entity_type TEXT NOT NULL CHECK (related_entity_type IN ('user', 'artist', 'venue', 'event')),
  related_entity_id TEXT NOT NULL, -- Can be UUID or text (for venue names)
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('follow', 'interest', 'friend', 'match', 'block', 'going', 'maybe', 'not_going')),
  status TEXT CHECK (status IN ('pending', 'accepted', 'declined')),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, related_entity_type, related_entity_id, relationship_type)
);

-- Create indexes for relationships
CREATE INDEX IF NOT EXISTS idx_relationships_new_user_id ON public.relationships_new(user_id);
CREATE INDEX IF NOT EXISTS idx_relationships_new_entity_type ON public.relationships_new(related_entity_type);
CREATE INDEX IF NOT EXISTS idx_relationships_new_entity_id ON public.relationships_new(related_entity_id);
CREATE INDEX IF NOT EXISTS idx_relationships_new_type ON public.relationships_new(relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_new_status ON public.relationships_new(status);
CREATE INDEX IF NOT EXISTS idx_relationships_new_metadata ON public.relationships_new USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_relationships_new_user_entity ON public.relationships_new(user_id, related_entity_type, relationship_type);
CREATE INDEX IF NOT EXISTS idx_relationships_new_created_at ON public.relationships_new(created_at DESC);

-- Enable RLS on relationships
ALTER TABLE public.relationships_new ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 6. REVIEWS TABLE (from user_reviews)
-- ============================================

-- Create reviews table (consolidated from user_reviews)
-- Using temporary name during migration
CREATE TABLE IF NOT EXISTS public.reviews_new (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users_new(user_id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events_new(id) ON DELETE CASCADE,
  artist_id UUID REFERENCES public.artists_new(id) ON DELETE SET NULL,
  venue_id UUID REFERENCES public.venues_new(id) ON DELETE SET NULL,
  -- Core Rating & Reaction
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  artist_rating INTEGER CHECK (artist_rating >= 1 AND artist_rating <= 5),
  venue_rating INTEGER CHECK (venue_rating >= 1 AND venue_rating <= 5),
  performance_rating DECIMAL(2,1) CHECK (performance_rating >= 0.5 AND performance_rating <= 5.0),
  venue_rating_new DECIMAL(2,1) CHECK (venue_rating_new >= 0.5 AND venue_rating_new <= 5.0),
  overall_experience_rating DECIMAL(2,1) CHECK (overall_experience_rating >= 0.5 AND overall_experience_rating <= 5.0),
  reaction_emoji TEXT,
  review_text TEXT,
  performance_review_text TEXT,
  venue_review_text TEXT,
  overall_experience_review_text TEXT,
  -- Media
  photos TEXT[],
  videos TEXT[],
  -- Tags / Context
  mood_tags TEXT[],
  genre_tags TEXT[],
  context_tags TEXT[],
  venue_tags TEXT[],
  artist_tags TEXT[],
  review_type TEXT,
  -- Social / Engagement
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  -- Privacy & Metadata
  is_public BOOLEAN DEFAULT true,
  is_draft BOOLEAN DEFAULT false,
  attendees TEXT[],
  rank_order INTEGER,
  was_there BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, event_id)
);

-- Create indexes for reviews
CREATE INDEX IF NOT EXISTS idx_reviews_new_user_id ON public.reviews_new(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_new_event_id ON public.reviews_new(event_id);
CREATE INDEX IF NOT EXISTS idx_reviews_new_artist_id ON public.reviews_new(artist_id);
CREATE INDEX IF NOT EXISTS idx_reviews_new_venue_id ON public.reviews_new(venue_id);
CREATE INDEX IF NOT EXISTS idx_reviews_new_rating ON public.reviews_new(rating);
CREATE INDEX IF NOT EXISTS idx_reviews_new_created_at ON public.reviews_new(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reviews_new_public ON public.reviews_new(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_reviews_new_draft ON public.reviews_new(is_draft) WHERE is_draft = false;
CREATE INDEX IF NOT EXISTS idx_reviews_new_mood_tags ON public.reviews_new USING GIN(mood_tags);
CREATE INDEX IF NOT EXISTS idx_reviews_new_genre_tags ON public.reviews_new USING GIN(genre_tags);
CREATE INDEX IF NOT EXISTS idx_reviews_new_photos ON public.reviews_new USING GIN(photos);

-- Enable RLS on reviews
ALTER TABLE public.reviews_new ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 7. COMMENTS TABLE (unified comments table)
-- ============================================

-- Create unified comments table
-- Using temporary name during migration
CREATE TABLE IF NOT EXISTS public.comments_new (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users_new(user_id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('review', 'event', 'artist', 'venue')),
  entity_id UUID NOT NULL,
  parent_comment_id UUID REFERENCES public.comments_new(id) ON DELETE SET NULL,
  comment_text TEXT NOT NULL,
  likes_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for comments
CREATE INDEX IF NOT EXISTS idx_comments_new_user_id ON public.comments_new(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_new_entity_type ON public.comments_new(entity_type);
CREATE INDEX IF NOT EXISTS idx_comments_new_entity_id ON public.comments_new(entity_id);
CREATE INDEX IF NOT EXISTS idx_comments_new_parent_id ON public.comments_new(parent_comment_id);
CREATE INDEX IF NOT EXISTS idx_comments_new_entity ON public.comments_new(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_comments_new_created_at ON public.comments_new(created_at DESC);

-- Enable RLS on comments
ALTER TABLE public.comments_new ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 8. ENGAGEMENTS TABLE (unified engagements table)
-- ============================================

-- Create unified engagements table
-- Using temporary name during migration
CREATE TABLE IF NOT EXISTS public.engagements_new (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.users_new(user_id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('review', 'event', 'comment', 'user')),
  entity_id UUID NOT NULL,
  engagement_type TEXT NOT NULL CHECK (engagement_type IN ('like', 'share', 'swipe')),
  engagement_value TEXT, -- 'left', 'right' for swipes; platform for shares
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, entity_type, entity_id, engagement_type)
);

-- Create indexes for engagements
CREATE INDEX IF NOT EXISTS idx_engagements_new_user_id ON public.engagements_new(user_id);
CREATE INDEX IF NOT EXISTS idx_engagements_new_entity_type ON public.engagements_new(entity_type);
CREATE INDEX IF NOT EXISTS idx_engagements_new_entity_id ON public.engagements_new(entity_id);
CREATE INDEX IF NOT EXISTS idx_engagements_new_type ON public.engagements_new(engagement_type);
CREATE INDEX IF NOT EXISTS idx_engagements_new_value ON public.engagements_new(engagement_value);
CREATE INDEX IF NOT EXISTS idx_engagements_new_metadata ON public.engagements_new USING GIN(metadata);
CREATE INDEX IF NOT EXISTS idx_engagements_new_entity ON public.engagements_new(entity_type, entity_id, engagement_type);
CREATE INDEX IF NOT EXISTS idx_engagements_new_created_at ON public.engagements_new(created_at DESC);

-- Enable RLS on engagements
ALTER TABLE public.engagements_new ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 9. CHATS TABLE (keep existing)
-- ============================================

-- Chats table already exists, no changes needed
-- Will verify structure matches requirements

-- ============================================
-- 10. MESSAGES TABLE (keep existing)
-- ============================================

-- Messages table already exists, no changes needed
-- Will verify structure matches requirements

-- ============================================
-- 11. NOTIFICATIONS TABLE (keep existing)
-- ============================================

-- Notifications table already exists, no changes needed
-- Will verify structure matches requirements

-- ============================================
-- 12. INTERACTIONS TABLE (rename user_interactions)
-- ============================================

-- Create interactions table (rename from user_interactions)
-- Using temporary name during migration
CREATE TABLE IF NOT EXISTS public.interactions_new (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users_new(user_id) ON DELETE CASCADE,
  identity_issuer TEXT,
  identity_sub TEXT,
  global_user_id TEXT,
  session_id UUID,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for interactions
CREATE INDEX IF NOT EXISTS idx_interactions_new_user_id ON public.interactions_new(user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_new_global_user_id ON public.interactions_new(global_user_id);
CREATE INDEX IF NOT EXISTS idx_interactions_new_session_id ON public.interactions_new(session_id);
CREATE INDEX IF NOT EXISTS idx_interactions_new_event_type ON public.interactions_new(event_type);
CREATE INDEX IF NOT EXISTS idx_interactions_new_entity_type ON public.interactions_new(entity_type);
CREATE INDEX IF NOT EXISTS idx_interactions_new_entity_id ON public.interactions_new(entity_id);
CREATE INDEX IF NOT EXISTS idx_interactions_new_occurred_at ON public.interactions_new(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_new_metadata ON public.interactions_new USING GIN(metadata);

-- Enable RLS on interactions
ALTER TABLE public.interactions_new ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 13. ANALYTICS_DAILY TABLE (unified analytics table)
-- ============================================

-- Create unified analytics_daily table
-- Using temporary name during migration
CREATE TABLE IF NOT EXISTS public.analytics_daily_new (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('user', 'event', 'artist', 'venue', 'campaign')),
  entity_id TEXT NOT NULL, -- UUID for users/events, TEXT for artists/venues, UUID for campaigns
  date DATE NOT NULL,
  metrics JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(entity_type, entity_id, date)
);

-- Create indexes for analytics_daily
CREATE INDEX IF NOT EXISTS idx_analytics_daily_new_entity_type ON public.analytics_daily_new(entity_type);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_new_entity_id ON public.analytics_daily_new(entity_id);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_new_date ON public.analytics_daily_new(date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_new_entity_date ON public.analytics_daily_new(entity_type, entity_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_daily_new_metrics ON public.analytics_daily_new USING GIN(metrics);

-- Enable RLS on analytics_daily
ALTER TABLE public.analytics_daily_new ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 14. USER_PREFERENCES TABLE (unified preferences table)
-- ============================================

-- Create unified user_preferences table
-- Using temporary name during migration
CREATE TABLE IF NOT EXISTS public.user_preferences_new (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE REFERENCES public.users_new(user_id) ON DELETE CASCADE,
  preferred_genres TEXT[],
  preferred_artists UUID[],
  preferred_venues TEXT[],
  notification_preferences JSONB DEFAULT '{}',
  email_preferences JSONB DEFAULT '{}',
  privacy_settings JSONB DEFAULT '{}',
  streaming_stats JSONB DEFAULT '{}',
  achievements JSONB DEFAULT '{}',
  music_preference_signals JSONB DEFAULT '{}',
  recommendation_cache JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for user_preferences
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_user_id ON public.user_preferences_new(user_id);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_genres ON public.user_preferences_new USING GIN(preferred_genres);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_artists ON public.user_preferences_new USING GIN(preferred_artists);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_venues ON public.user_preferences_new USING GIN(preferred_venues);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_notification_prefs ON public.user_preferences_new USING GIN(notification_preferences);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_email_prefs ON public.user_preferences_new USING GIN(email_preferences);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_privacy_settings ON public.user_preferences_new USING GIN(privacy_settings);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_streaming_stats ON public.user_preferences_new USING GIN(streaming_stats);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_achievements ON public.user_preferences_new USING GIN(achievements);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_music_signals ON public.user_preferences_new USING GIN(music_preference_signals);
CREATE INDEX IF NOT EXISTS idx_user_preferences_new_recommendation_cache ON public.user_preferences_new USING GIN(recommendation_cache);

-- Enable RLS on user_preferences
ALTER TABLE public.user_preferences_new ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 15. ACCOUNT_PERMISSIONS TABLE (keep existing)
-- ============================================

-- Account_permissions table already exists, no changes needed
-- Will verify structure matches requirements

-- ============================================
-- CREATE UPDATE TRIGGERS
-- ============================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_new_updated_at
  BEFORE UPDATE ON public.users_new
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_events_new_updated_at
  BEFORE UPDATE ON public.events_new
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_artists_new_updated_at
  BEFORE UPDATE ON public.artists_new
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_venues_new_updated_at
  BEFORE UPDATE ON public.venues_new
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_relationships_new_updated_at
  BEFORE UPDATE ON public.relationships_new
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_reviews_new_updated_at
  BEFORE UPDATE ON public.reviews_new
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_comments_new_updated_at
  BEFORE UPDATE ON public.comments_new
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_analytics_daily_new_updated_at
  BEFORE UPDATE ON public.analytics_daily_new
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_preferences_new_updated_at
  BEFORE UPDATE ON public.user_preferences_new
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- ADD COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE public.users_new IS 'Consolidated user profiles table (renamed from profiles) - temporary name during migration';
COMMENT ON TABLE public.events_new IS 'Consolidated events table (from jambase_events + promotion fields) - temporary name during migration';
COMMENT ON TABLE public.artists_new IS 'Consolidated artists table (merged from artists + artist_profile) - temporary name during migration';
COMMENT ON TABLE public.venues_new IS 'Consolidated venues table (merged from venues + venue_profile) - temporary name during migration';
COMMENT ON TABLE public.relationships_new IS 'Unified relationships table (follows, interests, friends, matches, blocks) - temporary name during migration';
COMMENT ON TABLE public.reviews_new IS 'Consolidated reviews table (renamed from user_reviews) - temporary name during migration';
COMMENT ON TABLE public.comments_new IS 'Unified comments table (event_comments + review_comments) - temporary name during migration';
COMMENT ON TABLE public.engagements_new IS 'Unified engagements table (likes, shares, swipes) - temporary name during migration';
COMMENT ON TABLE public.interactions_new IS 'Unified interactions table (renamed from user_interactions) - temporary name during migration';
COMMENT ON TABLE public.analytics_daily_new IS 'Unified analytics table (consolidated from all analytics_*_daily tables) - temporary name during migration';
COMMENT ON TABLE public.user_preferences_new IS 'Unified user preferences table (preferences + streaming + achievements) - temporary name during migration';

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify all tables were created
SELECT 
  'Consolidated tables created (temporary names during migration)' as status,
  COUNT(*) as table_count
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'users_new',
    'events_new',
    'artists_new',
    'venues_new',
    'relationships_new',
    'reviews_new',
    'comments_new',
    'engagements_new',
    'interactions_new',
    'analytics_daily_new',
    'user_preferences_new'
  );

