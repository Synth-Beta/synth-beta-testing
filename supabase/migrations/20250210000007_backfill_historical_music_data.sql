-- ============================================================
-- MIGRATION 7: Backfill Historical Music Data
-- Processes all existing user interactions and populates music tracking tables
-- This captures everything that happened BEFORE triggers were installed
-- ============================================================

-- ============================================================
-- PART 1: Backfill Artist Follows
-- ============================================================
INSERT INTO user_artist_interactions (
  user_id,
  artist_id,
  artist_name,
  jambase_artist_id,
  interaction_type,
  interaction_strength,
  genres,
  popularity_score,
  source_entity_type,
  source_entity_id,
  metadata,
  occurred_at,
  created_at
)
SELECT 
  af.user_id,
  af.artist_id,
  a.name,
  a.jambase_artist_id,
  'follow',
  7, -- Follow is strong signal
  COALESCE(ap.genres, ARRAY[]::TEXT[]),
  NULL, -- Popularity not stored in artist_profile
  'artist_follow',
  af.id::TEXT,
  jsonb_build_object(
    'backfilled', true,
    'original_date', af.created_at
  ),
  af.created_at,
  now()
FROM artist_follows af
JOIN artists a ON a.id = af.artist_id
LEFT JOIN artist_profile ap ON ap.jambase_artist_id = a.jambase_artist_id
WHERE NOT EXISTS (
  -- Don't duplicate if already captured by trigger
  SELECT 1 FROM user_artist_interactions uai
  WHERE uai.user_id = af.user_id 
    AND uai.artist_id = af.artist_id
    AND uai.source_entity_type = 'artist_follow'
    AND uai.source_entity_id = af.id::TEXT
);

-- ============================================================
-- PART 2: Backfill Event Interests (from user_jambase_events)
-- ============================================================
INSERT INTO user_artist_interactions (
  user_id,
  artist_id,
  artist_name,
  interaction_type,
  interaction_strength,
  genres,
  source_entity_type,
  source_entity_id,
  metadata,
  occurred_at,
  created_at
)
SELECT 
  uje.user_id,
  CASE 
    WHEN je.artist_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
    THEN je.artist_id::UUID
    ELSE NULL
  END as artist_id,
  je.artist_name,
  'interest',
  6, -- Interest is moderate-strong signal
  COALESCE(je.genres, ARRAY[]::TEXT[]),
  'event_interest',
  uje.id::TEXT,
  jsonb_build_object(
    'backfilled', true,
    'event_id', je.id,
    'event_title', je.title,
    'event_date', je.event_date,
    'venue', je.venue_name
  ),
  uje.created_at,
  now()
FROM user_jambase_events uje
JOIN jambase_events je ON je.id = uje.jambase_event_id
WHERE je.artist_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_artist_interactions uai
    WHERE uai.user_id = uje.user_id
      AND uai.source_entity_type = 'event_interest'
      AND uai.source_entity_id = uje.id::TEXT
  );

-- ============================================================
-- PART 3: Backfill Reviews (strongest signal)
-- ============================================================
INSERT INTO user_artist_interactions (
  user_id,
  artist_id,
  artist_name,
  interaction_type,
  interaction_strength,
  genres,
  source_entity_type,
  source_entity_id,
  metadata,
  occurred_at,
  created_at
)
SELECT 
  ur.user_id,
  CASE 
    WHEN je.artist_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
    THEN je.artist_id::UUID
    ELSE NULL
  END as artist_id,
  je.artist_name,
  'review',
  9, -- Review is strongest signal
  COALESCE(je.genres, ARRAY[]::TEXT[]) || COALESCE(ur.genre_tags, ARRAY[]::TEXT[]),
  'review',
  ur.id::TEXT,
  jsonb_build_object(
    'backfilled', true,
    'rating', ur.rating,
    'artist_performance_rating', ur.artist_performance_rating,
    'production_rating', ur.production_rating,
    'venue_rating', ur.venue_rating,
    'location_rating', ur.location_rating,
    'value_rating', ur.value_rating,
    'ticket_price_paid', ur.ticket_price_paid,
    'has_photos', (ur.photos IS NOT NULL AND array_length(ur.photos, 1) > 0),
    'has_custom_setlist', (
      ur.custom_setlist IS NOT NULL
      AND jsonb_typeof(ur.custom_setlist) = 'array'
      AND jsonb_array_length(ur.custom_setlist) > 0
    )
  ),
  ur.created_at,
  now()
