-- Add trigram index for efficient ILIKE queries on artists.name
-- This enables fast text search with wildcards (e.g., %query%)

BEGIN;

-- Enable pg_trgm extension if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Create GIN trigram index on artists.name for efficient ILIKE queries
-- This index supports pattern matching with leading/trailing wildcards
CREATE INDEX IF NOT EXISTS idx_artists_name_trgm 
  ON public.artists 
  USING gin(name gin_trgm_ops);

-- Add comment explaining the index
COMMENT ON INDEX idx_artists_name_trgm IS 
  'GIN trigram index for efficient ILIKE pattern matching on artist names (supports %query% patterns)';

COMMIT;

