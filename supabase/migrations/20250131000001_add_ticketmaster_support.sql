-- Add Ticketmaster support to jambase_events table
-- This migration adds fields for Ticketmaster events while maintaining backward compatibility

-- Internal tracking only (never displayed in UI)
ALTER TABLE jambase_events ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'jambase';
ALTER TABLE jambase_events ADD CONSTRAINT check_source CHECK (source IN ('jambase', 'ticketmaster', 'manual'));

-- Ticketmaster event ID
ALTER TABLE jambase_events ADD COLUMN IF NOT EXISTS ticketmaster_event_id TEXT UNIQUE;

-- Enhanced data fields from Ticketmaster
ALTER TABLE jambase_events ADD COLUMN IF NOT EXISTS external_url TEXT; -- Official purchase URL
ALTER TABLE jambase_events ADD COLUMN IF NOT EXISTS classifications JSONB; -- Full Ticketmaster classification hierarchy
ALTER TABLE jambase_events ADD COLUMN IF NOT EXISTS sales_info JSONB; -- Onsale/presale dates
ALTER TABLE jambase_events ADD COLUMN IF NOT EXISTS price_min DECIMAL(10,2); -- Structured pricing
ALTER TABLE jambase_events ADD COLUMN IF NOT EXISTS price_max DECIMAL(10,2); -- Structured pricing
ALTER TABLE jambase_events ADD COLUMN IF NOT EXISTS price_currency TEXT DEFAULT 'USD'; -- Price currency
ALTER TABLE jambase_events ADD COLUMN IF NOT EXISTS event_status TEXT; -- 'onsale', 'offsale', 'cancelled', etc.
ALTER TABLE jambase_events ADD COLUMN IF NOT EXISTS attraction_ids TEXT[]; -- Multiple attractions for festivals
ALTER TABLE jambase_events ADD COLUMN IF NOT EXISTS venue_timezone TEXT; -- Venue timezone
ALTER TABLE jambase_events ADD COLUMN IF NOT EXISTS images JSONB; -- Image URLs with dimensions
ALTER TABLE jambase_events ADD COLUMN IF NOT EXISTS is_user_created BOOLEAN DEFAULT false; -- Manual entries

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_jambase_events_ticketmaster_id ON jambase_events(ticketmaster_event_id);
CREATE INDEX IF NOT EXISTS idx_jambase_events_source ON jambase_events(source);
CREATE INDEX IF NOT EXISTS idx_jambase_events_status ON jambase_events(event_status);

-- Backfill existing data with appropriate source
UPDATE jambase_events SET source = 'jambase' WHERE source IS NULL AND jambase_event_id IS NOT NULL;
UPDATE jambase_events SET source = 'manual' WHERE source IS NULL AND (is_user_created = true OR (jambase_event_id IS NULL AND ticketmaster_event_id IS NULL));

-- Add helpful comments
COMMENT ON COLUMN jambase_events.source IS 'Internal event source tracking: jambase, ticketmaster, or manual (never displayed in UI)';
COMMENT ON COLUMN jambase_events.ticketmaster_event_id IS 'Ticketmaster event ID for events sourced from Ticketmaster API';
COMMENT ON COLUMN jambase_events.classifications IS 'Full Ticketmaster classification hierarchy (segment, genre, subgenre)';
COMMENT ON COLUMN jambase_events.images IS 'Multiple image URLs with dimensions and aspect ratios';

