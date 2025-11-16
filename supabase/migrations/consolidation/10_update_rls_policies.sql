-- ============================================
-- DATABASE CONSOLIDATION: PHASE 4 - UPDATE RLS POLICIES
-- ============================================
-- This migration creates RLS policies for all consolidated tables
-- Run this AFTER Phase 3 (data migration) is complete

-- ============================================
-- 4.1 USERS_NEW RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view all public profiles" ON public.users_new;
DROP POLICY IF EXISTS "Users can view their own profile" ON public.users_new;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.users_new;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.users_new;

-- Create RLS policies for users_new
CREATE POLICY "Users can view all public profiles"
ON public.users_new FOR SELECT
USING (is_public_profile = true OR auth.uid() = user_id);

CREATE POLICY "Users can view their own profile"
ON public.users_new FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
ON public.users_new FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own profile"
ON public.users_new FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 4.2 EVENTS_NEW RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Events are viewable by everyone" ON public.events_new;
DROP POLICY IF EXISTS "Events can be created by authenticated users" ON public.events_new;
DROP POLICY IF EXISTS "Event owners can update their events" ON public.events_new;

-- Create RLS policies for events_new
CREATE POLICY "Events are viewable by everyone"
ON public.events_new FOR SELECT
USING (true);

CREATE POLICY "Events can be created by authenticated users"
ON public.events_new FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Event owners can update their events"
ON public.events_new FOR UPDATE
USING (created_by_user_id = auth.uid() OR EXISTS (
  SELECT 1 FROM public.users_new u
  WHERE u.user_id = auth.uid()
  AND u.account_type IN ('admin', 'business', 'creator') -- 'promoter' is now 'business' with business_info.entity_type = 'promoter'
));

-- ============================================
-- 4.3 ARTISTS_NEW RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Artists are viewable by everyone" ON public.artists_new;
DROP POLICY IF EXISTS "Artists can be created by authenticated users" ON public.artists_new;
DROP POLICY IF EXISTS "Artists can be updated by authenticated users" ON public.artists_new;
DROP POLICY IF EXISTS "Artists can be deleted by authenticated users" ON public.artists_new;

-- Create RLS policies for artists_new
CREATE POLICY "Artists are viewable by everyone"
ON public.artists_new FOR SELECT
USING (true);

CREATE POLICY "Artists can be created by authenticated users"
ON public.artists_new FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Artists can be updated by authenticated users"
ON public.artists_new FOR UPDATE
USING (auth.role() = 'authenticated');

CREATE POLICY "Artists can be deleted by authenticated users"
ON public.artists_new FOR DELETE
USING (auth.role() = 'authenticated');

-- ============================================
-- 4.4 VENUES_NEW RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Venues are viewable by everyone" ON public.venues_new;
DROP POLICY IF EXISTS "Venues can be created by authenticated users" ON public.venues_new;
DROP POLICY IF EXISTS "Venues can be updated by authenticated users" ON public.venues_new;

-- Create RLS policies for venues_new
CREATE POLICY "Venues are viewable by everyone"
ON public.venues_new FOR SELECT
USING (true);

CREATE POLICY "Venues can be created by authenticated users"
ON public.venues_new FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Venues can be updated by authenticated users"
ON public.venues_new FOR UPDATE
USING (auth.role() = 'authenticated');

-- ============================================
-- 4.5 RELATIONSHIPS_NEW RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own relationships" ON public.relationships_new;
DROP POLICY IF EXISTS "Users can create their own relationships" ON public.relationships_new;
DROP POLICY IF EXISTS "Users can update their own relationships" ON public.relationships_new;
DROP POLICY IF EXISTS "Users can delete their own relationships" ON public.relationships_new;

-- Create RLS policies for relationships_new
CREATE POLICY "Users can view their own relationships"
ON public.relationships_new FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own relationships"
ON public.relationships_new FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own relationships"
ON public.relationships_new FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own relationships"
ON public.relationships_new FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- 4.6 REVIEWS_NEW RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Public reviews are viewable by everyone" ON public.reviews_new;
DROP POLICY IF EXISTS "Users can view their own reviews" ON public.reviews_new;
DROP POLICY IF EXISTS "Users can create their own reviews" ON public.reviews_new;
DROP POLICY IF EXISTS "Users can update their own reviews" ON public.reviews_new;
DROP POLICY IF EXISTS "Users can delete their own reviews" ON public.reviews_new;

-- Create RLS policies for reviews_new
CREATE POLICY "Public reviews are viewable by everyone"
ON public.reviews_new FOR SELECT
USING (is_public = true);

CREATE POLICY "Users can view their own reviews"
ON public.reviews_new FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own reviews"
ON public.reviews_new FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own reviews"
ON public.reviews_new FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own reviews"
ON public.reviews_new FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- 4.7 COMMENTS_NEW RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.comments_new;
DROP POLICY IF EXISTS "Users can create their own comments" ON public.comments_new;
DROP POLICY IF EXISTS "Users can update their own comments" ON public.comments_new;
DROP POLICY IF EXISTS "Users can delete their own comments" ON public.comments_new;

-- Create RLS policies for comments_new
CREATE POLICY "Comments are viewable by everyone"
ON public.comments_new FOR SELECT
USING (true);

CREATE POLICY "Users can create their own comments"
ON public.comments_new FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own comments"
ON public.comments_new FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own comments"
ON public.comments_new FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- 4.8 ENGAGEMENTS_NEW RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Engagements are viewable by everyone" ON public.engagements_new;
DROP POLICY IF EXISTS "Users can create their own engagements" ON public.engagements_new;
DROP POLICY IF EXISTS "Users can delete their own engagements" ON public.engagements_new;

-- Create RLS policies for engagements_new
CREATE POLICY "Engagements are viewable by everyone"
ON public.engagements_new FOR SELECT
USING (true);

CREATE POLICY "Users can create their own engagements"
ON public.engagements_new FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own engagements"
ON public.engagements_new FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- 4.9 INTERACTIONS_NEW RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own interactions" ON public.interactions_new;
DROP POLICY IF EXISTS "Users can create their own interactions" ON public.interactions_new;

-- Create RLS policies for interactions_new
CREATE POLICY "Users can view their own interactions"
ON public.interactions_new FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own interactions"
ON public.interactions_new FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- ============================================
-- 4.10 ANALYTICS_DAILY_NEW RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own analytics" ON public.analytics_daily_new;
DROP POLICY IF EXISTS "Admins can view all analytics" ON public.analytics_daily_new;

-- Create RLS policies for analytics_daily_new
CREATE POLICY "Users can view their own analytics"
ON public.analytics_daily_new FOR SELECT
USING (
  (entity_type = 'user' AND entity_id = auth.uid()::TEXT)
  OR EXISTS (
    SELECT 1 FROM public.users_new u
    WHERE u.user_id = auth.uid()
    AND u.account_type IN ('admin', 'business', 'creator') -- 'promoter' is now 'business' with business_info.entity_type = 'promoter'
  )
);

CREATE POLICY "Admins can view all analytics"
ON public.analytics_daily_new FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.users_new u
    WHERE u.user_id = auth.uid()
    AND u.account_type = 'admin'
  )
);

-- ============================================
-- 4.11 USER_PREFERENCES_NEW RLS POLICIES
-- ============================================

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.user_preferences_new;
DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences_new;
DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.user_preferences_new;

-- Create RLS policies for user_preferences_new
CREATE POLICY "Users can view their own preferences"
ON public.user_preferences_new FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
ON public.user_preferences_new FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own preferences"
ON public.user_preferences_new FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify all RLS policies created
SELECT 
  'RLS policies created' as status,
  COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
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

