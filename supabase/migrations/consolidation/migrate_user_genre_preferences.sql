-- ============================================
-- MIGRATE USER GENRE PREFERENCES
-- ============================================
-- Migrates data from multiple interaction tables into unified user_genre_preferences
-- Sources: user_genre_interactions, user_artist_interactions, user_song_interactions,
--         relationships (event interests), reviews (event attendance/reviews)

-- ============================================
-- 1. MIGRATE FROM user_genre_interactions
-- ============================================
INSERT INTO public.user_genre_preferences (
  id,
  user_id,
  genre,
  subgenre,
  interaction_type,
  source_entity_type,
  source_entity_id,
  preference_score,
  context,
  occurred_at,
  created_at,
  updated_at,
  metadata
)
SELECT 
  gen_random_uuid(),
  ugi.user_id,
  ugi.genre,
  CASE WHEN array_length(ugi.subgenres, 1) > 0 THEN ugi.subgenres[1] ELSE NULL END,
  CASE 
    -- Map old interaction_type values to new valid values
    WHEN ugi.interaction_type = 'interest' THEN 'genre_exposure'  -- Map 'interest' to 'genre_exposure'
    WHEN ugi.interaction_type IN ('event_interest', 'event_review', 'event_attendance', 'event_like', 'event_share',
                                  'artist_follow', 'artist_unfollow', 'artist_review', 'artist_search', 'artist_view',
                                  'song_streamed', 'song_top_track', 'song_recent', 'song_review_mentioned', 'song_setlist_viewed', 'song_custom_setlist',
                                  'venue_follow', 'venue_review', 'venue_attendance',
                                  'genre_exposure', 'genre_search', 'manual_preference') THEN ugi.interaction_type
    ELSE 'genre_exposure'  -- Default fallback for unknown types
  END as interaction_type,
  CASE 
    -- Map source_entity_type to valid values
    WHEN ugi.source_entity_type IN ('event', 'artist', 'song', 'venue', 'review', 'streaming_profile', 'manual') THEN ugi.source_entity_type::TEXT
    WHEN ugi.source_entity_type = 'event_interest' THEN 'event'  -- Fix incorrect source_entity_type
    ELSE 'manual'  -- Default fallback
  END as source_entity_type,
  CASE 
    WHEN ugi.source_entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' 
    THEN ugi.source_entity_id::UUID 
    ELSE NULL 
  END,
  ugi.interaction_count::NUMERIC,  -- Use interaction_count as preference_score
  jsonb_build_object(
    'artist_names', ugi.artist_names,
    'artist_ids', ugi.artist_ids,
    'interaction_count', ugi.interaction_count
  ),
  ugi.occurred_at,
  ugi.created_at,
  ugi.created_at as updated_at,  -- user_genre_interactions doesn't have updated_at
  jsonb_build_object(
    'original_table', 'user_genre_interactions',
    'original_id', ugi.id
  )
FROM public.user_genre_interactions ugi
WHERE ugi.user_id IS NOT NULL
  AND ugi.genre IS NOT NULL
  AND ugi.genre != ''
ON CONFLICT DO NOTHING;

-- ============================================
-- 2. MIGRATE FROM user_artist_interactions
-- ============================================
-- Extract genres from artist interactions
INSERT INTO public.user_genre_preferences (
  id,
  user_id,
  genre,
  interaction_type,
  source_entity_type,
  source_entity_id,
  source_entity_name,
  preference_score,
  context,
  occurred_at,
  created_at,
  updated_at,
  metadata
)
SELECT 
  gen_random_uuid(),
  uai.user_id,
  genre_val as genre,
  CASE 
    WHEN uai.interaction_type IN ('follow', 'unfollow') THEN 
      CASE WHEN uai.interaction_type = 'follow' THEN 'artist_follow' ELSE 'artist_unfollow' END
    WHEN uai.interaction_type = 'review' THEN 'artist_review'
    WHEN uai.interaction_type = 'search' THEN 'artist_search'
    WHEN uai.interaction_type = 'view' THEN 'artist_view'
    ELSE 'artist_view'
  END,
  'artist',
  uai.artist_id,
  uai.artist_name,
  uai.interaction_strength::NUMERIC,  -- Use interaction_strength as preference_score
  jsonb_build_object(
    'interaction_strength', uai.interaction_strength,
    'popularity_score', uai.popularity_score,
    'jambase_artist_id', uai.jambase_artist_id,
    'spotify_artist_id', uai.spotify_artist_id
  ),
  uai.occurred_at,
  uai.created_at,
  uai.created_at as updated_at,  -- user_artist_interactions doesn't have updated_at
  jsonb_build_object(
    'original_table', 'user_artist_interactions',
    'original_id', uai.id
  )
FROM public.user_artist_interactions uai
CROSS JOIN LATERAL unnest(COALESCE(uai.genres, ARRAY[]::TEXT[])) as genre_val
WHERE uai.genres IS NOT NULL AND array_length(uai.genres, 1) > 0
ON CONFLICT DO NOTHING;

