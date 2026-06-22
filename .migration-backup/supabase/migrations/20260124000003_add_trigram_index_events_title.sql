-- ============================================
-- ADD TRIGRAM INDEX FOR EVENTS.TITLE
-- ============================================
-- Fixes timeout errors (57014) when searching events by title
-- Uses pg_trgm extension (already enabled) to create GIN index
-- for efficient ILIKE pattern matching on event titles
-- ============================================

BEGIN;

-- Ensure pg_trgm extension is enabled (should already be enabled from artists/venues migrations)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN trigram index on events.title for efficient ILIKE queries
-- This index supports both prefix matches (title%) and wildcard matches (%title%)
CREATE INDEX IF NOT EXISTS idx_events_title_trigram 
  ON public.events 
  USING GIN (title gin_trgm_ops);

-- Add comment
COMMENT ON INDEX idx_events_title_trigram IS 
  'GIN trigram index for efficient ILIKE pattern matching on event titles (supports %query% patterns)';

COMMIT;
