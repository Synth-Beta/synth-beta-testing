-- ============================================
-- CHECK event_tickets vs event_ticket_urls STRUCTURE
-- ============================================
-- This script compares the structure of both tables to determine
-- if they overlap or serve different purposes

-- ============================================
-- PART A: event_tickets STRUCTURE
-- ============================================
SELECT 
  'event_tickets Structure' as analysis_type,
  column_name,
  data_type,
  is_nullable,
  column_default,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'event_tickets'
ORDER BY ordinal_position;

-- Get row count and sample data from event_tickets
SELECT 
  'event_tickets Data' as analysis_type,
  COUNT(*) as total_rows,
  COUNT(DISTINCT event_id) as unique_events,
  COUNT(DISTINCT ticket_provider) as unique_providers,
  COUNT(*) FILTER (WHERE is_primary = true) as primary_tickets
FROM public.event_tickets;

-- ============================================
-- PART B: event_ticket_urls STRUCTURE
-- ============================================
SELECT 
  'event_ticket_urls Structure' as analysis_type,
  column_name,
  data_type,
  is_nullable,
  column_default,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'event_ticket_urls'
ORDER BY ordinal_position;

-- Get row count and sample data from event_ticket_urls
DO $$
DECLARE
  has_ticket_provider BOOLEAN;
  total_rows_var BIGINT;
  unique_events_var BIGINT;
  unique_providers_var BIGINT;
BEGIN
  -- Check if ticket_provider column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'event_ticket_urls' 
      AND column_name = 'ticket_provider'
  ) INTO has_ticket_provider;
  
  -- Get basic counts
  SELECT COUNT(*) INTO total_rows_var FROM public.event_ticket_urls;
  SELECT COUNT(DISTINCT event_id) INTO unique_events_var FROM public.event_ticket_urls;
  
  -- Get provider count if column exists
  IF has_ticket_provider THEN
    EXECUTE 'SELECT COUNT(DISTINCT ticket_provider) FROM public.event_ticket_urls' INTO unique_providers_var;
  ELSE
    unique_providers_var := NULL;
  END IF;
  
  RAISE NOTICE '=== event_ticket_urls Data ===';
  RAISE NOTICE 'Total rows: %', total_rows_var;
  RAISE NOTICE 'Unique events: %', unique_events_var;
  RAISE NOTICE 'Has ticket_provider column: %', has_ticket_provider;
  IF unique_providers_var IS NOT NULL THEN
    RAISE NOTICE 'Unique providers: %', unique_providers_var;
  END IF;
END $$;

-- ============================================
-- PART C: CHECK FOR OVERLAP
-- ============================================
-- Check if event_tickets and event_ticket_urls have overlapping event_id values
SELECT 
  'Table Overlap Check' as analysis_type,
  COUNT(DISTINCT et.event_id) as events_in_tickets_table,
  COUNT(DISTINCT etu.event_id) as events_in_ticket_urls_table,
  COUNT(DISTINCT et.event_id) FILTER (
    WHERE EXISTS (
      SELECT 1 FROM public.event_ticket_urls etu2 
      WHERE etu2.event_id = et.event_id
    )
  ) as events_in_both_tables,
  COUNT(DISTINCT et.event_id) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM public.event_ticket_urls etu2 
      WHERE etu2.event_id = et.event_id
    )
  ) as events_only_in_tickets,
  COUNT(DISTINCT etu.event_id) FILTER (
    WHERE NOT EXISTS (
      SELECT 1 FROM public.event_tickets et2 
      WHERE et2.event_id = etu.event_id
    )
  ) as events_only_in_ticket_urls
FROM public.event_tickets et
CROSS JOIN public.event_ticket_urls etu;

-- ============================================
-- PART D: CHECK FOREIGN KEY RELATIONSHIPS
-- ============================================
SELECT 
  'Foreign Keys - event_tickets' as analysis_type,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'event_tickets'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY kcu.column_name;

SELECT 
  'Foreign Keys - event_ticket_urls' as analysis_type,
  tc.constraint_name,
  kcu.column_name,
  ccu.table_name AS references_table,
  ccu.column_name AS references_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
  ON tc.constraint_name = kcu.constraint_name
LEFT JOIN information_schema.constraint_column_usage ccu
  ON ccu.constraint_name = tc.constraint_name
WHERE tc.table_schema = 'public'
  AND tc.table_name = 'event_ticket_urls'
  AND tc.constraint_type = 'FOREIGN KEY'
ORDER BY kcu.column_name;

-- ============================================
-- PART E: SAMPLE DATA COMPARISON
-- ============================================
-- Get sample rows from each table for comparison
SELECT 
  'Sample event_tickets Data' as analysis_type,
  id,
  event_id,
  ticket_provider,
  ticket_url,
  ticket_type,
  price_min,
  price_max,
  currency,
  is_primary,
  created_at
FROM public.event_tickets
LIMIT 5;

SELECT 
  'Sample event_ticket_urls Data' as analysis_type,
  *
FROM public.event_ticket_urls
LIMIT 5;

