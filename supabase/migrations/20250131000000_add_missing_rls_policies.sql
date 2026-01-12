-- ============================================
-- ADD MISSING RLS POLICIES
-- ============================================
-- This migration adds RLS policies for tables that are missing them.
-- Based on security audit findings, these tables need proper RLS policies.
--
-- SECURITY PRINCIPLE: No user can extract private data belonging to other users
-- even if they manually craft requests. All policies enforce ownership or
-- public access only where appropriate.
--
-- Tables covered:
-- 1. artist_follows - User-artist follow relationships
-- 2. city_centers - Reference data for city filtering (public read)
-- 3. device_tokens - User device tokens for push notifications
-- 4. event_media - Media files associated with reviews/events
-- 5. external_entity_ids - Mapping table for external provider IDs
-- 6. push_notification_queue - Queue for push notifications (service role only)
-- 7. user_venue_relationships - User-venue relationship tracking
-- 8. notifications - User notifications (CRITICAL SECURITY FIX)
-- ============================================

-- ============================================
-- 1. ARTIST_FOLLOWS
-- ============================================
-- Enable RLS if not already enabled
ALTER TABLE public.artist_follows ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can view their own followed artists" ON public.artist_follows;
DROP POLICY IF EXISTS "Authenticated users can view all artist follows" ON public.artist_follows;
DROP POLICY IF EXISTS "Users can follow artists" ON public.artist_follows;
DROP POLICY IF EXISTS "Users can unfollow artists" ON public.artist_follows;

-- Policy: Users can only view their own follows (prevents scraping entire follow graph)
-- For follower counts, use a server function or materialized view instead
CREATE POLICY "Users can view their own follows"
ON public.artist_follows FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can create their own follows
CREATE POLICY "Users can follow artists"
ON public.artist_follows FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Policy: Users can delete their own follows
CREATE POLICY "Users can unfollow artists"
ON public.artist_follows FOR DELETE
USING (auth.uid() = user_id);

-- Policy: Users can update their own follows (if needed for metadata updates)
CREATE POLICY "Users can update their own follows"
ON public.artist_follows FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

COMMENT ON POLICY "Users can view their own follows" ON public.artist_follows IS 
  'Users can only view their own follows. Prevents scraping entire follow graph. Use server functions for aggregate counts.';

-- ============================================
-- 2. CITY_CENTERS
-- ============================================
-- Enable RLS if not already enabled
ALTER TABLE public.city_centers ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view city centers" ON public.city_centers;
DROP POLICY IF EXISTS "Service role can manage city centers" ON public.city_centers;

-- Policy: Public read access (reference data for filtering)
CREATE POLICY "Anyone can view city centers"
ON public.city_centers FOR SELECT
USING (true);

-- Policy: Only service role can modify (updated by sync jobs)
CREATE POLICY "Service role can manage city centers"
ON public.city_centers FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

COMMENT ON POLICY "Anyone can view city centers" ON public.city_centers IS 
  'Public read access for city filtering UI';

-- ============================================
-- 3. DEVICE_TOKENS
-- ============================================
-- Enable RLS if not already enabled
ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can manage own device tokens" ON public.device_tokens;
DROP POLICY IF EXISTS "Service role can manage device tokens" ON public.device_tokens;

-- Policy: Users can manage their own device tokens
CREATE POLICY "Users can manage own device tokens"
ON public.device_tokens FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Service role can manage all device tokens (for push notifications)
CREATE POLICY "Service role can manage device tokens"
ON public.device_tokens FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

COMMENT ON POLICY "Users can manage own device tokens" ON public.device_tokens IS 
  'Users can register/unregister their own device tokens for push notifications';

-- ============================================
-- 4. EVENT_MEDIA
-- ============================================
-- Enable RLS if not already enabled
ALTER TABLE public.event_media ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view event media" ON public.event_media;
DROP POLICY IF EXISTS "Review owners can manage their media" ON public.event_media;
DROP POLICY IF EXISTS "Service role can manage event media" ON public.event_media;

