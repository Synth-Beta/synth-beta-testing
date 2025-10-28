-- ============================================================
-- STANDARDIZE PRICE_RANGE COLUMN
-- ============================================================
-- Ensures price_range is always populated from price_min/price_max
-- for consistent display across all APIs (Ticketmaster, JamBase, etc.)

-- Step 1: Create function to format price_range from price_min/price_max
CREATE OR REPLACE FUNCTION format_price_range(
  p_price_min DECIMAL,
  p_price_max DECIMAL,
  p_price_currency TEXT DEFAULT 'USD'
)
RETURNS TEXT AS $$
DECLARE
  v_currency_symbol TEXT;
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
    ELSE p_price_currency || ' '
  END;
  
  -- Format based on available values
  IF p_price_min IS NOT NULL AND p_price_max IS NOT NULL THEN
    IF p_price_min = p_price_max THEN
      RETURN v_currency_symbol || p_price_min::TEXT;
    ELSE
      RETURN v_currency_symbol || p_price_min::TEXT || ' - ' || v_currency_symbol || p_price_max::TEXT;
    END IF;
  ELSIF p_price_min IS NOT NULL THEN
    RETURN v_currency_symbol || p_price_min::TEXT || '+';
  ELSIF p_price_max IS NOT NULL THEN
    RETURN 'Up to ' || v_currency_symbol || p_price_max::TEXT;
  END IF;
  
  RETURN NULL;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

COMMENT ON FUNCTION format_price_range IS 'Formats price_range string from structured price_min/price_max/price_currency for consistent display';

-- Step 2: Create trigger function to auto-populate price_range
CREATE OR REPLACE FUNCTION auto_populate_price_range()
RETURNS TRIGGER AS $$
BEGIN
  -- ONLY populate price_range if:
  -- 1. price_range is NULL or empty (whitespace only)
  -- 2. AND we have price_min or price_max to work with
  -- NEVER overwrite an existing non-empty price_range (preserves JamBase API values)
  IF (NEW.price_range IS NULL OR TRIM(COALESCE(NEW.price_range, '')) = '') 
     AND (NEW.price_min IS NOT NULL OR NEW.price_max IS NOT NULL) THEN
    NEW.price_range := format_price_range(NEW.price_min, NEW.price_max, COALESCE(NEW.price_currency, 'USD'));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create trigger
DROP TRIGGER IF EXISTS trigger_auto_populate_price_range ON jambase_events;
CREATE TRIGGER trigger_auto_populate_price_range
  BEFORE INSERT OR UPDATE ON jambase_events
  FOR EACH ROW
  WHEN (NEW.price_min IS NOT NULL OR NEW.price_max IS NOT NULL)
  EXECUTE FUNCTION auto_populate_price_range();

COMMENT ON TRIGGER trigger_auto_populate_price_range ON jambase_events IS 'Auto-populates price_range from price_min/price_max when those fields are set';

-- Step 4: Backfill existing events that have price_min/price_max but no price_range
UPDATE jambase_events
SET price_range = format_price_range(price_min, price_max, COALESCE(price_currency, 'USD'))
WHERE (price_min IS NOT NULL OR price_max IS NOT NULL)
  AND (price_range IS NULL OR TRIM(price_range) = '');

-- Step 5: Verification query (commented out - can be run manually)
-- SELECT 
--   COUNT(*) FILTER (WHERE price_min IS NOT NULL OR price_max IS NOT NULL) as events_with_prices,
--   COUNT(*) FILTER (WHERE price_range IS NOT NULL AND TRIM(price_range) != '') as events_with_price_range,
--   COUNT(*) FILTER (WHERE (price_min IS NOT NULL OR price_max IS NOT NULL) 
--                      AND (price_range IS NULL OR TRIM(price_range) = '')) as events_missing_price_range
-- FROM jambase_events
-- WHERE event_date >= CURRENT_DATE;

COMMENT ON COLUMN jambase_events.price_range IS 'Formatted price display string (e.g., "$50 - $150"). Auto-populated from price_min/price_max if not provided.';

