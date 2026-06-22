-- ============================================
-- Add last_modified_at column to events table
-- This column stores the dateModified value from Jambase API
-- Used for incremental sync tracking
-- ============================================

-- Add last_modified_at column
ALTER TABLE public.events
ADD COLUMN IF NOT EXISTS last_modified_at TIMESTAMPTZ;

-- Create index for efficient incremental sync queries
CREATE INDEX IF NOT EXISTS idx_events_last_modified_at 
ON public.events(last_modified_at DESC) 
TABLESPACE pg_default;

-- Add comment
COMMENT ON COLUMN public.events.last_modified_at IS 
'Timestamp when this event was last modified in Jambase (from API dateModified field). Used for incremental sync.';

-- Note: This column is populated by the sync script from Jambase API's dateModified field.
-- It is NOT auto-updated by triggers - only updated during sync operations.

