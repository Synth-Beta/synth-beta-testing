-- ============================================
-- RESTORE SCRIPT: Recreate jambase_events table from migrated data
-- ============================================
-- This script restores the jambase_events table from events_new or events table
-- Run this if jambase_events was deleted but data exists in the consolidated tables

-- ============================================
-- STEP 1: Check current state
-- ============================================

DO $$
DECLARE
  v_jambase_exists BOOLEAN;
  v_events_exists BOOLEAN;
  v_events_new_exists BOOLEAN;
  v_events_count INTEGER;
  v_events_new_count INTEGER;
  v_source_table TEXT;
BEGIN
  -- Check if jambase_events exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jambase_events'
  ) INTO v_jambase_exists;
  
  IF v_jambase_exists THEN
    RAISE NOTICE 'jambase_events table already exists. No restoration needed.';
    RETURN;
  END IF;
  
  RAISE NOTICE 'jambase_events table does not exist. Checking for migrated data...';
  
  -- Check if events table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'events'
  ) INTO v_events_exists;
  
  IF v_events_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.events' INTO v_events_count;
    RAISE NOTICE 'events table exists with % rows', v_events_count;
  END IF;
  
  -- Check if events_new table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'events_new'
  ) INTO v_events_new_exists;
  
  IF v_events_new_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.events_new' INTO v_events_new_count;
    RAISE NOTICE 'events_new table exists with % rows', v_events_new_count;
  END IF;
  
  -- Determine which source table to use
  IF v_events_exists AND v_events_count > 0 THEN
    v_source_table := 'events';
    RAISE NOTICE 'Will restore from: events table';
  ELSIF v_events_new_exists AND v_events_new_count > 0 THEN
    v_source_table := 'events_new';
    RAISE NOTICE 'Will restore from: events_new table';
  ELSE
    RAISE EXCEPTION 'CRITICAL: Neither events nor events_new table has data. Cannot restore jambase_events. Data may have been lost. Please check database backups.';
  END IF;
END $$;

-- ============================================
-- STEP 2: Recreate jambase_events table structure
-- ============================================
-- This recreates the original jambase_events table structure

