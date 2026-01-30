-- =============================================================================
-- BACKFILL NORMALIZED GENRES — RUN ORDER
-- One-time backfill. Run AFTER genres_schema.sql.
--
-- If the SQL editor times out, run the PART files below one at a time.
-- If Part 2 or Part 3 still time out, use the batch variants (2a–2d, 3a–3d).
-- =============================================================================

-- RUN IN ORDER:
--
-- 1. backfill_normalized_genres_part1_genres.sql     — populate genres table
-- 2. backfill_normalized_genres_part2_artists_genres.sql   — artists_genres
--    (if timeout: run part2a, part2b, part2c, part2d instead)
-- 3. backfill_normalized_genres_part3_events_genres.sql    — events_genres
--    (if timeout: run part3a, part3b, part3c, part3d instead)
-- 4. backfill_normalized_genres_part4_verify.sql    — show counts
--
-- Each part sets statement_timeout = 600s (or 300s for batch files).
-- Supabase may still enforce a lower limit; run one part per execution.

SELECT 'Run the part files in order (see comments above). This file is instructions only.' AS note;
