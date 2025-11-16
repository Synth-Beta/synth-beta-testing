-- ============================================
-- CONSOLIDATE event_promotions INTO monetization_tracking
-- ============================================
-- This script migrates data from event_promotions to monetization_tracking table

-- First check the structure of event_promotions
SELECT 
  'event_promotions Structure' as check_type,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'event_promotions'
ORDER BY ordinal_position;

-- Check if monetization_tracking exists and has the right structure
SELECT 
  'monetization_tracking Structure' as check_type,
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'monetization_tracking'
ORDER BY ordinal_position;

-- Check row counts
SELECT 
  'Row Count Check' as check_type,
  (SELECT COUNT(*) FROM public.event_promotions) as event_promotions_count,
  (
    SELECT COUNT(*) 
    FROM public.monetization_tracking 
    WHERE transaction_type = 'event_promotion'
  ) as monetization_promotion_count;

-- Note: After reviewing the structures, we'll create the migration
-- This requires knowing the exact column mappings