DO $$
BEGIN
  -- Only create if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jambase_events'
  ) THEN
    RAISE NOTICE 'Creating jambase_events table structure...';
    
    CREATE TABLE public.jambase_events (
      id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      jambase_event_id TEXT UNIQUE,
      ticketmaster_event_id TEXT UNIQUE,
      title TEXT NOT NULL,
      artist_name TEXT,
      artist_id TEXT,
      venue_name TEXT,
      venue_id TEXT,
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
      source TEXT DEFAULT 'jambase',
      event_status TEXT,
      classifications JSONB,
      sales_info JSONB,
      attraction_ids TEXT[],
      venue_timezone TEXT,
      images JSONB,
      is_user_created BOOLEAN DEFAULT false,
      is_featured BOOLEAN DEFAULT false,
      featured_until TIMESTAMPTZ,
      created_by_user_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_jambase_events_jambase_event_id ON public.jambase_events(jambase_event_id);
    CREATE INDEX IF NOT EXISTS idx_jambase_events_ticketmaster_event_id ON public.jambase_events(ticketmaster_event_id);
    CREATE INDEX IF NOT EXISTS idx_jambase_events_event_date ON public.jambase_events(event_date);
    CREATE INDEX IF NOT EXISTS idx_jambase_events_venue_city ON public.jambase_events(venue_city);
    CREATE INDEX IF NOT EXISTS idx_jambase_events_genres ON public.jambase_events USING GIN(genres);
    CREATE INDEX IF NOT EXISTS idx_jambase_events_is_featured ON public.jambase_events(is_featured);
    CREATE INDEX IF NOT EXISTS idx_jambase_events_source ON public.jambase_events(source);
    
    -- Enable RLS
    ALTER TABLE public.jambase_events ENABLE ROW LEVEL SECURITY;
    
    RAISE NOTICE 'jambase_events table structure created successfully';
  ELSE
    RAISE NOTICE 'jambase_events table already exists';
  END IF;
END $$;

-- ============================================
-- STEP 3: Restore data from events/events_new to jambase_events
-- ============================================

DO $$
DECLARE
  v_source_table TEXT;
  v_before_count INTEGER := 0;
  v_after_count INTEGER;
  v_source_count INTEGER;
BEGIN
  -- Determine which source table to use
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'events'
  ) AND (SELECT COUNT(*) FROM public.events) > 0 THEN
    v_source_table := 'events';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'events_new'
  ) AND (SELECT COUNT(*) FROM public.events_new) > 0 THEN
    v_source_table := 'events_new';
  ELSE
    RAISE EXCEPTION 'No source table with data found. Cannot restore jambase_events.';
  END IF;
  
  -- Get counts
  EXECUTE format('SELECT COUNT(*) FROM public.%I', v_source_table) INTO v_source_count;
  EXECUTE 'SELECT COUNT(*) FROM public.jambase_events' INTO v_before_count;
  
  RAISE NOTICE 'Restoring data from % to jambase_events...', v_source_table;
  RAISE NOTICE 'Source table has % rows, jambase_events currently has % rows', v_source_count, v_before_count;
  
  -- Restore data (reverse migration)
  -- Only restore events that came from jambase (source = 'jambase')
  EXECUTE format('
    INSERT INTO public.jambase_events (
      id, jambase_event_id, ticketmaster_event_id, title, artist_name, artist_id,
      venue_name, venue_id, event_date, doors_time, description, genres,
      venue_address, venue_city, venue_state, venue_zip, latitude, longitude,
      ticket_available, price_range, price_min, price_max, price_currency,
      ticket_urls, external_url, setlist, tour_name, source, event_status,
      classifications, sales_info, attraction_ids, venue_timezone, images,
      is_user_created, is_featured, featured_until, created_by_user_id,
      created_at, updated_at
    )
    SELECT 
      e.id, e.jambase_event_id, e.ticketmaster_event_id, e.title, e.artist_name, e.artist_id,
      e.venue_name, e.venue_id, e.event_date, e.doors_time, e.description, e.genres,
      e.venue_address, e.venue_city, e.venue_state, e.venue_zip, e.latitude, e.longitude,
      e.ticket_available, e.price_range, e.price_min, e.price_max, e.price_currency,
      e.ticket_urls, e.external_url, e.setlist, e.tour_name,
      ''jambase'' as source, e.event_status, -- Set source to 'jambase' since these are all jambase events
      e.classifications, e.sales_info, e.attraction_ids, e.venue_timezone, e.images,
      COALESCE(e.is_user_created, false) as is_user_created,
      COALESCE(e.is_featured, false) as is_featured, e.featured_until, e.created_by_user_id,
      e.created_at, e.updated_at
    FROM public.%I e
    WHERE COALESCE(e.source, ''jambase'') = ''jambase''
    ON CONFLICT (id) DO NOTHING
  ', v_source_table);
  
  -- Get after count
  EXECUTE 'SELECT COUNT(*) FROM public.jambase_events' INTO v_after_count;
  
  RAISE NOTICE 'Restoration complete: jambase_events now has % rows (added % new rows)', v_after_count, (v_after_count - v_before_count);
  
  IF v_after_count = 0 THEN
    RAISE WARNING 'WARNING: jambase_events is still empty after restoration. Check if source table has jambase events.';
  ELSIF v_after_count < v_source_count THEN
    RAISE NOTICE 'Note: Only % of % rows restored. This is expected if source table contains non-jambase events.', v_after_count, v_source_count;
  ELSE
    RAISE NOTICE 'SUCCESS: All jambase events restored successfully!';
  END IF;
END $$;

-- ============================================
-- STEP 4: Verify restoration
-- ============================================

SELECT 
  'Restoration Verification' as check_type,
  (SELECT COUNT(*) FROM public.jambase_events) as jambase_events_count,
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events')
    THEN (SELECT COUNT(*) FROM public.events WHERE COALESCE(source, 'jambase') = 'jambase')
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'events_new')
    THEN (SELECT COUNT(*) FROM public.events_new WHERE COALESCE(source, 'jambase') = 'jambase')
    ELSE 0
  END as source_jambase_events_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM public.jambase_events) > 0 
    THEN 'PASS - jambase_events restored' 
    ELSE 'FAIL - jambase_events is empty'
  END as status;

