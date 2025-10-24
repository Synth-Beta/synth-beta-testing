-- ============================================
-- ADD MISSING PROMOTION COLUMNS TO JAMBASE_EVENTS
-- ============================================
-- This adds the missing columns that the trigger function needs

-- Add missing promotion columns to jambase_events
ALTER TABLE jambase_events 
ADD COLUMN IF NOT EXISTS is_promoted BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS active_promotion_id UUID;

-- Add foreign key constraint for active_promotion_id
ALTER TABLE jambase_events 
ADD CONSTRAINT jambase_events_active_promotion_id_fkey 
FOREIGN KEY (active_promotion_id) REFERENCES event_promotions(id) ON DELETE SET NULL;

-- Create index for the new columns
CREATE INDEX IF NOT EXISTS idx_jambase_events_is_promoted 
ON jambase_events USING btree (is_promoted) 
WHERE is_promoted = true;

CREATE INDEX IF NOT EXISTS idx_jambase_events_active_promotion_id 
ON jambase_events USING btree (active_promotion_id);

-- Drop the existing trigger function and recreate it properly
DROP FUNCTION IF EXISTS update_event_promotion_fields() CASCADE;

-- Create the corrected trigger function
CREATE OR REPLACE FUNCTION update_event_promotion_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Update the jambase_events table with promotion data
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Set promotion fields on the event
    UPDATE jambase_events
    SET 
      is_promoted = (NEW.promotion_status = 'active'),
      promotion_tier = NEW.promotion_tier,
      active_promotion_id = NEW.id,
      updated_at = now()
    WHERE id = NEW.event_id;
    
    -- Log the promotion update for debugging
    RAISE NOTICE 'Promotion updated: % for event % with status %', 
      NEW.id, NEW.event_id, NEW.promotion_status;
  END IF;
  
  -- Update the event_promotions table timestamp
  NEW.updated_at = now();
  
  RETURN NEW;
END;
$function$;

-- Recreate the trigger
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

-- Show current active promotions with event details
SELECT 
  ep.id as promotion_id,
  ep.event_id,
  je.title,
  je.artist_name,
  ep.promotion_tier,
  ep.promotion_status,
  je.is_promoted,
  je.promotion_tier as event_promotion_tier,
  je.active_promotion_id,
  ep.starts_at,
  ep.expires_at,
  (ep.promotion_status = 'active' 
   AND ep.starts_at <= now() 
   AND ep.expires_at >= now()) as is_currently_active
FROM event_promotions ep
JOIN jambase_events je ON ep.event_id = je.id
WHERE ep.promotion_status = 'active'
ORDER BY ep.created_at DESC;
