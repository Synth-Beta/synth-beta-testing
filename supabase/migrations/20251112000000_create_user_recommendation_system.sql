  -- ============================================================
-- User Recommendation System
-- Creates a cached recommendation system that finds users
-- in the current user's network and recommends 5-10 users
-- based on shared interests, event attendance, and network proximity
-- ============================================================

-- ============================================================
-- PART A: Create Cache Table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.user_recommendations_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommended_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recommendation_score NUMERIC NOT NULL,
  connection_degree INT NOT NULL CHECK (connection_degree IN (0, 1, 2, 3)),
  connection_label TEXT NOT NULL CHECK (connection_label IN ('Friend', 'Mutual Friend', 'Mutual Friends +', 'Stranger')),
  shared_artists_count INT DEFAULT 0,
  shared_venues_count INT DEFAULT 0,
  shared_genres_count INT DEFAULT 0,
  shared_events_count INT DEFAULT 0,
  mutual_friends_count INT DEFAULT 0,
  recommendation_reasons TEXT[] DEFAULT '{}',
  last_calculated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, recommended_user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_recommendations_cache_user_id_score 
  ON public.user_recommendations_cache(user_id, recommendation_score DESC);
CREATE INDEX IF NOT EXISTS idx_user_recommendations_cache_user_id_calculated 
  ON public.user_recommendations_cache(user_id, last_calculated_at);
CREATE INDEX IF NOT EXISTS idx_user_recommendations_cache_recommended_user_id 
  ON public.user_recommendations_cache(recommended_user_id);

-- Enable RLS
ALTER TABLE public.user_recommendations_cache ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their own recommendations
CREATE POLICY "Users can view their own recommendations"
  ON public.user_recommendations_cache
  FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================================
