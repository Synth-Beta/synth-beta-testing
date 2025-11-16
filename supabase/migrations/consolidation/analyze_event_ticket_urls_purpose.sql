-- ============================================
-- ANALYZE event_ticket_urls PURPOSE
-- ============================================
-- This script analyzes the structure and purpose of event_ticket_urls
-- to determine if it should be consolidated into event_tickets

-- ============================================
-- PART A: COMPARE FULL STRUCTURE
-- ============================================
SELECT 
  'Column Comparison' as analysis_type,
  'event_tickets' as table_name,
  column_name,
  data_type,
  is_nullable,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'event_tickets'
ORDER BY ordinal_position;

SELECT 
  'Column Comparison' as analysis_type,
  'event_ticket_urls' as table_name,
  column_name,
  data_type,
  is_nullable,
  ordinal_position
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'event_ticket_urls'
ORDER BY ordinal_position;

-- ============================================
-- PART B: CHECK DATA OVERLAP
-- ============================================
-- Check if event_ticket_urls data exists in event_tickets
SELECT 
  'Overlap Analysis' as analysis_type,
  (SELECT COUNT(*) FROM public.event_ticket_urls) as event_ticket_urls_total,
  (SELECT COUNT(*) FROM public.event_tickets) as event_tickets_total,
  (SELECT COUNT(DISTINCT event_id) FROM public.event_ticket_urls) as event_ticket_urls_unique_events,
  (SELECT COUNT(DISTINCT event_id) FROM public.event_tickets) as event_tickets_unique_events,
  (
    SELECT COUNT(DISTINCT etu.event_id)
    FROM public.event_ticket_urls etu
    INNER JOIN public.event_tickets et ON et.event_id = etu.event_id
  ) as events_in_both_tables,
  (
    SELECT COUNT(DISTINCT etu.event_id)
    FROM public.event_ticket_urls etu
    WHERE NOT EXISTS (
      SELECT 1 FROM public.event_tickets et 
      WHERE et.event_id = etu.event_id
    )
  ) as events_only_in_ticket_urls,
  (
    SELECT COUNT(DISTINCT et.event_id)
    FROM public.event_tickets et
    WHERE NOT EXISTS (
      SELECT 1 FROM public.event_ticket_urls etu 
      WHERE etu.event_id = et.event_id
    )
  ) as events_only_in_tickets;

-- ============================================
-- PART C: CHECK IF URLs OVERLAP
-- ============================================
-- Check if ticket_url values overlap between tables
SELECT 
  'URL Overlap' as analysis_type,
  COUNT(*) as matching_urls
FROM public.event_ticket_urls etu
WHERE EXISTS (
  SELECT 1 FROM public.event_tickets et
  WHERE et.ticket_url = etu.ticket_url
);

-- ============================================
-- PART D: CHECK FOR PROVIDER INFORMATION
-- ============================================
-- Check if event_ticket_urls has any provider/type info or just URLs
SELECT 
  'event_ticket_urls Structure Check' as analysis_type,
  column_name,
  CASE 
    WHEN column_name LIKE '%provider%' OR column_name LIKE '%type%' OR column_name LIKE '%price%' 
    THEN 'Has metadata'
    WHEN column_name = 'ticket_url' THEN 'Just URL'
    WHEN column_name IN ('id', 'event_id') THEN 'Key column'
    ELSE 'Other'
  END as column_purpose
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'event_ticket_urls'
ORDER BY ordinal_position;

-- ============================================
-- PART E: RECOMMENDATION
-- ============================================
-- Based on structure and data, provide recommendation
SELECT 
  'Recommendation' as analysis_type,
  CASE 
    WHEN (
      SELECT COUNT(*) FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'event_ticket_urls'
    ) <= 3 
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'event_ticket_urls'
      AND column_name = 'ticket_url'
    )
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'event_ticket_urls'
      AND (column_name LIKE '%provider%' OR column_name LIKE '%type%' OR column_name LIKE '%price%')
    )
    THEN 'CONSOLIDATE - Simple URL storage, merge into event_tickets (use ticket_url column, set provider from URL if possible)'
    WHEN (
      SELECT COUNT(*) FROM public.event_ticket_urls
    ) = (
      SELECT COUNT(*) FROM public.event_tickets
      WHERE ticket_url IS NOT NULL
    )
    THEN 'CONSOLIDATE - Data appears duplicated'
    ELSE 'REVIEW - Check if serves different purpose (e.g., affiliate tracking only)'
  END as action;

