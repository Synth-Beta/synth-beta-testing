-- Add trigram index for efficient ILIKE queries on venues.name
-- This enables fast text search with wildcards (e.g., %query%)

BEGIN;

-- Ensure pg_trgm extension is enabled (should already be enabled from artists migration)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN trigram index on venues.name for efficient ILIKE queries
-- This index supports pattern matching with leading/trailing wildcards
CREATE INDEX IF NOT EXISTS idx_venues_name_trgm 
  ON public.venues 
  USING gin(name gin_trgm_ops);

-- Add comment explaining the index
COMMENT ON INDEX idx_venues_name_trgm IS 
  'GIN trigram index for efficient ILIKE pattern matching on venue names (supports %query% patterns)';

COMMIT;