-- PART B: Create Calculation Function
-- ============================================================
CREATE OR REPLACE FUNCTION public.calculate_user_recommendations(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection_degree INT;
  v_connection_label TEXT;
  v_shared_artists_count INT;
  v_shared_venues_count INT;
  v_shared_genres_count INT;
  v_shared_events_count INT;
  v_mutual_friends_count INT;
  v_network_proximity_score NUMERIC;
  v_shared_interests_score NUMERIC;
  v_event_overlap_score NUMERIC;
  v_recommendation_score NUMERIC;
  v_recommendation_reasons TEXT[];
  v_candidate_user_id UUID;
BEGIN
  -- Clear existing recommendations for this user
  DELETE FROM public.user_recommendations_cache WHERE user_id = p_user_id;

  -- Get all candidate users (1st, 2nd, 3rd degree + strangers)
  FOR v_candidate_user_id, v_connection_degree IN
    WITH first_degree AS (
      SELECT DISTINCT
        CASE 
          WHEN f.user1_id = p_user_id THEN f.user2_id 
          ELSE f.user1_id 
        END AS connected_user_id
      FROM public.friends f
      WHERE (f.user1_id = p_user_id OR f.user2_id = p_user_id)
    ),
    second_degree AS (
      SELECT DISTINCT
        CASE 
          WHEN f2.user1_id = fd.connected_user_id THEN f2.user2_id 
          ELSE f2.user1_id 
        END AS connected_user_id
      FROM first_degree fd
      JOIN public.friends f2 ON (fd.connected_user_id = f2.user1_id OR fd.connected_user_id = f2.user2_id)
      WHERE 
        CASE 
          WHEN f2.user1_id = fd.connected_user_id THEN f2.user2_id 
          ELSE f2.user1_id 
        END != p_user_id
        AND CASE 
          WHEN f2.user1_id = fd.connected_user_id THEN f2.user2_id 
          ELSE f2.user1_id 
        END NOT IN (SELECT connected_user_id FROM first_degree)
    ),
    third_degree AS (
      SELECT DISTINCT
        CASE 
          WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
          ELSE f3.user1_id 
        END AS connected_user_id
      FROM second_degree sd
      JOIN public.friends f3 ON (sd.connected_user_id = f3.user1_id OR sd.connected_user_id = f3.user2_id)
      WHERE 
        CASE 
          WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
          ELSE f3.user1_id 
        END != p_user_id
        AND CASE 
          WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
          ELSE f3.user1_id 
        END NOT IN (SELECT connected_user_id FROM first_degree)
        AND CASE 
          WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
          ELSE f3.user1_id 
        END NOT IN (SELECT connected_user_id FROM second_degree)
    ),
    all_connections AS (
      SELECT connected_user_id, 1 as degree FROM first_degree
      UNION
      SELECT connected_user_id, 2 as degree FROM second_degree
      UNION
      SELECT connected_user_id, 3 as degree FROM third_degree
    ),
    excluded_users AS (
      -- Users already friends
      SELECT DISTINCT
        CASE 
          WHEN f.user1_id = p_user_id THEN f.user2_id 
          ELSE f.user1_id 
        END AS user_id
      FROM public.friends f
      WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
      UNION
      -- Users with pending friend requests
      SELECT DISTINCT
        CASE 
          WHEN fr.sender_id = p_user_id THEN fr.receiver_id
          ELSE fr.sender_id
        END AS user_id
      FROM public.friend_requests fr
      WHERE (fr.sender_id = p_user_id OR fr.receiver_id = p_user_id)
        AND fr.status = 'pending'
    ),
    candidate_users AS (
      -- Start with 2nd and 3rd degree connections (best candidates)
      SELECT connected_user_id as user_id, degree
      FROM all_connections
      WHERE connected_user_id NOT IN (SELECT user_id FROM excluded_users)
      UNION
      -- Add stranger users (degree 0) but limit to avoid processing too many
      SELECT p.user_id, 0 as degree
      FROM public.profiles p
      WHERE p.user_id != p_user_id
        AND p.user_id NOT IN (SELECT user_id FROM excluded_users)
        AND p.user_id NOT IN (SELECT connected_user_id FROM all_connections)
      LIMIT 100  -- Limit stranger users to avoid processing too many
    )
    SELECT user_id, degree FROM candidate_users
  LOOP
    -- Set connection label based on degree
    v_connection_label := CASE v_connection_degree
      WHEN 1 THEN 'Friend'
      WHEN 2 THEN 'Mutual Friend'
      WHEN 3 THEN 'Mutual Friends +'
      ELSE 'Stranger'
    END;

    -- Calculate shared interests
    -- Shared artists
    SELECT COUNT(DISTINCT af1.artist_id)::INT
    INTO v_shared_artists_count
    FROM public.artist_follows af1
    INNER JOIN public.artist_follows af2 ON af1.artist_id = af2.artist_id
    WHERE af1.user_id = p_user_id
      AND af2.user_id = v_candidate_user_id;

    -- Shared venues (name-based matching)
    SELECT COUNT(DISTINCT vf1.venue_name)::INT
    INTO v_shared_venues_count
    FROM public.venue_follows vf1
    INNER JOIN public.venue_follows vf2 ON 
      vf1.venue_name = vf2.venue_name
      AND (vf1.venue_city IS NULL OR vf2.venue_city IS NULL OR vf1.venue_city = vf2.venue_city)
      AND (vf1.venue_state IS NULL OR vf2.venue_state IS NULL OR vf1.venue_state = vf2.venue_state)
    WHERE vf1.user_id = p_user_id
      AND vf2.user_id = v_candidate_user_id;

    -- Shared genres (from user_genre_interactions or music_preference_signals)
    SELECT COUNT(DISTINCT user1_genres.genre)::INT
    INTO v_shared_genres_count
    FROM (
      SELECT genre
      FROM public.user_genre_interactions
      WHERE user_id = p_user_id
      UNION
      SELECT preference_value as genre
      FROM public.music_preference_signals
      WHERE user_id = p_user_id AND preference_type = 'genre'
    ) user1_genres
    INNER JOIN (
      SELECT genre
      FROM public.user_genre_interactions
      WHERE user_id = v_candidate_user_id
      UNION
      SELECT preference_value as genre
      FROM public.music_preference_signals
      WHERE user_id = v_candidate_user_id AND preference_type = 'genre'
    ) user2_genres ON user1_genres.genre = user2_genres.genre;

    -- Shared events (interests and reviews)
    -- Presence-based: row exists = interested, or rsvp_status is 'interested', 'going', or 'maybe'
    SELECT COUNT(DISTINCT user1_events.event_id)::INT
    INTO v_shared_events_count
    FROM (
      SELECT uje.jambase_event_id as event_id
      FROM public.user_jambase_events uje
      WHERE uje.user_id = p_user_id 
        AND (uje.rsvp_status IS NULL OR uje.rsvp_status IN ('interested', 'going', 'maybe'))
      UNION
      SELECT ur.event_id
      FROM public.user_reviews ur
      WHERE ur.user_id = p_user_id AND ur.is_public = true
    ) user1_events
    INNER JOIN (
      SELECT uje.jambase_event_id as event_id
      FROM public.user_jambase_events uje
      WHERE uje.user_id = v_candidate_user_id 
        AND (uje.rsvp_status IS NULL OR uje.rsvp_status IN ('interested', 'going', 'maybe'))
      UNION
      SELECT ur.event_id
      FROM public.user_reviews ur
      WHERE ur.user_id = v_candidate_user_id AND ur.is_public = true
    ) user2_events ON user1_events.event_id = user2_events.event_id;

    -- Mutual friends count
    WITH user1_friends AS (
      SELECT DISTINCT
        CASE 
          WHEN f.user1_id = p_user_id THEN f.user2_id 
          ELSE f.user1_id 
        END AS friend_id
      FROM public.friends f
      WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
    ),
    user2_friends AS (
      SELECT DISTINCT
        CASE 
          WHEN f.user1_id = v_candidate_user_id THEN f.user2_id 
          ELSE f.user1_id 
        END AS friend_id
      FROM public.friends f
      WHERE f.user1_id = v_candidate_user_id OR f.user2_id = v_candidate_user_id
    )
    SELECT COUNT(*)::INT
    INTO v_mutual_friends_count
    FROM user1_friends u1f
    INNER JOIN user2_friends u2f ON u1f.friend_id = u2f.friend_id;

    -- Calculate scores (normalized 0-1)
    -- Network proximity score
    v_network_proximity_score := CASE v_connection_degree
      WHEN 1 THEN 1.0
      WHEN 2 THEN 0.7
      WHEN 3 THEN 0.4
      ELSE 0.1
    END;

    -- Shared interests score (normalize by max possible)
    v_shared_interests_score := LEAST(
      (COALESCE(v_shared_artists_count, 0)::NUMERIC / NULLIF(
        (SELECT COUNT(*) FROM public.artist_follows WHERE user_id = p_user_id), 0
      ) * 0.4 +
      COALESCE(v_shared_venues_count, 0)::NUMERIC / NULLIF(
        (SELECT COUNT(*) FROM public.venue_follows WHERE user_id = p_user_id), 0
      ) * 0.3 +
      COALESCE(v_shared_genres_count, 0)::NUMERIC / NULLIF(
        (SELECT COUNT(DISTINCT g.genre) FROM (
          SELECT genre FROM public.user_genre_interactions WHERE user_id = p_user_id
          UNION
          SELECT preference_value as genre FROM public.music_preference_signals WHERE user_id = p_user_id AND preference_type = 'genre'
        ) g), 0
      ) * 0.3), 1.0
    );

    -- Event overlap score (normalize by max possible)
    v_event_overlap_score := LEAST(
      COALESCE(v_shared_events_count, 0)::NUMERIC / NULLIF(
        (SELECT COUNT(*) FROM (
          SELECT jambase_event_id FROM public.user_jambase_events 
          WHERE user_id = p_user_id 
            AND (rsvp_status IS NULL OR rsvp_status IN ('interested', 'going', 'maybe'))
          UNION
          SELECT event_id FROM public.user_reviews WHERE user_id = p_user_id AND is_public = true
        ) events), 0
      ), 1.0
    );

    -- Calculate final recommendation score
    v_recommendation_score := 
      (v_network_proximity_score * 0.4) +
      (v_shared_interests_score * 0.35) +
      (v_event_overlap_score * 0.25);

    -- Generate recommendation reasons
    v_recommendation_reasons := ARRAY[]::TEXT[];
    IF v_shared_artists_count > 0 THEN
      v_recommendation_reasons := array_append(
        v_recommendation_reasons,
        v_shared_artists_count || CASE WHEN v_shared_artists_count = 1 THEN ' shared artist' ELSE ' shared artists' END
      );
    END IF;
    IF v_mutual_friends_count > 0 THEN
      v_recommendation_reasons := array_append(
        v_recommendation_reasons,
        v_mutual_friends_count || CASE WHEN v_mutual_friends_count = 1 THEN ' mutual friend' ELSE ' mutual friends' END
      );
    END IF;
    IF v_shared_events_count > 0 THEN
      v_recommendation_reasons := array_append(
        v_recommendation_reasons,
        'Attended ' || v_shared_events_count || CASE WHEN v_shared_events_count = 1 THEN ' same event' ELSE ' same events' END
      );
    END IF;
    IF v_shared_genres_count > 0 THEN
      v_recommendation_reasons := array_append(
        v_recommendation_reasons,
        'Likes similar genres'
      );
    END IF;

    -- Insert into cache
    INSERT INTO public.user_recommendations_cache (
      user_id,
      recommended_user_id,
      recommendation_score,
      connection_degree,
      connection_label,
      shared_artists_count,
      shared_venues_count,
      shared_genres_count,
      shared_events_count,
      mutual_friends_count,
      recommendation_reasons,
      last_calculated_at
    ) VALUES (
      p_user_id,
      v_candidate_user_id,
      v_recommendation_score,
      v_connection_degree,
      v_connection_label,
      v_shared_artists_count,
      v_shared_venues_count,
      v_shared_genres_count,
      v_shared_events_count,
      v_mutual_friends_count,
      v_recommendation_reasons,
      now()
    )
    ON CONFLICT (user_id, recommended_user_id)
    DO UPDATE SET
      recommendation_score = EXCLUDED.recommendation_score,
      connection_degree = EXCLUDED.connection_degree,
      connection_label = EXCLUDED.connection_label,
      shared_artists_count = EXCLUDED.shared_artists_count,
      shared_venues_count = EXCLUDED.shared_venues_count,
      shared_genres_count = EXCLUDED.shared_genres_count,
      shared_events_count = EXCLUDED.shared_events_count,
      mutual_friends_count = EXCLUDED.mutual_friends_count,
      recommendation_reasons = EXCLUDED.recommendation_reasons,
      last_calculated_at = EXCLUDED.last_calculated_at,
      updated_at = now();

  END LOOP;
END;
$$;

-- ============================================================
-- PART C: Create Query Function
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_user_recommendations(
  p_user_id UUID,
  p_limit INT DEFAULT 10
)
RETURNS TABLE(
  recommended_user_id UUID,
  name TEXT,
  avatar_url TEXT,
  connection_degree INT,
  connection_label TEXT,
  recommendation_score NUMERIC,
  shared_artists_count INT,
  shared_venues_count INT,
  shared_genres_count INT,
  shared_events_count INT,
  mutual_friends_count INT,
  recommendation_reasons TEXT[]
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    urc.recommended_user_id,
    p.name,
    p.avatar_url,
    urc.connection_degree,
    urc.connection_label,
    urc.recommendation_score,
    urc.shared_artists_count,
    urc.shared_venues_count,
    urc.shared_genres_count,
    urc.shared_events_count,
    urc.mutual_friends_count,
    urc.recommendation_reasons
  FROM public.user_recommendations_cache urc
  INNER JOIN public.profiles p ON p.user_id = urc.recommended_user_id
  WHERE urc.user_id = p_user_id
  ORDER BY urc.recommendation_score DESC
  LIMIT p_limit;
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.calculate_user_recommendations(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_recommendations(UUID, INT) TO authenticated;

-- ============================================================
-- PART D: Create Cache Refresh Triggers
-- ============================================================

-- Function to refresh recommendations for affected users
CREATE OR REPLACE FUNCTION public.refresh_user_recommendations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  -- Determine which user(s) need recommendations refreshed
  IF TG_TABLE_NAME = 'artist_follows' THEN
    IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
      v_user_id := COALESCE(NEW.user_id, OLD.user_id);
      PERFORM public.calculate_user_recommendations(v_user_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'venue_follows' THEN
    IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
      v_user_id := COALESCE(NEW.user_id, OLD.user_id);
      PERFORM public.calculate_user_recommendations(v_user_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'user_jambase_events' THEN
    IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND (OLD.rsvp_status IS DISTINCT FROM NEW.rsvp_status)) THEN
      v_user_id := COALESCE(NEW.user_id, OLD.user_id);
      PERFORM public.calculate_user_recommendations(v_user_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'friends' THEN
    IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' THEN
      -- Refresh for both users in the friendship
      PERFORM public.calculate_user_recommendations(COALESCE(NEW.user1_id, OLD.user1_id));
      PERFORM public.calculate_user_recommendations(COALESCE(NEW.user2_id, OLD.user2_id));
    END IF;
  ELSIF TG_TABLE_NAME = 'user_reviews' THEN
    IF TG_OP = 'INSERT' OR TG_OP = 'DELETE' OR (TG_OP = 'UPDATE' AND (OLD.is_public IS DISTINCT FROM NEW.is_public)) THEN
      v_user_id := COALESCE(NEW.user_id, OLD.user_id);
      PERFORM public.calculate_user_recommendations(v_user_id);
    END IF;
  ELSIF TG_TABLE_NAME = 'friend_requests' THEN
    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
      -- Refresh for both users
      PERFORM public.calculate_user_recommendations(COALESCE(NEW.sender_id, OLD.sender_id));
      PERFORM public.calculate_user_recommendations(COALESCE(NEW.receiver_id, OLD.receiver_id));
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Create triggers
DROP TRIGGER IF EXISTS refresh_recommendations_on_artist_follow ON public.artist_follows;
CREATE TRIGGER refresh_recommendations_on_artist_follow
  AFTER INSERT OR DELETE ON public.artist_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_user_recommendations();

DROP TRIGGER IF EXISTS refresh_recommendations_on_venue_follow ON public.venue_follows;
CREATE TRIGGER refresh_recommendations_on_venue_follow
  AFTER INSERT OR DELETE ON public.venue_follows
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_user_recommendations();

DROP TRIGGER IF EXISTS refresh_recommendations_on_event_interest ON public.user_jambase_events;
CREATE TRIGGER refresh_recommendations_on_event_interest
  AFTER INSERT OR DELETE OR UPDATE OF rsvp_status ON public.user_jambase_events
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_user_recommendations();

DROP TRIGGER IF EXISTS refresh_recommendations_on_friends ON public.friends;
CREATE TRIGGER refresh_recommendations_on_friends
  AFTER INSERT OR DELETE ON public.friends
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_user_recommendations();

DROP TRIGGER IF EXISTS refresh_recommendations_on_reviews ON public.user_reviews;
CREATE TRIGGER refresh_recommendations_on_reviews
  AFTER INSERT OR DELETE OR UPDATE OF is_public ON public.user_reviews
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_user_recommendations();

DROP TRIGGER IF EXISTS refresh_recommendations_on_friend_requests ON public.friend_requests;
CREATE TRIGGER refresh_recommendations_on_friend_requests
  AFTER INSERT OR UPDATE OR DELETE ON public.friend_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.refresh_user_recommendations();

-- ============================================================
-- PART E: Add Performance Indexes
-- ============================================================

-- Ensure indexes exist on related tables for performance
CREATE INDEX IF NOT EXISTS idx_artist_follows_user_artist 
  ON public.artist_follows(user_id, artist_id);
CREATE INDEX IF NOT EXISTS idx_venue_follows_user_venue 
  ON public.venue_follows(user_id, venue_name, venue_city, venue_state);
CREATE INDEX IF NOT EXISTS idx_user_jambase_events_user_event 
  ON public.user_jambase_events(user_id, jambase_event_id);
CREATE INDEX IF NOT EXISTS idx_user_reviews_user_event 
  ON public.user_reviews(user_id, event_id);
CREATE INDEX IF NOT EXISTS idx_user_genre_interactions_user_genre 
  ON public.user_genre_interactions(user_id, genre);
CREATE INDEX IF NOT EXISTS idx_friend_requests_sender_receiver_status 
  ON public.friend_requests(sender_id, receiver_id, status);

-- ============================================================
-- PART F: Debug Function (Optional - for troubleshooting)
-- ============================================================
CREATE OR REPLACE FUNCTION public.debug_user_recommendations(p_user_id UUID)
RETURNS TABLE(
  metric TEXT,
  value BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH first_degree AS (
    SELECT COUNT(*)::BIGINT as count
    FROM public.friends f
    WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
  ),
  second_degree AS (
    WITH first_degree_ids AS (
      SELECT DISTINCT
        CASE 
          WHEN f.user1_id = p_user_id THEN f.user2_id 
          ELSE f.user1_id 
        END AS friend_id
      FROM public.friends f
      WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
    )
    SELECT COUNT(DISTINCT
      CASE 
        WHEN f2.user1_id = fd.friend_id THEN f2.user2_id 
        ELSE f2.user1_id 
      END
    )::BIGINT as count
    FROM first_degree_ids fd
    JOIN public.friends f2 ON fd.friend_id = f2.user1_id OR fd.friend_id = f2.user2_id
    WHERE 
      CASE 
        WHEN f2.user1_id = fd.friend_id THEN f2.user2_id 
        ELSE f2.user1_id 
      END != p_user_id
      AND CASE 
        WHEN f2.user1_id = fd.friend_id THEN f2.user2_id 
        ELSE f2.user1_id 
      END NOT IN (SELECT friend_id FROM first_degree_ids)
  ),
  excluded_count AS (
    SELECT COUNT(*)::BIGINT as count
    FROM (
      SELECT DISTINCT
        CASE 
          WHEN f.user1_id = p_user_id THEN f.user2_id 
          ELSE f.user1_id 
        END AS user_id
      FROM public.friends f
      WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
      UNION
      SELECT DISTINCT
        CASE 
          WHEN fr.sender_id = p_user_id THEN fr.receiver_id
          ELSE fr.sender_id
        END AS user_id
      FROM public.friend_requests fr
      WHERE (fr.sender_id = p_user_id OR fr.receiver_id = p_user_id)
        AND fr.status = 'pending'
    ) excluded
  ),
  candidate_count AS (
    WITH first_degree AS (
      SELECT DISTINCT
        CASE 
          WHEN f.user1_id = p_user_id THEN f.user2_id 
          ELSE f.user1_id 
        END AS connected_user_id
      FROM public.friends f
      WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
    ),
    second_degree AS (
      SELECT DISTINCT
        CASE 
          WHEN f2.user1_id = fd.connected_user_id THEN f2.user2_id 
          ELSE f2.user1_id 
        END AS connected_user_id
      FROM first_degree fd
      JOIN public.friends f2 ON fd.connected_user_id = f2.user1_id OR fd.connected_user_id = f2.user2_id
      WHERE 
        CASE 
          WHEN f2.user1_id = fd.connected_user_id THEN f2.user2_id 
          ELSE f2.user1_id 
        END != p_user_id
        AND CASE 
          WHEN f2.user1_id = fd.connected_user_id THEN f2.user2_id 
          ELSE f2.user1_id 
        END NOT IN (SELECT connected_user_id FROM first_degree)
    ),
    third_degree AS (
      SELECT DISTINCT
        CASE 
          WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
          ELSE f3.user1_id 
        END AS connected_user_id
      FROM second_degree sd
      JOIN public.friends f3 ON sd.connected_user_id = f3.user1_id OR sd.connected_user_id = f3.user2_id
      WHERE 
        CASE 
          WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
          ELSE f3.user1_id 
        END != p_user_id
        AND CASE 
          WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
          ELSE f3.user1_id 
        END NOT IN (SELECT connected_user_id FROM first_degree)
        AND CASE 
          WHEN f3.user1_id = sd.connected_user_id THEN f3.user2_id 
          ELSE f3.user1_id 
        END NOT IN (SELECT connected_user_id FROM second_degree)
    ),
    all_connections AS (
      SELECT connected_user_id, 2 as degree FROM second_degree
      UNION
      SELECT connected_user_id, 3 as degree FROM third_degree
    ),
    excluded_users AS (
      SELECT DISTINCT
        CASE 
          WHEN f.user1_id = p_user_id THEN f.user2_id 
          ELSE f.user1_id 
        END AS user_id
      FROM public.friends f
      WHERE f.user1_id = p_user_id OR f.user2_id = p_user_id
      UNION
      SELECT DISTINCT
        CASE 
          WHEN fr.sender_id = p_user_id THEN fr.receiver_id
          ELSE fr.sender_id
        END AS user_id
      FROM public.friend_requests fr
      WHERE (fr.sender_id = p_user_id OR fr.receiver_id = p_user_id)
        AND fr.status = 'pending'
    )
    SELECT COUNT(*)::BIGINT as count
    FROM all_connections ac
    WHERE ac.connected_user_id NOT IN (SELECT user_id FROM excluded_users)
  )
  SELECT 'First Degree Connections'::TEXT, count FROM first_degree
  UNION ALL
  SELECT 'Second Degree Connections'::TEXT, count FROM second_degree
  UNION ALL
  SELECT 'Excluded Users'::TEXT, count FROM excluded_count
  UNION ALL
  SELECT 'Candidate Users'::TEXT, count FROM candidate_count
  UNION ALL
  SELECT 'Cached Recommendations'::TEXT, COUNT(*)::BIGINT FROM public.user_recommendations_cache WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.debug_user_recommendations(UUID) TO authenticated;

-- Comments
COMMENT ON TABLE public.user_recommendations_cache IS 'Cached user recommendations based on shared interests, event attendance, and network proximity';
COMMENT ON FUNCTION public.calculate_user_recommendations(UUID) IS 'Calculates and caches user recommendations for a given user';
COMMENT ON FUNCTION public.get_user_recommendations(UUID, INT) IS 'Retrieves cached user recommendations for fast loading';
COMMENT ON FUNCTION public.debug_user_recommendations(UUID) IS 'Debug function to check recommendation calculation status';

