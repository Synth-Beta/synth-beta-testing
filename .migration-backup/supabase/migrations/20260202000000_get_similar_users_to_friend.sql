-- ============================================================
-- get_similar_users_to_friend
-- Recommends users to add as friends based on shared artists, venues, genres.
-- Excludes: friends, blocked users, pending friend requests.
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_similar_users_to_friend(
  p_user_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  recommended_user_id UUID,
  name TEXT,
  avatar_url TEXT,
  shared_artists_count INT,
  shared_venues_count INT,
  shared_genres_count INT,
  mutual_friends_count INT,
  connection_degree INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH
  -- Exclude: self
  excluded_ids AS (
    SELECT p_user_id AS user_id
    UNION
    -- Already friends
    SELECT CASE WHEN ur.user_id = p_user_id THEN ur.related_user_id ELSE ur.user_id END
    FROM user_relationships ur
    WHERE ur.relationship_type = 'friend'
      AND ur.status = 'accepted'
      AND (ur.user_id = p_user_id OR ur.related_user_id = p_user_id)
    UNION
    -- Pending friend requests (either direction)
    SELECT CASE WHEN ur.user_id = p_user_id THEN ur.related_user_id ELSE ur.user_id END
    FROM user_relationships ur
    WHERE ur.relationship_type = 'friend'
      AND ur.status = 'pending'
      AND (ur.user_id = p_user_id OR ur.related_user_id = p_user_id)
    UNION
    -- Blocked (either direction: I blocked them, or they blocked me)
    SELECT CASE WHEN ur.user_id = p_user_id THEN ur.related_user_id ELSE ur.user_id END
    FROM user_relationships ur
    WHERE ur.relationship_type = 'block'
      AND (ur.user_id = p_user_id OR ur.related_user_id = p_user_id)
  ),
  -- Candidates: users who share at least one artist, venue, or genre with p_user_id
  candidates AS (
    SELECT DISTINCT other.user_id
    FROM (
      -- Shared artists
      SELECT af2.user_id
      FROM artist_follows af1
      JOIN artist_follows af2 ON af1.artist_id = af2.artist_id AND af2.user_id != p_user_id
      WHERE af1.user_id = p_user_id
      UNION
      -- Shared venues (user_venue_relationships - 3NF; venue_follows was dropped)
      SELECT uvr2.user_id
      FROM user_venue_relationships uvr1
      JOIN user_venue_relationships uvr2 ON uvr1.venue_id = uvr2.venue_id AND uvr2.user_id != p_user_id
      WHERE uvr1.user_id = p_user_id
      UNION
      -- Shared genres (user_genre_interactions)
      SELECT ugi2.user_id
      FROM user_genre_interactions ugi1
      JOIN user_genre_interactions ugi2 ON ugi1.genre = ugi2.genre AND ugi2.user_id != p_user_id
      WHERE ugi1.user_id = p_user_id
      UNION
      -- Shared genres (music_preference_signals)
      SELECT mps2.user_id
      FROM music_preference_signals mps1
      JOIN music_preference_signals mps2 ON mps1.preference_type = 'genre'
        AND mps2.preference_type = 'genre'
        AND mps1.preference_value = mps2.preference_value
        AND mps2.user_id != p_user_id
      WHERE mps1.user_id = p_user_id
    ) other
    WHERE other.user_id NOT IN (SELECT user_id FROM excluded_ids)
  ),
  -- Score each candidate
  scored AS (
    SELECT
      c.user_id,
      COALESCE(sa.cnt, 0)::INT AS shared_artists_count,
      COALESCE(sv.cnt, 0)::INT AS shared_venues_count,
      COALESCE(sg.cnt, 0)::INT AS shared_genres_count,
      COALESCE(mf.cnt, 0)::INT AS mutual_friends_count
    FROM candidates c
    LEFT JOIN (
      SELECT af2.user_id, COUNT(DISTINCT af1.artist_id)::INT AS cnt
      FROM artist_follows af1
      JOIN artist_follows af2 ON af1.artist_id = af2.artist_id
      WHERE af1.user_id = p_user_id
      GROUP BY af2.user_id
    ) sa ON sa.user_id = c.user_id
    LEFT JOIN (
      SELECT uvr2.user_id, COUNT(DISTINCT uvr1.venue_id)::INT AS cnt
      FROM user_venue_relationships uvr1
      JOIN user_venue_relationships uvr2 ON uvr1.venue_id = uvr2.venue_id
      WHERE uvr1.user_id = p_user_id
      GROUP BY uvr2.user_id
    ) sv ON sv.user_id = c.user_id
    LEFT JOIN (
      SELECT u2.user_id, COUNT(DISTINCT g.genre)::INT AS cnt
      FROM (
        SELECT genre FROM user_genre_interactions WHERE user_id = p_user_id
        UNION
        SELECT preference_value FROM music_preference_signals WHERE user_id = p_user_id AND preference_type = 'genre'
      ) g
      JOIN (
        SELECT user_id, genre FROM user_genre_interactions
        UNION ALL
        SELECT user_id, preference_value FROM music_preference_signals WHERE preference_type = 'genre'
      ) u2 ON u2.genre = g.genre
      WHERE u2.user_id IN (SELECT user_id FROM candidates)
      GROUP BY u2.user_id
    ) sg ON sg.user_id = c.user_id
    LEFT JOIN (
      WITH my_friends AS (
        SELECT CASE WHEN ur.user_id = p_user_id THEN ur.related_user_id ELSE ur.user_id END AS fid
        FROM user_relationships ur
        WHERE ur.relationship_type = 'friend' AND ur.status = 'accepted'
          AND (ur.user_id = p_user_id OR ur.related_user_id = p_user_id)
      ),
      expanded AS (
        SELECT c.user_id AS cand_id,
          CASE WHEN ur.user_id = c.user_id THEN ur.related_user_id ELSE ur.user_id END AS their_friend_id
        FROM candidates c
        JOIN user_relationships ur ON ur.relationship_type = 'friend' AND ur.status = 'accepted'
          AND (ur.user_id = c.user_id OR ur.related_user_id = c.user_id)
      )
      SELECT expanded.cand_id AS user_id, COUNT(*)::INT AS cnt
      FROM expanded
      WHERE expanded.their_friend_id IN (SELECT fid FROM my_friends)
      GROUP BY expanded.cand_id
    ) mf ON mf.user_id = c.user_id
  )
  SELECT
    s.user_id AS recommended_user_id,
    u.name,
    u.avatar_url,
    s.shared_artists_count,
    s.shared_venues_count,
    s.shared_genres_count,
    s.mutual_friends_count,
    CASE WHEN s.mutual_friends_count > 0 THEN 2 ELSE 3 END AS connection_degree
  FROM scored s
  JOIN users u ON u.user_id = s.user_id
  WHERE (s.shared_artists_count + s.shared_venues_count + s.shared_genres_count) > 0
  ORDER BY
    (s.shared_artists_count * 2 + s.shared_venues_count + s.shared_genres_count * 2 + s.mutual_friends_count) DESC,
    s.mutual_friends_count DESC
  LIMIT p_limit;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_similar_users_to_friend(UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_similar_users_to_friend(UUID, INT) TO service_role;

COMMENT ON FUNCTION public.get_similar_users_to_friend(UUID, INT) IS
  'Returns users to add as friends, ranked by shared artists, venues, genres. Excludes friends, blocked, and pending requests.';
