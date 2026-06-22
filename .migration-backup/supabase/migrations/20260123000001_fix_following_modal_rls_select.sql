-- ============================================================
-- FIX: Following modal shows 0 for artists/venues when viewing a friend's profile
-- ============================================================
-- The Following modal fetches artist_follows, user_venue_relationships, and
-- user_relationships (type=follow) for the profile's userId. RLS was restricting
-- SELECT to only the current user's rows (auth.uid() = user_id), so when
-- viewing a friend's profile we got 0 results.
--
-- Fix: Add permissive SELECT policies so anyone can read follow data for
-- profile viewing. Following lists are treated as public.
-- ============================================================

-- artist_follows: allow any authenticated user to read (for viewing others' Following)
DROP POLICY IF EXISTS "Allow view artist follows for profile" ON public.artist_follows;
CREATE POLICY "Allow view artist follows for profile"
  ON public.artist_follows
  FOR SELECT
  TO authenticated
  USING (true);

-- user_venue_relationships: allow any authenticated user to read (for viewing others' Following)
DROP POLICY IF EXISTS "Allow view venue follows for profile" ON public.user_venue_relationships;
CREATE POLICY "Allow view venue follows for profile"
  ON public.user_venue_relationships
  FOR SELECT
  TO authenticated
  USING (true);

-- user_relationships: allow reading rows where relationship_type = 'follow' (user follow, not friend/match/block)
-- so the Following > Users tab can show who a profile follows
DROP POLICY IF EXISTS "Allow view follow relationships for profile" ON public.user_relationships;
CREATE POLICY "Allow view follow relationships for profile"
  ON public.user_relationships
  FOR SELECT
  TO authenticated
  USING (relationship_type = 'follow');
