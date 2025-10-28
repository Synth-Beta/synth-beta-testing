-- ============================================================
-- COMPLETE FIX FOR PRICE_RANGE ISSUES
-- ============================================================
-- This script ensures:
-- 1. Trigger NEVER overwrites existing price_range
-- 2. All events with price_min/price_max get price_range populated
-- 3. Function returns price_range correctly

-- Step 1: Recreate trigger function with ultra-conservative logic
CREATE OR REPLACE FUNCTION auto_populate_price_range()
RETURNS TRIGGER AS $$
DECLARE
  v_formatted TEXT;
BEGIN
  -- ONLY populate if BOTH conditions are true:
  -- 1. price_range is NULL or empty string (whitespace only)
  -- 2. We have price_min or price_max to work with
  -- NEVER touch price_range if it already has a value
  
  IF (NEW.price_range IS NULL OR TRIM(COALESCE(NEW.price_range, '')) = '') 
     AND (NEW.price_min IS NOT NULL OR NEW.price_max IS NOT NULL) THEN
    v_formatted := format_price_range(NEW.price_min, NEW.price_max, COALESCE(NEW.price_currency, 'USD'));
    IF v_formatted IS NOT NULL THEN
      NEW.price_range := v_formatted;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 2: Verify trigger exists and is correct
DROP TRIGGER IF EXISTS trigger_auto_populate_price_range ON jambase_events;
CREATE TRIGGER trigger_auto_populate_price_range
  BEFORE INSERT OR UPDATE ON jambase_events
  FOR EACH ROW
  WHEN (NEW.price_min IS NOT NULL OR NEW.price_max IS NOT NULL)
  EXECUTE FUNCTION auto_populate_price_range();

COMMENT ON TRIGGER trigger_auto_populate_price_range ON jambase_events IS 
  'Auto-populates price_range from price_min/price_max ONLY when price_range is NULL or empty. Never overwrites existing price_range values.';

-- Step 3: Backfill missing price_range values
-- This updates events that have price_min/price_max but no price_range
UPDATE jambase_events
SET price_range = format_price_range(price_min, price_max, COALESCE(price_currency, 'USD'))
WHERE (price_min IS NOT NULL OR price_max IS NOT NULL)
  AND (price_range IS NULL OR TRIM(COALESCE(price_range, '')) = '');

-- Step 4: Verify get_personalized_events_feed returns price_range
-- Check the function signature
DO $$
DECLARE
  v_has_price_range BOOLEAN := FALSE;
BEGIN
  -- Check if price_range is in the return type
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    JOIN pg_type t ON p.prorettype = t.oid
    JOIN pg_type e ON e.typelem = t.oid
    JOIN pg_attribute a ON a.attrelid = e.oid
    WHERE p.proname = 'get_personalized_events_feed'
      AND n.nspname = 'public'
      AND a.attname = 'price_range'
  ) INTO v_has_price_range;
  
  IF NOT v_has_price_range THEN
    RAISE WARNING 'price_range may not be in get_personalized_events_feed return type - check migration 20250228000006';
  ELSE
    RAISE NOTICE '✓ Function returns price_range column';
  END IF;
END $$;

-- Step 5: Final verification
SELECT 
  'Backfill complete' as status,
  COUNT(*) FILTER (WHERE price_range IS NOT NULL AND TRIM(price_range) != '') as events_with_price_range,
  COUNT(*) FILTER (WHERE price_min IS NOT NULL OR price_max IS NOT NULL) as events_with_structured_price,
  COUNT(*) FILTER (WHERE price_range IS NULL AND (price_min IS NOT NULL OR price_max IS NOT NULL)) as events_still_missing_price_range
FROM jambase_events
WHERE event_date >= CURRENT_DATE;

