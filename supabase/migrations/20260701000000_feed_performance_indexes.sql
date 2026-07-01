-- These indexes are the ones confirmed missing (others like idx_events_event_date_id,
-- idx_events_lat_lng, idx_artist_follows_user_artist already exist).

-- events(artist_id) is unindexed — the feed JOINs artists on this column per row
CREATE INDEX IF NOT EXISTS idx_events_artist_id
  ON events(artist_id);

-- events(venue_id) is unindexed — same problem for venue JOINs
CREATE INDEX IF NOT EXISTS idx_events_venue_id
  ON events(venue_id);

-- GIN index on genres array — lets Postgres use index for genre overlap/unnest queries
-- instead of scanning every row's genres array
CREATE INDEX IF NOT EXISTS idx_events_genres_gin
  ON events USING GIN(genres);

-- GIN index on genre_preference_scores JSONB in user_preferences —
-- speeds up per-user genre score lookups inside the scoring CTE
CREATE INDEX IF NOT EXISTS idx_user_preferences_genre_scores_gin
  ON user_preferences USING GIN(genre_preference_scores);
