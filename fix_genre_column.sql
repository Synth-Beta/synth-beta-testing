-- Quick fix for the genre column issue in calculate_user_recommendations
-- Run this to update the function without re-running the entire migration

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

  -- Get all candidate users (1st, 2nd, 3rd degree + community)
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
        AND degree > 1  -- Exclude 1st degree (already friends)
      UNION
      -- Add community users (degree 0) but limit to avoid processing too many
      SELECT p.user_id, 0 as degree
      FROM public.profiles p
      WHERE p.user_id != p_user_id
        AND p.user_id NOT IN (SELECT user_id FROM excluded_users)
        AND p.user_id NOT IN (SELECT connected_user_id FROM all_connections)
      LIMIT 100  -- Limit community users to avoid processing too many
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

    -- Shared genres (FIXED: use genre column, not genres)
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

