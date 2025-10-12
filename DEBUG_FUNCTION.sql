-- Check the actual function definition in the database
SELECT 
    p.proname as function_name,
    pg_get_function_result(p.oid) as return_type,
    pg_get_function_arguments(p.oid) as arguments
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
AND p.proname = 'get_personalized_events_feed_with_diversity';

-- Also check the detailed column types
SELECT 
    a.attname as column_name,
    a.attnum as column_number,
    pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
CROSS JOIN LATERAL pg_get_function_result(p.oid) AS result
JOIN pg_attribute a ON a.attrelid = (
    SELECT typrelid 
    FROM pg_type 
    WHERE oid = (
        SELECT (regexp_matches(result, 'SETOF (.*)'))[1]::regtype
    )
)
WHERE n.nspname = 'public'
AND p.proname = 'get_personalized_events_feed_with_diversity'
AND a.attnum > 0
ORDER BY a.attnum;

