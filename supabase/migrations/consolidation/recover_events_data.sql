-- ============================================
-- RECOVERY SCRIPT: Restore jambase_events data to events table
-- ============================================
-- This script checks the current state and provides recovery steps
-- Run this if events data is missing

-- ============================================
-- STEP 1: Check current state
-- ============================================

DO $$
DECLARE
  v_jambase_exists BOOLEAN;
  v_jambase_count INTEGER;
  v_events_exists BOOLEAN;
  v_events_new_exists BOOLEAN;
  v_events_count INTEGER;
  v_events_new_count INTEGER;
BEGIN
  -- Check if jambase_events exists (check both jambase_events and jambase_events_old)
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name IN ('jambase_events', 'jambase_events_old')
  ) INTO v_jambase_exists;
  
  IF v_jambase_exists THEN
    -- Try jambase_events first
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'jambase_events'
    ) THEN
      EXECUTE 'SELECT COUNT(*) FROM public.jambase_events' INTO v_jambase_count;
      RAISE NOTICE 'jambase_events table exists with % rows', v_jambase_count;
    -- Otherwise check jambase_events_old
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'jambase_events_old'
    ) THEN
      EXECUTE 'SELECT COUNT(*) FROM public.jambase_events_old' INTO v_jambase_count;
      RAISE NOTICE 'jambase_events_old table exists with % rows (original table was renamed)', v_jambase_count;
    END IF;
  ELSE
    RAISE NOTICE 'Neither jambase_events nor jambase_events_old table exists';
  END IF;
  
  -- Check if events exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'events'
  ) INTO v_events_exists;
  
  IF v_events_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.events' INTO v_events_count;
    RAISE NOTICE 'events table exists with % rows', v_events_count;
  ELSE
    RAISE NOTICE 'events table does NOT exist';
  END IF;
  
  -- Check if events_new exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'events_new'
  ) INTO v_events_new_exists;
  
  IF v_events_new_exists THEN
    EXECUTE 'SELECT COUNT(*) FROM public.events_new' INTO v_events_new_count;
    RAISE NOTICE 'events_new table exists with % rows', v_events_new_count;
  ELSE
    RAISE NOTICE 'events_new table does NOT exist';
  END IF;
  
  -- Provide guidance
  IF NOT v_jambase_exists THEN
    RAISE EXCEPTION 'CRITICAL: Neither jambase_events nor jambase_events_old table exists. Data may have been lost.';
  END IF;
  
  IF v_jambase_count = 0 THEN
    RAISE EXCEPTION 'CRITICAL: Source events table exists but is empty. Data may have been lost.';
  END IF;
  
  RAISE NOTICE '=== RECOVERY PLAN ===';
  IF NOT v_events_new_exists THEN
    RAISE NOTICE 'Step 1: Create events_new table by running: 03_create_consolidated_tables.sql';
  END IF;
  
  IF v_events_new_exists AND v_events_new_count = 0 THEN
    RAISE NOTICE 'Step 2: Migrate data from jambase_events to events_new (see migration script below)';
  ELSIF v_events_new_exists AND v_events_new_count > 0 THEN
    RAISE NOTICE 'Step 2: events_new already has data. No migration needed.';
  END IF;
  
  IF v_events_new_exists AND v_events_new_count > 0 AND NOT v_events_exists THEN
    RAISE NOTICE 'Step 3: Rename events_new to events by running: 11_rename_tables_final.sql';
  END IF;
END $$;