FROM user_reviews ur
JOIN jambase_events je ON je.id = ur.event_id
WHERE je.artist_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_artist_interactions uai
    WHERE uai.user_id = ur.user_id
      AND uai.source_entity_type = 'review'
      AND uai.source_entity_id = ur.id::TEXT
  );

-- ============================================================
-- PART 4: Backfill Genre Interactions from Artist Follows
-- ============================================================
INSERT INTO user_genre_interactions (
  user_id,
  genre,
  interaction_type,
  interaction_count,
  artist_names,
  artist_ids,
  source_entity_type,
  source_entity_id,
  metadata,
  occurred_at,
  created_at
)
SELECT 
  af.user_id,
  unnest(COALESCE(ap.genres, ARRAY[]::TEXT[])) as genre,
  'follow',
  1,
  ARRAY[a.name],
  ARRAY[a.id],
  'artist_follow',
  af.id::TEXT,
  jsonb_build_object('backfilled', true),
  af.created_at,
  now()
FROM artist_follows af
JOIN artists a ON a.id = af.artist_id
LEFT JOIN artist_profile ap ON ap.jambase_artist_id = a.jambase_artist_id
WHERE ap.genres IS NOT NULL 
  AND array_length(ap.genres, 1) > 0
  AND NOT EXISTS (
    SELECT 1 FROM user_genre_interactions ugi
    WHERE ugi.user_id = af.user_id
      AND ugi.source_entity_type = 'artist_follow'
      AND ugi.source_entity_id = af.id::TEXT
  );

-- ============================================================
-- PART 5: Backfill Genre Interactions from Event Interests
-- ============================================================
INSERT INTO user_genre_interactions (
  user_id,
  genre,
  interaction_type,
  interaction_count,
  artist_names,
  source_entity_type,
  source_entity_id,
  metadata,
  occurred_at,
  created_at
)
SELECT 
  uje.user_id,
  unnest(je.genres) as genre,
  'interest',
  1,
  ARRAY[je.artist_name],
  'event_interest',
  uje.id::TEXT,
  jsonb_build_object('backfilled', true, 'event_id', je.id),
  uje.created_at,
  now()
FROM user_jambase_events uje
JOIN jambase_events je ON je.id = uje.jambase_event_id
WHERE je.genres IS NOT NULL 
  AND array_length(je.genres, 1) > 0
  AND NOT EXISTS (
    SELECT 1 FROM user_genre_interactions ugi
    WHERE ugi.user_id = uje.user_id
      AND ugi.source_entity_type = 'event_interest'
      AND ugi.source_entity_id = uje.id::TEXT
  );

-- ============================================================
-- PART 6: Backfill Genre Interactions from Reviews
-- ============================================================
INSERT INTO user_genre_interactions (
  user_id,
  genre,
  interaction_type,
  interaction_count,
  artist_names,
  source_entity_type,
  source_entity_id,
  metadata,
  occurred_at,
  created_at
)
SELECT 
  ur.user_id,
  unnest(COALESCE(je.genres, ARRAY[]::TEXT[]) || COALESCE(ur.genre_tags, ARRAY[]::TEXT[])) as genre,
  'review',
  1,
  ARRAY[je.artist_name],
  'review',
  ur.id::TEXT,
  jsonb_build_object('backfilled', true, 'rating', ur.rating),
  ur.created_at,
  now()
FROM user_reviews ur
JOIN jambase_events je ON je.id = ur.event_id
WHERE (je.genres IS NOT NULL AND array_length(je.genres, 1) > 0)
   OR (ur.genre_tags IS NOT NULL AND array_length(ur.genre_tags, 1) > 0)
  AND NOT EXISTS (
    SELECT 1 FROM user_genre_interactions ugi
    WHERE ugi.user_id = ur.user_id
      AND ugi.source_entity_type = 'review'
      AND ugi.source_entity_id = ur.id::TEXT
  );

-- ============================================================
-- PART 7: Backfill Song Interactions from Review Custom Setlists
-- ============================================================
INSERT INTO user_song_interactions (
  user_id,
  song_id,
  song_name,
  artist_names,
  genres,
  interaction_type,
  source_entity_type,
  source_entity_id,
  metadata,
  occurred_at,
  created_at
)
SELECT 
  ur.user_id,
  md5(song || je.artist_name), -- Generate consistent song ID
  song,
  ARRAY[je.artist_name],
  COALESCE(je.genres, ARRAY[]::TEXT[]),
  'custom_setlist_added',
  'review',
  ur.id::TEXT,
  jsonb_build_object('backfilled', true, 'review_id', ur.id),
  ur.created_at,
  now()
