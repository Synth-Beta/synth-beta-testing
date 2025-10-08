-- ============================================
-- AUDIT: Verify event_date column is TIMESTAMPTZ
-- Purpose: Ensure all values are valid TIMESTAMPTZ format
-- ============================================

-- 1. Verify column is defined as TIMESTAMPTZ
SELECT 
    column_name,
    data_type,
    udt_name,
    CASE 
        WHEN data_type = 'timestamp with time zone' THEN '✓ CORRECT'
        ELSE '✗ WRONG - Should be timestamp with time zone'
    END as status
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'jambase_events'
  AND column_name = 'event_date';

-- 2. Verify all values are valid TIMESTAMPTZ (no NULL, all valid)
SELECT 
    COUNT(*) as total_rows,
    COUNT(event_date) as valid_timestamptz_count,
    COUNT(*) - COUNT(event_date) as null_or_invalid_count,
    CASE 
        WHEN COUNT(*) = COUNT(event_date) THEN '✓ ALL VALID TIMESTAMPTZ'
        ELSE '✗ FOUND ' || (COUNT(*) - COUNT(event_date))::text || ' INVALID VALUES'
    END as status
FROM jambase_events;

-- 3. Show sample values with full TIMESTAMPTZ format
SELECT 
    jambase_event_id,
    title,
    event_date,
    pg_typeof(event_date) as data_type,
    TO_CHAR(event_date, 'YYYY-MM-DD HH24:MI:SS TZ') as formatted_timestamptz
FROM jambase_events
ORDER BY event_date DESC
LIMIT 20;

-- 4. Final verdict
SELECT 
    CASE 
        WHEN EXISTS (
            SELECT 1 
            FROM information_schema.columns 
            WHERE table_name = 'jambase_events' 
              AND column_name = 'event_date' 
              AND data_type = 'timestamp with time zone'
        ) 
        AND NOT EXISTS (
            SELECT 1 
            FROM jambase_events 
            WHERE event_date IS NULL
        )
        THEN '✓✓✓ ALL GOOD: event_date is TIMESTAMPTZ and all values are valid'
        ELSE '✗✗✗ ISSUES FOUND: Check results above'
    END as final_verdict;
