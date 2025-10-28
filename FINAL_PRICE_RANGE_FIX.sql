-- ============================================================
-- FINAL COMPREHENSIVE FIX FOR PRICE_RANGE
-- ============================================================
-- This ensures price_range is:
-- 1. Always populated when price_min/price_max exist
-- 2. Never overwritten when it already has a value
-- 3. Returned correctly by get_personalized_events_feed

-- Step 1: Ensure format_price_range function exists and works
CREATE OR REPLACE FUNCTION format_price_range(
  p_price_min DECIMAL,
  p_price_max DECIMAL,
  p_price_currency TEXT DEFAULT 'USD'
)
RETURNS TEXT AS $$
DECLARE
  v_currency_symbol TEXT;
  v_result TEXT;
BEGIN
  -- Return NULL if no price data
  IF p_price_min IS NULL AND p_price_max IS NULL THEN
    RETURN NULL;
  END IF;
  
  -- Get currency symbol
  v_currency_symbol := CASE 
    WHEN p_price_currency = 'USD' THEN '$'
    WHEN p_price_currency = 'EUR' THEN '€'
    WHEN p_price_currency = 'GBP' THEN '£'
    WHEN p_price_currency IS NULL OR TRIM(p_price_currency) = '' THEN '$'
    ELSE p_price_currency || ' '
  END;
  
  -- Format based on available values
  IF p_price_min IS NOT NULL AND p_price_max IS NOT NULL THEN
    IF p_price_min = p_price_max THEN
      v_result := v_currency_symbol || TRIM(to_char(p_price_min, '999999999.00'));
    ELSE
      v_result := v_currency_symbol || TRIM(to_char(p_price_min, '999999999.00')) 
                  || ' - ' || v_currency_symbol || TRIM(to_char(p_price_max, '999999999.00'));
    END IF;
  ELSIF p_price_min IS NOT NULL THEN
    v_result := v_currency_symbol || TRIM(to_char(p_price_min, '999999999.00')) || '+';
  ELSIF p_price_max IS NOT NULL THEN
    v_result := 'Up to ' || v_currency_symbol || TRIM(to_char(p_price_max, '999999999.00'));
  END IF;
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 2: Recreate trigger function - NEVER overwrite existing price_range
CREATE OR REPLACE FUNCTION auto_populate_price_range()
RETURNS TRIGGER AS $$
DECLARE
  v_formatted TEXT;
BEGIN
  -- ONLY populate if price_range is NULL or empty
  -- NEVER touch existing price_range values
  IF (NEW.price_range IS NULL OR TRIM(COALESCE(NEW.price_range, '')) = '') 
     AND (NEW.price_min IS NOT NULL OR NEW.price_max IS NOT NULL) THEN
    
    v_formatted := format_price_range(NEW.price_min, NEW.price_max, COALESCE(NEW.price_currency, 'USD'));
    
    IF v_formatted IS NOT NULL AND TRIM(v_formatted) != '' THEN
      NEW.price_range := v_formatted;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Recreate trigger
DROP TRIGGER IF EXISTS trigger_auto_populate_price_range ON jambase_events;
CREATE TRIGGER trigger_auto_populate_price_range
  BEFORE INSERT OR UPDATE ON jambase_events
  FOR EACH ROW
  WHEN (NEW.price_min IS NOT NULL OR NEW.price_max IS NOT NULL)
  EXECUTE FUNCTION auto_populate_price_range();

-- Step 4: BACKFILL - Update all events missing price_range
-- This preserves existing price_range and only adds it where missing
UPDATE jambase_events
SET price_range = format_price_range(price_min, price_max, COALESCE(price_currency, 'USD'))
WHERE (price_min IS NOT NULL OR price_max IS NOT NULL)
  AND (price_range IS NULL OR TRIM(COALESCE(price_range, '')) = '');

-- Step 5: Verify get_personalized_events_feed includes price_range in SELECT
-- (Migration 20250228000006 should have this, but let's verify)
DO $$
DECLARE
  v_function_text TEXT;
  v_has_price_range BOOLEAN := FALSE;
BEGIN
  -- Get the function definition
  SELECT pg_get_functiondef(p.oid) INTO v_function_text
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE p.proname = 'get_personalized_events_feed'
    AND n.nspname = 'public'
    AND pg_get_function_arguments(p.oid) LIKE '%UUID, INT%'
  LIMIT 1;
  
  IF v_function_text IS NULL THEN
    RAISE WARNING 'Function get_personalized_events_feed not found';
  ELSIF v_function_text NOT LIKE '%fs.price_range%' AND v_function_text NOT LIKE '%e.price_range%' THEN
    RAISE WARNING 'price_range may not be returned by get_personalized_events_feed. Check migration 20250228000006.';
  ELSE
    RAISE NOTICE '✓ Function appears to return price_range';
  END IF;
END $$;

-- Step 6: FINAL VERIFICATION
SELECT 
  'VERIFICATION' as status,
  COUNT(*) as total_future_events,
  COUNT(*) FILTER (WHERE price_range IS NOT NULL AND TRIM(price_range) != '') as has_price_range,
  COUNT(*) FILTER (WHERE price_min IS NOT NULL OR price_max IS NOT NULL) as has_structured_price,
  COUNT(*) FILTER (WHERE price_range IS NULL AND (price_min IS NOT NULL OR price_max IS NOT NULL)) as still_missing_price_range
FROM jambase_events
WHERE event_date >= CURRENT_DATE;

-- Step 7: Sample events with prices to verify formatting
SELECT 
  title,
  artist_name,
  price_range,
  price_min,
  price_max,
  price_currency,
  source
FROM jambase_events
WHERE event_date >= CURRENT_DATE
  AND (price_range IS NOT NULL OR price_min IS NOT NULL OR price_max IS NOT NULL)
ORDER BY created_at DESC
LIMIT 10;

