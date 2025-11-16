-- ============================================
-- DROP event_ticket_urls TABLE
-- ============================================
-- Only run this AFTER verifying the migration was successful
-- and confirming that all data was migrated to event_tickets

-- ============================================
-- VERIFICATION BEFORE DROP
-- ============================================
-- Check if all URLs were migrated
SELECT 
  'Pre-Drop Verification' as check_type,
  (SELECT COUNT(*) FROM public.event_ticket_urls) as remaining_urls,
  (
    SELECT COUNT(*) 
    FROM public.event_ticket_urls etu
    WHERE NOT EXISTS (
      SELECT 1 FROM public.event_tickets et
      WHERE et.event_id = etu.event_id
        AND et.ticket_url = etu.ticket_url
    )
  ) as unmigrated_urls,
  CASE 
    WHEN (
      SELECT COUNT(*) 
      FROM public.event_ticket_urls etu
      WHERE NOT EXISTS (
        SELECT 1 FROM public.event_tickets et
        WHERE et.event_id = etu.event_id
          AND et.ticket_url = etu.ticket_url
      )
    ) = 0 THEN 'SAFE TO DROP - All URLs migrated'
    ELSE 'WARNING - Some URLs not migrated, review before dropping'
  END as status;

-- ============================================
-- DROP TABLE
-- ============================================
-- Only run if verification shows 0 unmigrated URLs
DROP TABLE IF EXISTS public.event_ticket_urls CASCADE;

-- ============================================
-- POST-DROP VERIFICATION
-- ============================================
SELECT 
  'Post-Drop Verification' as check_type,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_ticket_urls'
    ) THEN '✅ event_ticket_urls DROPPED SUCCESSFULLY'
    ELSE '⚠️  event_ticket_urls STILL EXISTS'
  END as status;

