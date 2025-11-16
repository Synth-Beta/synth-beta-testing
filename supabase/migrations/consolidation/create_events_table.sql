-- ============================================
-- CREATE EVENTS TABLE (Consolidated Schema)
-- ============================================
-- This creates the events table structure as defined in the consolidation plan
-- Run this if events table is missing

-- ============================================
-- CREATE EVENTS TABLE
-- ============================================

-- Create events table (consolidated from jambase_events + promotion fields)
CREATE TABLE IF NOT EXISTS public.events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  jambase_event_id TEXT UNIQUE,
  ticketmaster_event_id TEXT UNIQUE,
  title TEXT NOT NULL,
  artist_name TEXT NOT NULL,
  artist_id TEXT,
  artist_uuid UUID, -- Foreign key to artists table
  venue_name TEXT NOT NULL,
  venue_id TEXT,
  venue_uuid UUID, -- Foreign key to venues table
  event_date TIMESTAMPTZ NOT NULL,
  doors_time TIMESTAMPTZ,
  description TEXT,
  genres TEXT[],
  venue_address TEXT,
  venue_city TEXT,
  venue_state TEXT,
  venue_zip TEXT,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  ticket_available BOOLEAN DEFAULT false,
  price_range TEXT,
  price_min DECIMAL(10,2),
  price_max DECIMAL(10,2),
  price_currency TEXT DEFAULT 'USD',
  ticket_urls TEXT[],
  external_url TEXT,
  setlist JSONB,
  tour_name TEXT,
  source TEXT DEFAULT 'jambase' CHECK (source IN ('jambase', 'ticketmaster', 'manual')),
  event_status TEXT,
  classifications JSONB,
  sales_info JSONB,
  attraction_ids TEXT[],
  venue_timezone TEXT,
  images JSONB,
  is_user_created BOOLEAN DEFAULT false,
  -- Promotion fields
  promoted BOOLEAN DEFAULT false,
  promotion_tier TEXT CHECK (promotion_tier IN ('basic', 'premium', 'featured')),
  promotion_start_date TIMESTAMPTZ,
  promotion_end_date TIMESTAMPTZ,
  is_featured BOOLEAN DEFAULT false,
  featured_until TIMESTAMPTZ,
  -- Ownership
  created_by_user_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for events
CREATE INDEX IF NOT EXISTS idx_events_jambase_event_id ON public.events(jambase_event_id);
CREATE INDEX IF NOT EXISTS idx_events_ticketmaster_event_id ON public.events(ticketmaster_event_id);
CREATE INDEX IF NOT EXISTS idx_events_title ON public.events(title);
CREATE INDEX IF NOT EXISTS idx_events_artist_name ON public.events(artist_name);
CREATE INDEX IF NOT EXISTS idx_events_venue_name ON public.events(venue_name);
CREATE INDEX IF NOT EXISTS idx_events_event_date ON public.events(event_date);
CREATE INDEX IF NOT EXISTS idx_events_doors_time ON public.events(doors_time);
CREATE INDEX IF NOT EXISTS idx_events_artist_uuid ON public.events(artist_uuid);
CREATE INDEX IF NOT EXISTS idx_events_venue_uuid ON public.events(venue_uuid);
CREATE INDEX IF NOT EXISTS idx_events_venue_city ON public.events(venue_city);
CREATE INDEX IF NOT EXISTS idx_events_venue_state ON public.events(venue_state);
CREATE INDEX IF NOT EXISTS idx_events_genres ON public.events USING GIN(genres);
CREATE INDEX IF NOT EXISTS idx_events_promoted ON public.events(promoted) WHERE promoted = true;
CREATE INDEX IF NOT EXISTS idx_events_promotion_dates ON public.events(promotion_start_date, promotion_end_date);
CREATE INDEX IF NOT EXISTS idx_events_is_featured ON public.events(is_featured) WHERE is_featured = true;
CREATE INDEX IF NOT EXISTS idx_events_created_by ON public.events(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_events_source ON public.events(source);
CREATE INDEX IF NOT EXISTS idx_events_event_status ON public.events(event_status);
CREATE INDEX IF NOT EXISTS idx_events_is_user_created ON public.events(is_user_created);

-- Add foreign key constraints (only if referenced tables exist)
DO $$
BEGIN
  -- Add foreign key to artists table if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'artists'
  ) THEN
    ALTER TABLE public.events
    ADD CONSTRAINT fk_events_artist_uuid 
    FOREIGN KEY (artist_uuid) 
    REFERENCES public.artists(id) 
    ON DELETE SET NULL;
    
    RAISE NOTICE 'Added foreign key constraint: events.artist_uuid -> artists.id';
  END IF;
  
  -- Add foreign key to venues table if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'venues'
  ) THEN
    ALTER TABLE public.events
    ADD CONSTRAINT fk_events_venue_uuid 
    FOREIGN KEY (venue_uuid) 
    REFERENCES public.venues(id) 
    ON DELETE SET NULL;
    
    RAISE NOTICE 'Added foreign key constraint: events.venue_uuid -> venues.id';
  END IF;
  
  -- Add foreign key to users table if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'users'
  ) THEN
    ALTER TABLE public.events
    ADD CONSTRAINT fk_events_created_by_user_id 
    FOREIGN KEY (created_by_user_id) 
    REFERENCES public.users(user_id) 
    ON DELETE SET NULL;
    
    RAISE NOTICE 'Added foreign key constraint: events.created_by_user_id -> users.user_id';
  END IF;
END $$;

-- Enable RLS on events
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

-- Create trigger for updated_at
CREATE TRIGGER update_events_updated_at
  BEFORE UPDATE ON public.events
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Verify table creation
DO $$
DECLARE
  v_table_exists BOOLEAN;
  v_column_count INTEGER;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'events'
  ) INTO v_table_exists;
  
  IF v_table_exists THEN
    SELECT COUNT(*) INTO v_column_count
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'events';
    
    RAISE NOTICE 'SUCCESS: events table created with % columns', v_column_count;
  ELSE
    RAISE EXCEPTION 'FAILED: events table was not created';
  END IF;
END $$;

-- Display table structure
SELECT 
  'Table Created' as status,
  'events' as table_name,
  COUNT(*) as column_count
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'events';

