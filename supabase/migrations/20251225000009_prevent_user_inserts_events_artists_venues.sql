-- ============================================================
-- Prevent users from directly inserting into events, artists, venues tables
-- ============================================================
-- Users must submit requests via missing_entity_requests table instead

-- Revoke INSERT permissions from authenticated users on events table
REVOKE INSERT ON public.events FROM authenticated;

-- Revoke INSERT permissions from authenticated users on artists table
REVOKE INSERT ON public.artists FROM authenticated;

-- Revoke INSERT permissions from authenticated users on venues table
REVOKE INSERT ON public.venues FROM authenticated;

-- Note: Only service role (backend) and admins should be able to insert
-- Admins can still insert via service role or direct database access
-- Regular users must use the missing_entity_requests workflow

-- Add comment
COMMENT ON TABLE public.events IS 'Events table - users cannot directly insert. They must submit requests via missing_entity_requests table.';
COMMENT ON TABLE public.artists IS 'Artists table - users cannot directly insert. They must submit requests via missing_entity_requests table.';
COMMENT ON TABLE public.venues IS 'Venues table - users cannot directly insert. They must submit requests via missing_entity_requests table.';



