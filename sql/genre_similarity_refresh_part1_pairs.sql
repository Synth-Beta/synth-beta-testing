-- =============================================================================
-- REFRESH PART 1: Genre co-occurrence pairs (materialized view)
-- =============================================================================

SET statement_timeout = '600s';

REFRESH MATERIALIZED VIEW CONCURRENTLY genre_cooccurrence_pairs;
