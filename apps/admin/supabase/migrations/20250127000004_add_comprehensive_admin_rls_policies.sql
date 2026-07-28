-- Comprehensive Admin RLS Policies for Analytics Dashboard
-- This migration ensures admins can access all tables needed for analytics and moderation

-- Reviews table admin policy
DROP POLICY IF EXISTS "Admins can view all reviews" ON public.reviews;
CREATE POLICY "Admins can view all reviews"
  ON public.reviews
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- User Event Relationships admin policy
DROP POLICY IF EXISTS "Admins can view all user_event_relationships" ON public.user_event_relationships;
CREATE POLICY "Admins can view all user_event_relationships"
  ON public.user_event_relationships
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- Messages admin policy
DROP POLICY IF EXISTS "Admins can view all messages" ON public.messages;
CREATE POLICY "Admins can view all messages"
  ON public.messages
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- Comments admin policy
DROP POLICY IF EXISTS "Admins can view all comments" ON public.comments;
CREATE POLICY "Admins can view all comments"
  ON public.comments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- Engagements admin policy
DROP POLICY IF EXISTS "Admins can view all engagements" ON public.engagements;
CREATE POLICY "Admins can view all engagements"
  ON public.engagements
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- User Relationships admin policy
DROP POLICY IF EXISTS "Admins can view all user_relationships" ON public.user_relationships;
CREATE POLICY "Admins can view all user_relationships"
  ON public.user_relationships
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- Events admin policy (for events table)
DROP POLICY IF EXISTS "Admins can view all events" ON public.events;
CREATE POLICY "Admins can view all events"
  ON public.events
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- Artists admin policy (for UPDATE/DELETE operations, SELECT is already public)
DROP POLICY IF EXISTS "Admins can update all artists" ON public.artists;
CREATE POLICY "Admins can update all artists"
  ON public.artists
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete all artists" ON public.artists;
CREATE POLICY "Admins can delete all artists"
  ON public.artists
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- Venues admin policy (for UPDATE/DELETE operations, SELECT is already public)
DROP POLICY IF EXISTS "Admins can update all venues" ON public.venues;
CREATE POLICY "Admins can update all venues"
  ON public.venues
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

DROP POLICY IF EXISTS "Admins can delete all venues" ON public.venues;
CREATE POLICY "Admins can delete all venues"
  ON public.venues
  FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- Ensure RLS is enabled on all tables
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_event_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.engagements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venues ENABLE ROW LEVEL SECURITY;