-- Policy: Only view media from public reviews (prevents accessing private review media)
CREATE POLICY "Anyone can view public review media"
ON public.event_media FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.id = event_media.review_id
    AND r.is_public = true
  )
);

-- Policy: Review owners can manage their media (via review relationship)
-- Users can insert/update/delete media associated with their reviews
CREATE POLICY "Review owners can manage their media"
ON public.event_media FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.id = event_media.review_id
    AND r.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.id = event_media.review_id
    AND r.user_id = auth.uid()
  )
);

-- Policy: Service role can manage all media (for sync operations)
CREATE POLICY "Service role can manage event media"
ON public.event_media FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

COMMENT ON POLICY "Anyone can view public review media" ON public.event_media IS 
  'Only allows viewing media from public reviews. Private review media is protected.';

-- ============================================
-- 5. EXTERNAL_ENTITY_IDS
-- ============================================
-- Enable RLS if not already enabled
ALTER TABLE public.external_entity_ids ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Anyone can view external entity IDs" ON public.external_entity_ids;
DROP POLICY IF EXISTS "Service role can manage external entity IDs" ON public.external_entity_ids;

-- Policy: Public read access (mapping data for lookups)
CREATE POLICY "Anyone can view external entity IDs"
ON public.external_entity_ids FOR SELECT
USING (true);

-- Policy: Only service role can modify (updated by sync jobs)
CREATE POLICY "Service role can manage external entity IDs"
ON public.external_entity_ids FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

COMMENT ON POLICY "Anyone can view external entity IDs" ON public.external_entity_ids IS 
  'Public read access for external ID lookups (JamBase, Ticketmaster, etc.)';

-- ============================================
-- 6. PUSH_NOTIFICATION_QUEUE
-- ============================================
-- Enable RLS if not already enabled
ALTER TABLE public.push_notification_queue ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Service role can manage push queue" ON public.push_notification_queue;

-- Policy: Only service role can access (backend queue management)
CREATE POLICY "Service role can manage push queue"
ON public.push_notification_queue FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

COMMENT ON POLICY "Service role can manage push queue" ON public.push_notification_queue IS 
  'Backend-only access for push notification queue processing';

-- ============================================
-- 7. USER_VENUE_RELATIONSHIPS (or VENUE_FOLLOWS)
-- ============================================
-- Check if user_venue_relationships exists, otherwise use venue_follows
DO $$
BEGIN
  -- Try user_venue_relationships first
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'user_venue_relationships') THEN
    -- Enable RLS if not already enabled
    ALTER TABLE public.user_venue_relationships ENABLE ROW LEVEL SECURITY;

    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Authenticated users can view venue relationships" ON public.user_venue_relationships;
    DROP POLICY IF EXISTS "Users can manage their own venue relationships" ON public.user_venue_relationships;

    -- Policy: Users can only view their own venue relationships (prevents scraping)
    CREATE POLICY "Users can view their own venue relationships"
    ON public.user_venue_relationships FOR SELECT
    USING (auth.uid() = user_id);

    -- Policy: Users can insert their own venue relationships
    CREATE POLICY "Users can insert their own venue relationships"
    ON public.user_venue_relationships FOR INSERT
    WITH CHECK (auth.uid() = user_id);

    -- Policy: Users can update their own venue relationships
    CREATE POLICY "Users can update their own venue relationships"
    ON public.user_venue_relationships FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

    -- Policy: Users can delete their own venue relationships
    CREATE POLICY "Users can delete their own venue relationships"
    ON public.user_venue_relationships FOR DELETE
    USING (auth.uid() = user_id);

    COMMENT ON POLICY "Users can view their own venue relationships" ON public.user_venue_relationships IS 
      'Users can only view their own venue relationships. Prevents scraping. Use server functions for aggregate counts.';
  END IF;
