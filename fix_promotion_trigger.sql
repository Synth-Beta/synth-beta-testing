-- ============================================
-- FIX PROMOTION TRIGGER FUNCTION
-- ============================================
-- This fixes the trigger function that was trying to update non-existent columns

-- Drop the existing trigger function
DROP FUNCTION IF EXISTS update_event_promotion_fields() CASCADE;

-- Create a new trigger function that doesn't try to update jambase_events
CREATE OR REPLACE FUNCTION update_event_promotion_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Only update the event_promotions table itself
  -- Don't try to update jambase_events columns that don't exist
  
  -- Update the updated_at timestamp
  NEW.updated_at = now();
  
  -- Log the promotion update for debugging
  RAISE NOTICE 'Promotion updated: % for event % with status %', 
    NEW.id, NEW.event_id, NEW.promotion_status;
  
  RETURN NEW;
END;
$function$;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trigger_update_event_promotion_fields ON event_promotions;

CREATE TRIGGER trigger_update_event_promotion_fields
  AFTER INSERT OR UPDATE OF promotion_status ON event_promotions
  FOR EACH ROW
  EXECUTE FUNCTION update_event_promotion_fields();

-- Now activate the pending promotions
UPDATE event_promotions 
SET 
  promotion_status = 'active',
  payment_status = 'completed',
  updated_at = now()
WHERE promotion_status = 'pending';

-- Show the updated promotions
SELECT 
  'Promotions Activated Successfully!' as status,
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
