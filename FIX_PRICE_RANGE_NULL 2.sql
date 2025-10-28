-- ============================================================
-- DIAGNOSTIC AND FIX FOR NULL PRICE_RANGE
-- ============================================================

-- Step 1: DIAGNOSE - Check what's happening with prices
SELECT 
  source,
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE price_range IS NOT NULL AND TRIM(price_range) != '') as has_price_range,
  COUNT(*) FILTER (WHERE price_min IS NOT NULL OR price_max IS NOT NULL) as has_structured_price,
  COUNT(*) FILTER (WHERE price_range IS NULL AND (price_min IS NOT NULL OR price_max IS NOT NULL)) as missing_price_range,
  COUNT(*) FILTER (WHERE price_range IS NOT NULL AND price_min IS NULL AND price_max IS NULL) as has_range_but_no_structured
FROM jambase_events
WHERE event_date >= CURRENT_DATE
GROUP BY source
ORDER BY source;

-- Step 2: Check sample events
SELECT 
  id,
  title,
  source,
  price_range,
  price_min,
  price_max,
  price_currency
FROM jambase_events
WHERE event_date >= CURRENT_DATE
  AND (price_range IS NOT NULL OR price_min IS NOT NULL OR price_max IS NOT NULL)
LIMIT 10;

-- Step 3: FIX - Update trigger to NOT overwrite existing price_range
CREATE OR REPLACE FUNCTION auto_populate_price_range()
RETURNS TRIGGER AS $$
BEGIN
  -- ONLY populate price_range if it's NULL or empty
  -- NEVER overwrite existing price_range values (preserves JamBase API values)
  IF (NEW.price_range IS NULL OR TRIM(COALESCE(NEW.price_range, '')) = '') 
     AND (NEW.price_min IS NOT NULL OR NEW.price_max IS NOT NULL) THEN
    NEW.price_range := format_price_range(NEW.price_min, NEW.price_max, COALESCE(NEW.price_currency, 'USD'));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 4: Backfill ONLY events that are missing price_range but have price_min/price_max
-- This won't overwrite existing price_range values
UPDATE jambase_events
SET price_range = format_price_range(price_min, price_max, COALESCE(price_currency, 'USD'))
WHERE (price_min IS NOT NULL OR price_max IS NOT NULL)
  AND (price_range IS NULL OR TRIM(COALESCE(price_range, '')) = '');

-- Step 5: VERIFY - Check results after fix
SELECT 
  source,
  COUNT(*) as total_events,
  COUNT(*) FILTER (WHERE price_range IS NOT NULL AND TRIM(price_range) != '') as has_price_range,
  COUNT(*) FILTER (WHERE price_min IS NOT NULL OR price_max IS NOT NULL) as has_structured_price
FROM jambase_events
WHERE event_date >= CURRENT_DATE
GROUP BY source
ORDER BY source;

