-- Add missing setlist fields to jambase_events table
-- These fields are needed for proper setlist data management

-- Add setlist enrichment fields
ALTER TABLE public.jambase_events 
ADD COLUMN IF NOT EXISTS setlist_fm_id TEXT,
ADD COLUMN IF NOT EXISTS setlist_fm_url TEXT,
ADD COLUMN IF NOT EXISTS setlist_source TEXT,
ADD COLUMN IF NOT EXISTS setlist_enriched BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS setlist_song_count INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS setlist_last_updated TIMESTAMPTZ;

-- Add comments to document the new fields
COMMENT ON COLUMN public.jambase_events.setlist_fm_id IS 'Setlist.fm ID for the setlist';
COMMENT ON COLUMN public.jambase_events.setlist_fm_url IS 'URL to view the setlist on setlist.fm';
COMMENT ON COLUMN public.jambase_events.setlist_source IS 'Source of the setlist data (e.g., setlist.fm, user_import)';
COMMENT ON COLUMN public.jambase_events.setlist_enriched IS 'Whether this event has been processed for setlist enrichment';
COMMENT ON COLUMN public.jambase_events.setlist_song_count IS 'Number of songs in the setlist';
COMMENT ON COLUMN public.jambase_events.setlist_last_updated IS 'When the setlist data was last updated';

-- Create indexes for setlist queries
CREATE INDEX IF NOT EXISTS idx_jambase_events_setlist_enriched ON public.jambase_events(setlist_enriched);
CREATE INDEX IF NOT EXISTS idx_jambase_events_setlist_fm_id ON public.jambase_events(setlist_fm_id);
CREATE INDEX IF NOT EXISTS idx_jambase_events_setlist_song_count ON public.jambase_events(setlist_song_count);
