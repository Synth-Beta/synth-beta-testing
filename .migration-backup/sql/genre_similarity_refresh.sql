-- =============================================================================
-- GENRE SIMILARITY REFRESH — RUN ORDER
-- Run after genre_similarity_schema.sql. If any step times out, run the part
-- files separately (part1, part2, part3).
-- =============================================================================
-- 1. genre_similarity_refresh_part1_pairs.sql   — refresh genre_cooccurrence_pairs MV
-- 2. genre_similarity_refresh_part2_marginals.sql — refresh genre_marginals MV
-- 3. genre_similarity_refresh_part3_edges.sql   — repopulate genre_similarity_edges (top 25 per genre)

SELECT 'Run part1, part2, part3 in order (see comments above).' AS note;