FROM user_reviews ur
JOIN jambase_events je ON je.id = ur.event_id
CROSS JOIN jsonb_array_elements_text(ur.custom_setlist) as song
WHERE ur.custom_setlist IS NOT NULL 
  AND jsonb_array_length(ur.custom_setlist) > 0
  AND NOT EXISTS (
    SELECT 1 FROM user_song_interactions usi
    WHERE usi.user_id = ur.user_id
      AND usi.source_entity_type = 'review'
      AND usi.source_entity_id = ur.id::TEXT
      AND usi.song_name = song
  );

-- ============================================================
-- PART 8: Backfill Venue Interactions from Venue Follows
-- ============================================================
INSERT INTO user_venue_interactions (
  user_id,
  venue_id,
  venue_name,
  interaction_type,
  interaction_strength,
  source_entity_type,
  source_entity_id,
  metadata,
  occurred_at,
  created_at
)
SELECT 
  vf.user_id,
  v.id as venue_id, -- Try to find matching venue UUID
  vf.venue_name,
  'follow',
  7, -- Follow is strong signal
  'venue_follow',
  vf.id::TEXT,
  jsonb_build_object(
    'backfilled', true,
    'venue_city', vf.venue_city,
    'venue_state', vf.venue_state
  ),
  vf.created_at,
  now()
FROM venue_follows vf
LEFT JOIN venues v ON v.name = vf.venue_name 
  AND (v.city = vf.venue_city OR vf.venue_city IS NULL)
  AND (v.state = vf.venue_state OR vf.venue_state IS NULL)
WHERE NOT EXISTS (
    SELECT 1 FROM user_venue_interactions uvi
    WHERE uvi.user_id = vf.user_id
      AND uvi.venue_name = vf.venue_name
      AND uvi.source_entity_type = 'venue_follow'
      AND uvi.source_entity_id = vf.id::TEXT
  );

-- ============================================================
-- PART 9: Backfill Venue Interactions from Event Interests
-- ============================================================
INSERT INTO user_venue_interactions (
  user_id,
  venue_id,
  venue_name,
  interaction_type,
  interaction_strength,
  typical_genres,
  artists_seen_here,
  source_entity_type,
  source_entity_id,
  metadata,
  occurred_at,
  created_at
)
SELECT 
  uje.user_id,
  v.id as venue_id, -- Only use if venue exists in venues table
  je.venue_name,
  'interest',
  5,
  COALESCE(je.genres, ARRAY[]::TEXT[]),
  ARRAY[je.artist_name],
  'event_interest',
  uje.id::TEXT,
  jsonb_build_object('backfilled', true, 'event_id', je.id),
  uje.created_at,
  now()
FROM user_jambase_events uje
JOIN jambase_events je ON je.id = uje.jambase_event_id
LEFT JOIN venues v ON v.id = je.venue_id -- Check if venue exists
WHERE je.venue_name IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_venue_interactions uvi
    WHERE uvi.user_id = uje.user_id
      AND uvi.source_entity_type = 'event_interest'
      AND uvi.source_entity_id = uje.id::TEXT
  );

-- ============================================================
-- PART 10: Backfill Streaming Profile Data (if exists)
-- ============================================================
-- This will process any existing streaming profiles
-- Extract Spotify top artists
INSERT INTO user_artist_interactions (
  user_id,
  artist_name,
  spotify_artist_id,
  interaction_type,
  interaction_strength,
  genres,
  popularity_score,
  source_entity_type,
  source_entity_id,
  metadata,
  occurred_at,
  created_at
)
SELECT 
  sp.user_id,
  artist->>'name',
  artist->>'id',
  'streaming_top',
  8, -- Streaming is strong signal
  ARRAY(SELECT jsonb_array_elements_text(COALESCE(artist->'genres', '[]'::jsonb))),
  (artist->>'popularity')::INT,
  'streaming_profile',
  sp.id::TEXT,
  jsonb_build_object('backfilled', true, 'service', sp.service_type),
  sp.last_updated,
  now()
FROM streaming_profiles sp
CROSS JOIN jsonb_array_elements(sp.profile_data->'topArtists') as artist
WHERE sp.service_type = 'spotify'
  AND sp.profile_data ? 'topArtists'
  AND artist->>'name' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_artist_interactions uai
    WHERE uai.user_id = sp.user_id
      AND uai.spotify_artist_id = artist->>'id'
      AND uai.source_entity_type = 'streaming_profile'
      AND uai.source_entity_id = sp.id::TEXT
  );

