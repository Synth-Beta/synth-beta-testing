-- Read-only. Run in the Supabase SQL editor to see what is actually slow in production
-- (feed, chats, search…). Nothing here changes data or schema.
-- Needs the pg_stat_statements extension (on by default on Supabase).

-- 1. Top 25 statements by TOTAL time: what the database spends most of its time on.
--    get_personalized_feed_v5 / get_calendar_events /
--    search_*_fuzzy will show up here if they are the bottleneck.
SELECT
  round(total_exec_time::numeric / 1000, 1)        AS total_s,
  calls,
  round(mean_exec_time::numeric, 1)                AS mean_ms,
  round(max_exec_time::numeric, 1)                 AS max_ms,
  rows / NULLIF(calls, 0)                          AS rows_per_call,
  left(regexp_replace(query, '\s+', ' ', 'g'), 160) AS query
FROM pg_stat_statements
WHERE query NOT ILIKE '%pg_stat_statements%'
ORDER BY total_exec_time DESC
LIMIT 25;

-- 2. Slowest on AVERAGE (called at least 20 times): what users feel as lag.
SELECT
  round(mean_exec_time::numeric, 1) AS mean_ms,
  round(max_exec_time::numeric, 1)  AS max_ms,
  calls,
  left(regexp_replace(query, '\s+', ' ', 'g'), 160) AS query
FROM pg_stat_statements
WHERE calls >= 20
ORDER BY mean_exec_time DESC
LIMIT 25;

-- 3. Tables read mostly by sequential scans (each one is a candidate for an index).
SELECT
  relname,
  seq_scan,
  idx_scan,
  n_live_tup                                   AS rows,
  round(100.0 * seq_scan / NULLIF(seq_scan + idx_scan, 0), 1) AS pct_seq
FROM pg_stat_user_tables
WHERE schemaname = 'public' AND n_live_tup > 5000
ORDER BY seq_scan * n_live_tup DESC
LIMIT 20;

-- 4. Feed and chat functions: copy the function name into EXPLAIN to see its plan, e.g.
--    EXPLAIN (ANALYZE, BUFFERS) SELECT * FROM public.get_personalized_feed_v5(<args>);
--    Then share the output and the function body (\sf public.get_personalized_feed_v5)
--    and they can be tuned the same way search was (see README.md).
SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('get_personalized_feed_v5', 'get_calendar_events',
                    'get_my_chat_unread_counts', 'get_chat_sender_profiles', 'get_just_announced_events');