END $$;

-- Also ensure venue_follows has proper RLS (if it exists and needs updating)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'venue_follows') THEN
    -- Enable RLS if not already enabled
    ALTER TABLE public.venue_follows ENABLE ROW LEVEL SECURITY;

    -- Drop the restrictive policy if it exists and create a more permissive one
    DROP POLICY IF EXISTS "Users can view their own followed venues" ON public.venue_follows;
    DROP POLICY IF EXISTS "Authenticated users can view all venue follows" ON public.venue_follows;

    -- Policy: Users can only view their own venue follows (prevents scraping)
    CREATE POLICY "Users can view their own venue follows"
    ON public.venue_follows FOR SELECT
    USING (auth.uid() = user_id);

    -- Ensure insert/delete policies exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'venue_follows' 
      AND policyname = 'Users can follow venues'
    ) THEN
      CREATE POLICY "Users can follow venues" 
      ON public.venue_follows 
      FOR INSERT 
      WITH CHECK (auth.uid() = user_id);
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
      AND tablename = 'venue_follows' 
      AND policyname = 'Users can unfollow venues'
    ) THEN
      CREATE POLICY "Users can unfollow venues" 
      ON public.venue_follows 
      FOR DELETE 
      USING (auth.uid() = user_id);
    END IF;

    COMMENT ON POLICY "Users can view their own venue follows" ON public.venue_follows IS 
      'Users can only view their own venue follows. Prevents scraping. Use server functions for aggregate counts.';
  END IF;
END $$;

-- ============================================
-- 8. NOTIFICATIONS (CRITICAL SECURITY FIX)
-- ============================================
-- Enable RLS if not already enabled
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Users can insert their own notifications" ON public.notifications;
DROP POLICY IF EXISTS "Service role manages notifications" ON public.notifications;

-- Policy: Users can only read their own notifications
CREATE POLICY "Users read own notifications"
ON public.notifications FOR SELECT
USING (auth.uid() = user_id);

-- Policy: Users can update their own notifications (e.g., mark as read)
CREATE POLICY "Users update own notifications"
ON public.notifications FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Policy: Users cannot insert their own notifications (only service role creates them)
-- This prevents users from creating fake notifications
-- If you need users to create notifications, add a separate policy with proper validation

-- Policy: Service role can manage all notifications (for creating notifications via triggers/functions)
CREATE POLICY "Service role manages notifications"
ON public.notifications FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

COMMENT ON POLICY "Users read own notifications" ON public.notifications IS 
  'CRITICAL: Users can only read their own notifications. Prevents unauthorized access to private notification data.';
COMMENT ON POLICY "Service role manages notifications" ON public.notifications IS 
  'Service role can create/update/delete notifications via triggers and functions.';

-- ============================================
-- VERIFICATION
-- ============================================
-- Run these queries to verify RLS is enabled and policies exist:

-- Check RLS status:
-- SELECT tablename, rowsecurity 
-- FROM pg_tables 
-- WHERE schemaname = 'public' 
-- AND tablename IN ('artist_follows', 'city_centers', 'device_tokens', 'event_media', 'external_entity_ids', 'push_notification_queue', 'user_venue_relationships', 'venue_follows', 'notifications')
-- ORDER BY tablename;

-- Check policy count:
-- SELECT tablename, COUNT(*) as policy_count
-- FROM pg_policies
-- WHERE schemaname = 'public'
-- AND tablename IN ('artist_follows', 'city_centers', 'device_tokens', 'event_media', 'external_entity_ids', 'push_notification_queue', 'user_venue_relationships', 'venue_follows', 'notifications')
-- GROUP BY tablename
-- ORDER BY tablename;

-- Verify notifications RLS is secure:
-- SELECT policyname, cmd, qual 
-- FROM pg_policies 
-- WHERE schemaname = 'public' AND tablename = 'notifications';

