-- READ-ONLY. Nothing here writes.
--
-- The VERIFY run showed artist_matched_rows = 0 or 1 for all 10 sampled users,
-- meaning the 16.0 * LN(1 + artist_sum) term -- the heaviest coefficient in
-- get_personalized_feed_v5 -- effectively never fires. Three very different
-- causes produce that same symptom, and they need different fixes:
--
--   (a) users have no artist signals at all      -> fix the signal writers
--   (b) artist_preference_scores keys do not      -> fix the key format
--       match events.artist_id (same class of
--       bug as the genre name/slug mismatch)
--   (c) keys are correct, those artists simply    -> artist-to-artist
--       have no shows near the user in 90 days       similarity is the only fix
--
-- This tells you which, per user, in one pass.

WITH sample_users AS (
  SELECT up.user_id, up.artist_preference_scores AS a_s
  FROM public.user_preferences up
  WHERE up.artist_preference_scores <> '{}'::jsonb
  ORDER BY up.signal_count DESC NULLS LAST
  LIMIT 15
),
-- Explode the score map into one row per scored artist.
pref_artists AS (
  SELECT su.user_id, k.key AS artist_key, (k.value)::TEXT::NUMERIC AS score
  FROM sample_users su
  CROSS JOIN LATERAL jsonb_each(su.a_s) AS k(key, value)
),
-- Last location the user's feed was actually served at.
user_loc AS (
  SELECT su.user_id,
         (SELECT c.city_lat FROM public.personalized_feed_cache c
          WHERE c.user_id = su.user_id ORDER BY c.created_at DESC LIMIT 1) AS lat,
         (SELECT c.city_lng FROM public.personalized_feed_cache c
          WHERE c.user_id = su.user_id ORDER BY c.created_at DESC LIMIT 1) AS lng
  FROM sample_users su
),
resolved AS (
  SELECT
    pa.user_id,
    pa.artist_key,
    pa.score,
    -- (b): does this key even parse as a uuid that exists in artists?
    (a.id IS NOT NULL) AS key_is_valid_artist,
    -- (c) part 1: does this artist play ANYWHERE in the feed window?
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.artist_id = a.id
        AND e.event_date BETWEEN now() AND now() + INTERVAL '90 days'
    ) AS has_upcoming_anywhere,
    -- (c) part 2: does this artist play inside the user's ~50mi feed box?
    EXISTS (
      SELECT 1 FROM public.events e
      WHERE e.artist_id = a.id
        AND e.event_date BETWEEN now() AND now() + INTERVAL '90 days'
        AND ul.lat IS NOT NULL AND ul.lng IS NOT NULL
        AND e.latitude  BETWEEN ul.lat - (50.0/69.0) AND ul.lat + (50.0/69.0)
        AND e.longitude BETWEEN ul.lng - (50.0/(69.0*COS(RADIANS(ul.lat))))
                            AND ul.lng + (50.0/(69.0*COS(RADIANS(ul.lat))))
    ) AS has_upcoming_local
  FROM pref_artists pa
  JOIN user_loc ul ON ul.user_id = pa.user_id
  -- key must look like a uuid before casting, or a malformed key raises
  LEFT JOIN public.artists a
    ON pa.artist_key ~ '^[0-9a-fA-F-]{36}$' AND a.id = pa.artist_key::uuid
)
SELECT
  user_id,
  COUNT(*)                                             AS scored_artists,
  COUNT(*) FILTER (WHERE key_is_valid_artist)          AS keys_resolve_to_real_artist,
  COUNT(*) FILTER (WHERE has_upcoming_anywhere)        AS artists_touring_anywhere_90d,
  COUNT(*) FILTER (WHERE has_upcoming_local)           AS artists_playing_locally_90d
FROM resolved
GROUP BY user_id
ORDER BY scored_artists DESC;

-- HOW TO READ IT
-- --------------
-- keys_resolve_to_real_artist << scored_artists
--     Cause (b). The key format is wrong -- a repeat of the genre slug/name
--     bug on the artist axis. Cheapest and highest-value outcome: it means
--     artist personalization has silently never worked, and fixing the key
--     format turns the heaviest coefficient in the ranker back on with no
--     new modeling at all. Fix this before anything else.
--
-- keys resolve fine, but artists_touring_anywhere_90d is near 0
--     The user's taste is in artists who are not on tour right now. Nothing
--     to fix in the ranker -- this is the structural cold-start reality.
--     Artist-to-artist similarity is the only lever.
--
-- artists_touring_anywhere_90d healthy, artists_playing_locally_90d near 0
--     Cause (c), the expected result. Their artists tour, just not here.
--     Confirms similarity (shared-genre-vector over artists.genres to start)
--     is the right next build, and quantifies the ceiling: exact-artist
--     matching can never serve more than artists_playing_locally_90d slots.
--
-- Note: any user with NULL lat/lng (no cache row) will show
-- artists_playing_locally_90d = 0 regardless. Cross-check against
-- artists_touring_anywhere_90d before concluding anything for those rows.
