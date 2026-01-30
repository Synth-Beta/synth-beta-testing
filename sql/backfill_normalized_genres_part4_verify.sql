-- =============================================================================
-- BACKFILL PART 4: Verification (run last)
-- =============================================================================

SELECT 'genres' AS table_name, count(*) AS row_count FROM genres
UNION ALL
SELECT 'artists_genres', count(*) FROM artists_genres
UNION ALL
SELECT 'events_genres', count(*) FROM events_genres
UNION ALL
SELECT 'artists with genres', count(DISTINCT artist_id) FROM artists_genres
UNION ALL
SELECT 'events with genres', count(DISTINCT event_id) FROM events_genres;
