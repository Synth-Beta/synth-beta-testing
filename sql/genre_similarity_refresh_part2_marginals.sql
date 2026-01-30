-- =============================================================================
-- REFRESH PART 2: Genre marginals (materialized view)
-- =============================================================================

SET statement_timeout = '300s';

REFRESH MATERIALIZED VIEW CONCURRENTLY genre_marginals;