-- Extract Spotify top tracks
INSERT INTO user_song_interactions (
  user_id,
  song_id,
  song_name,
  artist_names,
  artist_ids,
  album_name,
  popularity_score,
  duration_ms,
  interaction_type,
  source_entity_type,
  source_entity_id,
  metadata,
  occurred_at,
  created_at
)
SELECT 
  sp.user_id,
  track->>'id',
  track->>'name',
  ARRAY(SELECT jsonb_array_elements(COALESCE(track->'artists', '[]'::jsonb))->>'name'),
  ARRAY(SELECT jsonb_array_elements(COALESCE(track->'artists', '[]'::jsonb))->>'id'),
  track->'album'->>'name',
  (track->>'popularity')::INT,
  (track->>'duration_ms')::INT,
  'top_track',
  'streaming_profile',
  sp.id::TEXT,
  jsonb_build_object('backfilled', true, 'service', sp.service_type),
  sp.last_updated,
  now()
FROM streaming_profiles sp
CROSS JOIN jsonb_array_elements(sp.profile_data->'topTracks') as track
WHERE sp.service_type = 'spotify'
  AND sp.profile_data ? 'topTracks'
  AND track->>'id' IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM user_song_interactions usi
    WHERE usi.user_id = sp.user_id
      AND usi.song_id = track->>'id'
      AND usi.source_entity_type = 'streaming_profile'
      AND usi.source_entity_id = sp.id::TEXT
  );

-- ============================================================
-- PART 11: Calculate and Insert Preference Signals - ARTISTS
-- ============================================================
INSERT INTO music_preference_signals (
  user_id,
  preference_type,
  preference_value,
  preference_score,
  interaction_count,
  interaction_types,
  first_interaction,
  last_interaction,
  confidence,
  updated_at
)
WITH artist_stats AS (
  SELECT 
    user_id,
    artist_name,
    interaction_type,
    COUNT(*) as type_count,
    SUM(
      CASE interaction_type
        WHEN 'review' THEN 15.0
        WHEN 'streaming_top' THEN 8.0
        WHEN 'follow' THEN 7.0
        WHEN 'interest' THEN 6.0
        WHEN 'attendance' THEN 10.0
        ELSE 5.0
      END
    ) as type_score,
    MIN(occurred_at) as first_interaction,
    MAX(occurred_at) as last_interaction
  FROM user_artist_interactions
  WHERE artist_name IS NOT NULL
  GROUP BY user_id, artist_name, interaction_type
)
SELECT 
  user_id,
  'artist',
  artist_name,
  SUM(type_score) as preference_score,
  SUM(type_count)::INT as interaction_count,
  jsonb_object_agg(interaction_type, type_count) as interaction_types,
  MIN(first_interaction) as first_interaction,
  MAX(last_interaction) as last_interaction,
  LEAST(1.0, (COUNT(DISTINCT interaction_type)::NUMERIC / 4.0) * (LOG(SUM(type_count) + 1) / 3.0)) as confidence,
  now()
FROM artist_stats
GROUP BY user_id, artist_name
ON CONFLICT (user_id, preference_type, preference_value)
DO UPDATE SET
  preference_score = EXCLUDED.preference_score,
  interaction_count = EXCLUDED.interaction_count,
  interaction_types = EXCLUDED.interaction_types,
  first_interaction = LEAST(music_preference_signals.first_interaction, EXCLUDED.first_interaction),
  last_interaction = GREATEST(music_preference_signals.last_interaction, EXCLUDED.last_interaction),
  confidence = EXCLUDED.confidence,
  updated_at = now();

-- ============================================================
-- PART 12: Calculate and Insert Preference Signals - GENRES
-- ============================================================
INSERT INTO music_preference_signals (
  user_id,
  preference_type,
  preference_value,
  preference_score,
  interaction_count,
  interaction_types,
  first_interaction,
  last_interaction,
  confidence,
  updated_at
)
WITH genre_stats AS (
  SELECT 
    user_id,
    genre,
    interaction_type,
    SUM(interaction_count) as type_count,
    SUM(
      CASE interaction_type
        WHEN 'review' THEN 10.0 * interaction_count
        WHEN 'streaming_top' THEN 6.0 * interaction_count
        WHEN 'follow' THEN 5.0 * interaction_count
        WHEN 'interest' THEN 4.0 * interaction_count
        ELSE 3.0 * interaction_count
      END
    ) as type_score,
    MIN(occurred_at) as first_interaction,
    MAX(occurred_at) as last_interaction
  FROM user_genre_interactions
  WHERE genre IS NOT NULL AND genre != ''
  GROUP BY user_id, genre, interaction_type
)
SELECT 
  user_id,
  'genre',
  genre,
  SUM(type_score) as preference_score,
  SUM(type_count)::INT as interaction_count,
  jsonb_object_agg(interaction_type, type_count) as interaction_types,
  MIN(first_interaction) as first_interaction,
  MAX(last_interaction) as last_interaction,
  LEAST(1.0, (COUNT(DISTINCT interaction_type)::NUMERIC / 4.0) * (LOG(SUM(type_count) + 1) / 3.0)) as confidence,
  now()