-- ============================================
-- STEP 2: Ensure events_new table exists
-- ============================================
-- If events_new doesn't exist, run this section

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'events_new'
  ) THEN
    RAISE NOTICE 'Creating events_new table...';
    
    -- Create events_new table (from 03_create_consolidated_tables.sql)
    CREATE TABLE IF NOT EXISTS public.events_new (
      id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
      jambase_event_id TEXT UNIQUE,
      ticketmaster_event_id TEXT UNIQUE,
      title TEXT NOT NULL,
      artist_name TEXT NOT NULL,
      artist_id TEXT,
      artist_uuid UUID,
      venue_name TEXT NOT NULL,
      venue_id TEXT,
      venue_uuid UUID,
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
      promoted BOOLEAN DEFAULT false,
      promotion_tier TEXT,
      promotion_start_date TIMESTAMPTZ,
      promotion_end_date TIMESTAMPTZ,
      is_featured BOOLEAN DEFAULT false,
      featured_until TIMESTAMPTZ,
      created_by_user_id UUID,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    
    -- Create indexes
    CREATE INDEX IF NOT EXISTS idx_events_new_jambase_event_id ON public.events_new(jambase_event_id);
    CREATE INDEX IF NOT EXISTS idx_events_new_ticketmaster_event_id ON public.events_new(ticketmaster_event_id);
    CREATE INDEX IF NOT EXISTS idx_events_new_event_date ON public.events_new(event_date);
    CREATE INDEX IF NOT EXISTS idx_events_new_artist_uuid ON public.events_new(artist_uuid);
    CREATE INDEX IF NOT EXISTS idx_events_new_venue_uuid ON public.events_new(venue_uuid);
    CREATE INDEX IF NOT EXISTS idx_events_new_venue_city ON public.events_new(venue_city);
    CREATE INDEX IF NOT EXISTS idx_events_new_genres ON public.events_new USING GIN(genres);
    CREATE INDEX IF NOT EXISTS idx_events_new_promoted ON public.events_new(promoted);
    CREATE INDEX IF NOT EXISTS idx_events_new_is_featured ON public.events_new(is_featured);
    CREATE INDEX IF NOT EXISTS idx_events_new_source ON public.events_new(source);
    CREATE INDEX IF NOT EXISTS idx_events_new_event_status ON public.events_new(event_status);
    
    -- Enable RLS
    ALTER TABLE public.events_new ENABLE ROW LEVEL SECURITY;
    
    RAISE NOTICE 'events_new table created successfully';
  ELSE
    RAISE NOTICE 'events_new table already exists';
  END IF;
END $$;

-- ============================================
-- STEP 3: Migrate data from jambase_events to events_new
-- ============================================
-- This will migrate all data from jambase_events to events_new

DO $$
DECLARE
  v_before_count INTEGER;
  v_after_count INTEGER;
  v_jambase_count INTEGER;
BEGIN
  -- Check if jambase_events or jambase_events_old exists and has data
  DECLARE
    v_source_table TEXT;
  BEGIN
    -- Determine which source table to use
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'jambase_events'
    ) THEN
      v_source_table := 'jambase_events';
    ELSIF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'jambase_events_old'
    ) THEN
      v_source_table := 'jambase_events_old';
    ELSE
      RAISE EXCEPTION 'Neither jambase_events nor jambase_events_old table exists. Cannot migrate data.';
    END IF;
    
    -- Get counts from the appropriate source table
    EXECUTE format('SELECT COUNT(*) FROM public.%I', v_source_table) INTO v_jambase_count;
    EXECUTE 'SELECT COUNT(*) FROM public.events_new' INTO v_before_count;
    
    RAISE NOTICE 'Starting migration from %: source has % rows, events_new has % rows', v_source_table, v_jambase_count, v_before_count;
  
    -- Migrate data from source table (jambase_events or jambase_events_old) to events_new
    -- Handle event_promotions table conditionally
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_promotions'
    ) THEN
      -- Migrate with promotion data
      EXECUTE format('
        INSERT INTO public.events_new (
          id, jambase_event_id, ticketmaster_event_id, title, artist_name, artist_id, artist_uuid,
          venue_name, venue_id, venue_uuid, event_date, doors_time, description, genres,
          venue_address, venue_city, venue_state, venue_zip, latitude, longitude,
          ticket_available, price_range, price_min, price_max, price_currency,
          ticket_urls, external_url, setlist, tour_name, source, event_status,
          classifications, sales_info, attraction_ids, venue_timezone, images,
          is_user_created, promoted, promotion_tier, promotion_start_date, promotion_end_date,
          is_featured, featured_until, created_by_user_id, created_at, updated_at
        )
        SELECT 
          je.id, je.jambase_event_id, je.ticketmaster_event_id, je.title,
          COALESCE(je.artist_name, ''Unknown Artist'') as artist_name,
          je.artist_id, NULL::UUID as artist_uuid,
          COALESCE(je.venue_name, je.venue_city, ''Unknown Venue'') as venue_name,
          je.venue_id, NULL::UUID as venue_uuid,
          je.event_date, je.doors_time, je.description, je.genres,
          je.venue_address, je.venue_city, je.venue_state, je.venue_zip,
          je.latitude, je.longitude, je.ticket_available,
          je.price_range, je.price_min, je.price_max, je.price_currency,
          je.ticket_urls, je.external_url, je.setlist, je.tour_name,
          COALESCE(je.source, ''jambase'') as source, je.event_status,
          je.classifications, je.sales_info, je.attraction_ids,
          je.venue_timezone, je.images, COALESCE(je.is_user_created, false) as is_user_created,
          CASE WHEN ep.id IS NOT NULL AND ep.promotion_status = ''active'' AND ep.expires_at > now() 
               THEN true ELSE false END as promoted,
          ep.promotion_tier, ep.starts_at as promotion_start_date, ep.expires_at as promotion_end_date,
          je.is_featured, je.featured_until, je.created_by_user_id,
          je.created_at, je.updated_at
        FROM public.%I je
        LEFT JOIN public.event_promotions ep ON je.id = ep.event_id 
          AND ep.promotion_status = ''active''
          AND ep.expires_at > now()
        ON CONFLICT (id) DO NOTHING
      ', v_source_table);
    ELSE
      -- Migrate without promotion data
      EXECUTE format('
        INSERT INTO public.events_new (
          id, jambase_event_id, ticketmaster_event_id, title, artist_name, artist_id, artist_uuid,
          venue_name, venue_id, venue_uuid, event_date, doors_time, description, genres,
          venue_address, venue_city, venue_state, venue_zip, latitude, longitude,
          ticket_available, price_range, price_min, price_max, price_currency,
          ticket_urls, external_url, setlist, tour_name, source, event_status,
          classifications, sales_info, attraction_ids, venue_timezone, images,
          is_user_created, promoted, promotion_tier, promotion_start_date, promotion_end_date,
          is_featured, featured_until, created_by_user_id, created_at, updated_at
        )
        SELECT 
          je.id, je.jambase_event_id, je.ticketmaster_event_id, je.title,
          COALESCE(je.artist_name, ''Unknown Artist'') as artist_name,
          je.artist_id, NULL::UUID as artist_uuid,
          COALESCE(je.venue_name, je.venue_city, ''Unknown Venue'') as venue_name,
          je.venue_id, NULL::UUID as venue_uuid,
          je.event_date, je.doors_time, je.description, je.genres,
          je.venue_address, je.venue_city, je.venue_state, je.venue_zip,
          je.latitude, je.longitude, je.ticket_available,
          je.price_range, je.price_min, je.price_max, je.price_currency,
          je.ticket_urls, je.external_url, je.setlist, je.tour_name,
          COALESCE(je.source, ''jambase'') as source, je.event_status,
          je.classifications, je.sales_info, je.attraction_ids,
          je.venue_timezone, je.images, COALESCE(je.is_user_created, false) as is_user_created,
          false as promoted, NULL as promotion_tier, NULL as promotion_start_date, NULL as promotion_end_date,
          je.is_featured, je.featured_until, je.created_by_user_id,
          je.created_at, je.updated_at
        FROM public.%I je
        ON CONFLICT (id) DO NOTHING
      ', v_source_table);
    END IF;
  END;
  
  -- Get after count
  EXECUTE 'SELECT COUNT(*) FROM public.events_new' INTO v_after_count;
  
  RAISE NOTICE 'Migration complete: events_new now has % rows (added % new rows)', v_after_count, (v_after_count - v_before_count);
  
  IF v_after_count = 0 THEN
    RAISE WARNING 'WARNING: events_new is still empty after migration. Check for errors.';
  ELSIF v_after_count < v_jambase_count THEN
    RAISE WARNING 'WARNING: Only % of % rows migrated. Some rows may have been skipped due to conflicts.', v_after_count, v_jambase_count;
  ELSE
    RAISE NOTICE 'SUCCESS: All data migrated successfully!';
  END IF;
END $$;

-- ============================================
-- STEP 4: Verify migration
-- ============================================

DO $$
DECLARE
  v_source_table TEXT;
  v_source_count INTEGER;
  v_events_new_count INTEGER;
BEGIN
  -- Determine which source table was used
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jambase_events'
  ) THEN
    v_source_table := 'jambase_events';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'jambase_events_old'
  ) THEN
    v_source_table := 'jambase_events_old';
  ELSE
    v_source_table := NULL;
  END IF;
  
  IF v_source_table IS NOT NULL THEN
    EXECUTE format('SELECT COUNT(*) FROM public.%I', v_source_table) INTO v_source_count;
    EXECUTE 'SELECT COUNT(*) FROM public.events_new' INTO v_events_new_count;
    
    RAISE NOTICE '=== Migration Verification ===';
    RAISE NOTICE 'Source table (%): % rows', v_source_table, v_source_count;
    RAISE NOTICE 'Destination (events_new): % rows', v_events_new_count;
    
    IF v_events_new_count = v_source_count THEN
      RAISE NOTICE 'Status: PASS - All rows migrated successfully!';
    ELSE
      RAISE WARNING 'Status: WARNING - Counts do not match. Some rows may have been skipped due to conflicts.';
    END IF;
  END IF;
END $$;

