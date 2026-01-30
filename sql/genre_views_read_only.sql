-- Views that expose normalized/canonical genres at read time.
-- Base tables artists and events are never modified.
-- Use these views (or normalize_genre_array() in your queries) for:
--   co-occurrence, embeddings, taxonomy, materialized paths, feeds.

-- Artists: all columns plus normalized_genres (drop list + alias map applied)
CREATE OR REPLACE VIEW artists_with_normalized_genres AS
SELECT
  a.*,
  normalize_genre_array(a.genres) AS normalized_genres
FROM artists a;

-- Events: all columns plus normalized_genres
CREATE OR REPLACE VIEW events_with_normalized_genres AS
SELECT
  e.*,
  normalize_genre_array(e.genres) AS normalized_genres
FROM events e;