FROM genre_stats
GROUP BY user_id, genre
ON CONFLICT (user_id, preference_type, preference_value)
DO UPDATE SET
  preference_score = EXCLUDED.preference_score,
  interaction_count = EXCLUDED.interaction_count,
  interaction_types = EXCLUDED.interaction_types,
  first_interaction = LEAST(music_preference_signals.first_interaction, EXCLUDED.first_interaction),
  last_interaction = GREATEST(music_preference_signals.last_interaction, EXCLUDED.last_interaction),
  confidence = EXCLUDED.confidence,
  updated_at = now();

-- ============================================================
-- PART 13: Calculate and Insert Preference Signals - VENUES
-- ============================================================
INSERT INTO music_preference_signals (
  user_id,
  preference_type,
  preference_value,
  preference_score,
  interaction_count,
  interaction_types,
  first_interaction,
  last_interaction,
  confidence,
  updated_at
)
WITH venue_stats AS (
  SELECT 
    user_id,
    venue_name,
    interaction_type,
    COUNT(*) as type_count,
    SUM(interaction_strength) as type_score,
    MIN(occurred_at) as first_interaction,
    MAX(occurred_at) as last_interaction
  FROM user_venue_interactions
  WHERE venue_name IS NOT NULL
  GROUP BY user_id, venue_name, interaction_type
)
SELECT 
  user_id,
  'venue',
  venue_name,
  SUM(type_score) as preference_score,
  SUM(type_count)::INT as interaction_count,
  jsonb_object_agg(interaction_type, type_count) as interaction_types,
  MIN(first_interaction) as first_interaction,
  MAX(last_interaction) as last_interaction,
  LEAST(1.0, (COUNT(DISTINCT interaction_type)::NUMERIC / 3.0) * (LOG(SUM(type_count) + 1) / 2.5)) as confidence,
  now()
FROM venue_stats
GROUP BY user_id, venue_name
ON CONFLICT (user_id, preference_type, preference_value)
DO UPDATE SET
  preference_score = EXCLUDED.preference_score,
  interaction_count = EXCLUDED.interaction_count,
  interaction_types = EXCLUDED.interaction_types,
  first_interaction = LEAST(music_preference_signals.first_interaction, EXCLUDED.first_interaction),
  last_interaction = GREATEST(music_preference_signals.last_interaction, EXCLUDED.last_interaction),
  confidence = EXCLUDED.confidence,
  updated_at = now();

-- ============================================================
-- SUMMARY: Output backfill statistics
-- ============================================================
DO $$
DECLARE
  artist_int_count INT;
  genre_int_count INT;
  song_int_count INT;
  venue_int_count INT;
  pref_signals_count INT;
  users_with_data INT;
BEGIN
  SELECT COUNT(*) INTO artist_int_count FROM user_artist_interactions WHERE metadata->>'backfilled' = 'true';
  SELECT COUNT(*) INTO genre_int_count FROM user_genre_interactions WHERE metadata->>'backfilled' = 'true';
  SELECT COUNT(*) INTO song_int_count FROM user_song_interactions WHERE metadata->>'backfilled' = 'true';
  SELECT COUNT(*) INTO venue_int_count FROM user_venue_interactions WHERE metadata->>'backfilled' = 'true';
  SELECT COUNT(*) INTO pref_signals_count FROM music_preference_signals;
  SELECT COUNT(DISTINCT user_id) INTO users_with_data FROM music_preference_signals;
  
  RAISE NOTICE '=== BACKFILL COMPLETE ===';
  RAISE NOTICE 'Artist interactions backfilled: %', artist_int_count;
  RAISE NOTICE 'Genre interactions backfilled: %', genre_int_count;
  RAISE NOTICE 'Song interactions backfilled: %', song_int_count;
  RAISE NOTICE 'Venue interactions backfilled: %', venue_int_count;
  RAISE NOTICE 'Total preference signals: %', pref_signals_count;
  RAISE NOTICE 'Users with music data: %', users_with_data;
  RAISE NOTICE '========================';
END $$;

