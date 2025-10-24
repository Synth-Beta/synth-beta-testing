-- ============================================
-- ACTIVATE PENDING PROMOTIONS
-- ============================================
-- This script activates all pending promotions to make them visible in the feed

-- Update all pending promotions to active status
UPDATE event_promotions 
SET 
  promotion_status = 'active',
  payment_status = 'completed',
  updated_at = now()
WHERE promotion_status = 'pending';

-- Show the updated promotions
SELECT 
  'Updated Promotions:' as status,
  COUNT(*) as total_activated
FROM event_promotions 
WHERE promotion_status = 'active';

-- Show current active promotions
SELECT 
  ep.id,
  ep.event_id,
  je.title,
  je.artist_name,
  ep.promotion_tier,
  ep.promotion_status,
  ep.starts_at,
  ep.expires_at,
  (ep.promotion_status = 'active' 
   AND ep.starts_at <= now() 
   AND ep.expires_at >= now()) as is_currently_active
FROM event_promotions ep
JOIN jambase_events je ON ep.event_id = je.id
WHERE ep.promotion_status = 'active'
ORDER BY ep.created_at DESC;