-- ============================================
-- 3. MIGRATE FROM user_song_interactions
-- ============================================
-- Extract genres from song interactions
INSERT INTO public.user_genre_preferences (
  id,
  user_id,
  genre,
  interaction_type,
  source_entity_type,
  source_entity_id,
  source_entity_name,
  preference_score,
  context,
  occurred_at,
  created_at,
  updated_at,
  metadata
)
SELECT 
  gen_random_uuid(),
  usi.user_id,
  genre_val as genre,
  CASE 
    WHEN usi.interaction_type = 'streamed' THEN 'song_streamed'
    WHEN usi.interaction_type = 'top_track' THEN 'song_top_track'
    WHEN usi.interaction_type = 'review_mentioned' THEN 'song_review_mentioned'
    WHEN usi.interaction_type = 'setlist_viewed' THEN 'song_setlist_viewed'
    WHEN usi.interaction_type = 'custom_setlist_added' THEN 'song_custom_setlist'
    WHEN usi.interaction_type = 'searched' THEN 'song_streamed'
    ELSE 'song_streamed'
  END,
  'song',
  usi.song_id::UUID,  -- Cast song_id to UUID if possible, else NULL
  usi.song_name,
  CASE 
    WHEN usi.interaction_type = 'top_track' THEN 6.0::NUMERIC
    WHEN usi.interaction_type = 'streamed' THEN 3.0::NUMERIC
    ELSE 2.0::NUMERIC
  END as preference_score,
  jsonb_build_object(
    'song_name', usi.song_name,
    'artist_names', usi.artist_names,
    'album_name', usi.album_name,
    'popularity_score', usi.popularity_score,
    'duration_ms', usi.duration_ms,
    'played_at', usi.played_at
  ),
  COALESCE(usi.played_at, usi.occurred_at),
  usi.created_at,
  usi.created_at as updated_at,  -- user_song_interactions doesn't have updated_at
  jsonb_build_object(
    'original_table', 'user_song_interactions',
    'original_id', usi.id
  )
FROM public.user_song_interactions usi
CROSS JOIN LATERAL unnest(COALESCE(usi.genres, ARRAY[]::TEXT[])) as genre_val
WHERE usi.genres IS NOT NULL AND array_length(usi.genres, 1) > 0
ON CONFLICT DO NOTHING;

-- ============================================
-- 4. MIGRATE FROM relationships (event interests)
-- ============================================
-- Extract genres from events that users are interested in/going to
INSERT INTO public.user_genre_preferences (
  id,
  user_id,
  genre,
  interaction_type,
  source_entity_type,
  source_entity_id,
  source_entity_name,
  preference_score,
  context,
  occurred_at,
  created_at,
  updated_at,
  metadata
)
SELECT 
  gen_random_uuid(),
  r.user_id,
  genre_val as genre,
  CASE 
    WHEN r.relationship_type = 'going' THEN 'event_interest'
    WHEN r.relationship_type = 'interest' THEN 'event_interest'
    WHEN r.relationship_type = 'maybe' THEN 'event_interest'
    ELSE 'event_interest'
  END,
  'event',
  r.related_entity_id::UUID,  -- Cast TEXT to UUID
  e.title,
  CASE 
    WHEN r.relationship_type = 'going' THEN 5.0::NUMERIC
    WHEN r.relationship_type = 'interest' THEN 4.0::NUMERIC
    WHEN r.relationship_type = 'maybe' THEN 3.0::NUMERIC
    ELSE 3.0::NUMERIC
  END,
  jsonb_build_object(
    'relationship_type', r.relationship_type,
    'artist_name', e.artist_name,
    'venue_name', e.venue_name,
    'event_date', e.event_date
  ),
  COALESCE(r.created_at, e.event_date),
  r.created_at,
  r.updated_at,
  jsonb_build_object(
    'original_table', 'relationships',
    'original_id', r.id
  )
FROM public.relationships r
INNER JOIN public.events e ON r.related_entity_id::UUID = e.id
CROSS JOIN LATERAL unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre_val
WHERE r.related_entity_type = 'event'
  AND r.relationship_type IN ('going', 'interest', 'maybe')
  AND e.genres IS NOT NULL 
  AND array_length(e.genres, 1) > 0
ON CONFLICT DO NOTHING;

-- ============================================
-- 5. MIGRATE FROM reviews (event attendance/reviews)
-- ============================================
-- Extract genres from events that users reviewed/attended
INSERT INTO public.user_genre_preferences (
  id,
  user_id,
  genre,
  interaction_type,
  source_entity_type,
  source_entity_id,
  source_entity_name,
  preference_score,
  context,
  occurred_at,
  created_at,
  updated_at,
  metadata
)
SELECT 
  gen_random_uuid(),
  rev.user_id,
  genre_val as genre,
  CASE 
    WHEN rev.was_there = true THEN 'event_attendance'
    ELSE 'event_review'
  END,
  'event',
  rev.event_id,  -- event_id (reviews table uses event_id directly)
  e.title,
  CASE 
    WHEN rev.was_there = true THEN 10.0::NUMERIC  -- Attendance = strongest signal
    WHEN rev.rating >= 4 THEN 8.0::NUMERIC
    WHEN rev.rating >= 3 THEN 6.0::NUMERIC
    ELSE 4.0::NUMERIC
  END,
  jsonb_build_object(
    'rating', rev.rating,
    'was_there', rev.was_there,
    'artist_name', e.artist_name,
    'venue_name', e.venue_name,
    'event_date', e.event_date
  ),
  COALESCE(rev.created_at, e.event_date),
  rev.created_at,
  rev.updated_at,
  jsonb_build_object(
    'original_table', 'reviews',
    'original_id', rev.id
  )
