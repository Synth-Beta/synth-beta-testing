-- ============================================
-- DROP EMPTY REDUNDANT TABLES
-- ============================================
-- This script drops tables that are empty and redundant
-- Only run after verifying they have no data

-- ============================================
-- DROP event_promotions (empty, consolidated into monetization_tracking)
-- ============================================
DROP TABLE IF EXISTS public.event_promotions CASCADE;

-- ============================================
-- VERIFICATION
-- ============================================
SELECT 
  'Dropped Tables Verification' as verification_type,
  CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'event_promotions'
    ) THEN 'event_promotions - DROPPED ✅'
    ELSE 'event_promotions - STILL EXISTS ⚠️'
  END as status;

