-- ============================================================
-- DISABLE AUTOMATIC CREATION OF missing_entity_requests ON REVIEW CREATION
-- ============================================================
-- This migration disables any logic that automatically creates rows
-- in missing_entity_requests when a review is created.
--
-- Users should manually submit requests via MissingEntityRequestService
-- instead of having them automatically created.

BEGIN;

-- Drop any triggers that might automatically create missing_entity_requests
-- when reviews are inserted/updated

-- Check and drop trigger if it exists on reviews table
DROP TRIGGER IF EXISTS trigger_auto_create_missing_entity_requests_on_review ON public.reviews;
DROP TRIGGER IF EXISTS trigger_create_missing_entity_requests_on_review ON public.reviews;
DROP TRIGGER IF EXISTS auto_create_missing_entity_requests_trigger ON public.reviews;

-- Drop any function that creates missing_entity_requests automatically
DROP FUNCTION IF EXISTS public.auto_create_missing_entity_requests_on_review() CASCADE;
DROP FUNCTION IF EXISTS public.create_missing_entity_requests_on_review() CASCADE;

-- If the logic is in one of the existing trigger functions (like auto_populate_review_artist_id),
-- we need to ensure they don't create missing_entity_requests
-- These functions have been checked and don't appear to create missing_entity_requests,
-- but we'll document this here for clarity

-- Note: The auto_populate_review_artist_id() and auto_populate_review_venue_id() functions
-- do NOT create missing_entity_requests - they only populate IDs from existing events.
-- If there was logic added elsewhere to create requests when entities are missing,
-- it should be removed manually or identified and disabled here.

COMMENT ON TABLE public.missing_entity_requests IS 
  'Stores user requests for missing artists, venues, or events. These are reviewed by admins before being added to the database. Requests must be submitted MANUALLY by users - they are NOT automatically created when reviews are posted.';

COMMIT;