FROM public.reviews rev
INNER JOIN public.events e ON rev.event_id = e.id  -- reviews table uses event_id, not entity_id
CROSS JOIN LATERAL unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre_val
WHERE rev.event_id IS NOT NULL  -- Filter for event reviews only
  AND e.genres IS NOT NULL 
  AND array_length(e.genres, 1) > 0
ON CONFLICT DO NOTHING;

-- ============================================
-- 6. MIGRATE FROM engagements (event likes)
-- ============================================
-- Extract genres from events that users liked
INSERT INTO public.user_genre_preferences (
  id,
  user_id,
  genre,
  interaction_type,
  source_entity_type,
  source_entity_id,
  source_entity_name,
  preference_score,
  context,
  occurred_at,
  created_at,
  updated_at,
  metadata
)
SELECT 
  gen_random_uuid(),
  eng.user_id,
  genre_val as genre,
  'event_like',
  'event',
  eng.entity_id,
  e.title,
  4.0::NUMERIC,  -- Like = moderate signal
  jsonb_build_object(
    'engagement_type', eng.engagement_type,
    'engagement_value', eng.engagement_value
  ),
  eng.created_at,
  eng.created_at,
  eng.created_at as updated_at,  -- engagements table doesn't have updated_at
  jsonb_build_object(
    'original_table', 'engagements',
    'original_id', eng.id
  )
FROM public.engagements eng
INNER JOIN public.events e ON eng.entity_id = e.id
CROSS JOIN LATERAL unnest(COALESCE(e.genres, ARRAY[]::TEXT[])) as genre_val
WHERE eng.entity_type = 'event'
  AND eng.engagement_type = 'like'
  AND e.genres IS NOT NULL 
  AND array_length(e.genres, 1) > 0
ON CONFLICT DO NOTHING;

-- ============================================
-- VERIFICATION QUERY
-- ============================================
SELECT 
  'user_genre_interactions' as source_table,
  COUNT(*) as migrated_count,
  (SELECT COUNT(*) FROM public.user_genre_interactions) as source_count
FROM public.user_genre_preferences
WHERE metadata->>'original_table' = 'user_genre_interactions'

UNION ALL

SELECT 
  'user_artist_interactions' as source_table,
  COUNT(*) as migrated_count,
  (SELECT COUNT(*) FROM public.user_artist_interactions WHERE genres IS NOT NULL AND array_length(genres, 1) > 0) as source_count
FROM public.user_genre_preferences
WHERE metadata->>'original_table' = 'user_artist_interactions'

UNION ALL

SELECT 
  'user_song_interactions' as source_table,
  COUNT(*) as migrated_count,
  (SELECT COUNT(*) FROM public.user_song_interactions WHERE genres IS NOT NULL AND array_length(genres, 1) > 0) as source_count
FROM public.user_genre_preferences
WHERE metadata->>'original_table' = 'user_song_interactions'

UNION ALL

SELECT 
  'relationships (event interests)' as source_table,
  COUNT(*) as migrated_count,
  (SELECT COUNT(*) 
   FROM public.relationships r
   INNER JOIN public.events e ON r.related_entity_id::UUID = e.id
   WHERE r.related_entity_type = 'event'
     AND r.relationship_type IN ('going', 'interest', 'maybe')
     AND e.genres IS NOT NULL 
     AND array_length(e.genres, 1) > 0) as source_count
FROM public.user_genre_preferences
WHERE metadata->>'original_table' = 'relationships'

UNION ALL

SELECT 
  'reviews (event attendance)' as source_table,
  COUNT(*) as migrated_count,
  (SELECT COUNT(*) 
   FROM public.reviews rev
   INNER JOIN public.events e ON rev.event_id = e.id
   WHERE rev.event_id IS NOT NULL
     AND e.genres IS NOT NULL 
     AND array_length(e.genres, 1) > 0) as source_count
FROM public.user_genre_preferences
WHERE metadata->>'original_table' = 'reviews'

UNION ALL

SELECT 
  'engagements (event likes)' as source_table,
  COUNT(*) as migrated_count,
  (SELECT COUNT(*) 
   FROM public.engagements eng
   INNER JOIN public.events e ON eng.entity_id = e.id
   WHERE eng.entity_type = 'event'
     AND eng.engagement_type = 'like'
     AND e.genres IS NOT NULL 
     AND array_length(e.genres, 1) > 0) as source_count
FROM public.user_genre_preferences
WHERE metadata->>'original_table' = 'engagements';

