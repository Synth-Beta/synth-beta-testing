-- Spotify connect / streaming sync repair: interactions constraint, notifications view,
-- and idempotent re-apply of RPCs missing or drifted in production.

BEGIN;

-- ---------------------------------------------------------------------------
-- C. interactions: allow entity_type 'profile' without entity_uuid (matches client)
-- ---------------------------------------------------------------------------
ALTER TABLE public.interactions
  DROP CONSTRAINT IF EXISTS interactions_entity_uuid_required_for_entities;

ALTER TABLE public.interactions
  ADD CONSTRAINT interactions_entity_uuid_required_for_entities
  CHECK (
    entity_type IN (
      'search', 'view', 'form', 'ticket_link',
      'song', 'album', 'playlist', 'genre', 'scene', 'profile'
    )
    OR entity_uuid IS NOT NULL
  )
  NOT VALID;

COMMENT ON CONSTRAINT interactions_entity_uuid_required_for_entities ON public.interactions IS
  'Profile/search/view/etc. may omit entity_uuid; event/artist/venue/user/review require entity_uuid.';

-- ---------------------------------------------------------------------------
-- D. notifications_with_details view (was never migrated; client falls back but 404s in console)
-- ---------------------------------------------------------------------------
DROP VIEW IF EXISTS public.notifications_with_details;

CREATE VIEW public.notifications_with_details
WITH (security_invoker = true)
AS
SELECT
  n.id,
  n.user_id,
  n.type,
  n.title,
  n.message,
  n.data,
  n.is_read,
  n.created_at,
  n.review_id,
  n.comment_id,
  n.actor_user_id,
  u.name AS actor_name,
  u.avatar_url AS actor_avatar,
  r.review_text,
  r.rating,
  e.title AS event_title,
  e.artist_name_normalized AS artist_name,
  e.venue_name_normalized AS venue_name
FROM public.notifications n
LEFT JOIN public.users u ON u.user_id = n.actor_user_id
LEFT JOIN public.reviews r ON r.id = n.review_id
LEFT JOIN public.events_with_artist_venue e ON e.id = r.event_id;

COMMENT ON VIEW public.notifications_with_details IS
  'Notifications enriched with actor, review, and event details for the app notification center.';

GRANT SELECT ON public.notifications_with_details TO authenticated;

-- ---------------------------------------------------------------------------
-- D. get_similar_users_to_friend (re-apply latest body for prod drift)
-- ---------------------------------------------------------------------------
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
  excluded_ids AS (
    SELECT p_user_id AS user_id
    UNION
    SELECT CASE WHEN ur.user_id = p_user_id THEN ur.related_user_id ELSE ur.user_id END
    FROM user_relationships ur
    WHERE ur.relationship_type = 'friend' AND ur.status = 'accepted'
      AND (ur.user_id = p_user_id OR ur.related_user_id = p_user_id)
    UNION
    SELECT CASE WHEN ur.user_id = p_user_id THEN ur.related_user_id ELSE ur.user_id END
    FROM user_relationships ur
    WHERE ur.relationship_type = 'friend' AND ur.status = 'pending'
      AND (ur.user_id = p_user_id OR ur.related_user_id = p_user_id)
    UNION
    SELECT CASE WHEN ur.user_id = p_user_id THEN ur.related_user_id ELSE ur.user_id END
    FROM user_relationships ur
    WHERE ur.relationship_type = 'block'
      AND (ur.user_id = p_user_id OR ur.related_user_id = p_user_id)
  ),
  candidates AS (
    SELECT DISTINCT other.user_id
    FROM (
      SELECT af2.user_id
      FROM artist_follows af1
      JOIN artist_follows af2 ON af1.artist_id = af2.artist_id AND af2.user_id != p_user_id
      WHERE af1.user_id = p_user_id
      UNION
      SELECT uvr2.user_id
      FROM user_venue_relationships uvr1
      JOIN user_venue_relationships uvr2 ON uvr1.venue_id = uvr2.venue_id AND uvr2.user_id != p_user_id
      WHERE uvr1.user_id = p_user_id
      UNION
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
        SELECT preference_value AS genre
        FROM music_preference_signals
        WHERE user_id = p_user_id AND preference_type = 'genre'
      ) g
      JOIN (
        SELECT user_id, preference_value AS genre
        FROM music_preference_signals
        WHERE preference_type = 'genre'
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

-- ---------------------------------------------------------------------------
-- D. personalized_feed_cache + get_or_refresh_feed_v5_cached (re-apply for prod drift)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.personalized_feed_cache (
  cache_key     TEXT PRIMARY KEY,
  user_id       UUID NOT NULL,
  city_lat      NUMERIC,
  city_lng      NUMERIC,
  radius_miles  NUMERIC,
  date_start    TIMESTAMPTZ,
  date_end      TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  events        JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_personalized_feed_cache_user_created_at
  ON public.personalized_feed_cache (user_id, created_at DESC);

-- Internal cache table: not exposed via PostgREST. SECURITY DEFINER RPCs read/write it.
ALTER TABLE public.personalized_feed_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.personalized_feed_cache FROM anon, authenticated;
GRANT ALL ON public.personalized_feed_cache TO service_role;

DROP FUNCTION IF EXISTS public.get_or_refresh_feed_v5_cached(
  UUID, TEXT, INT, INT, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, INT, INT
);

CREATE OR REPLACE FUNCTION public.get_or_refresh_feed_v5_cached(
  p_user_id        UUID,
  p_section        TEXT DEFAULT NULL,
  p_limit          INT DEFAULT 100,
  p_offset         INT DEFAULT 0,
  p_city_lat       NUMERIC DEFAULT NULL,
  p_city_lng       NUMERIC DEFAULT NULL,
  p_radius_miles   NUMERIC DEFAULT 50,
  p_include_past   BOOLEAN DEFAULT FALSE,
  p_city_filter    TEXT DEFAULT NULL,
  p_state_filter   TEXT DEFAULT NULL,
  p_max_days_ahead INT DEFAULT 90,
  p_ttl_seconds    INT DEFAULT 600
)
RETURNS TABLE (
  section TEXT,
  id UUID,
  score NUMERIC,
  payload JSONB,
  context JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_cache_key     TEXT;
  v_cached_events JSONB;
  v_created_at    TIMESTAMPTZ;
  v_ttl_interval  INTERVAL;
BEGIN
  v_cache_key := md5(
    COALESCE(p_user_id::TEXT, '') || '|' ||
    COALESCE(p_section, '') || '|' ||
    COALESCE(p_limit::TEXT, '') || '|' ||
    COALESCE(p_offset::TEXT, '') || '|' ||
    COALESCE(p_city_lat::TEXT, '') || '|' ||
    COALESCE(p_city_lng::TEXT, '') || '|' ||
    COALESCE(p_radius_miles::TEXT, '') || '|' ||
    COALESCE(p_include_past::TEXT, '') || '|' ||
    COALESCE(p_city_filter, '') || '|' ||
    COALESCE(p_state_filter, '') || '|' ||
    COALESCE(p_max_days_ahead::TEXT, '')
  );

  v_ttl_interval := make_interval(secs => GREATEST(p_ttl_seconds, 0));

  SELECT c.events, c.created_at
  INTO v_cached_events, v_created_at
  FROM public.personalized_feed_cache c
  WHERE c.cache_key = v_cache_key;

  IF v_cached_events IS NOT NULL
     AND v_created_at > (NOW() - v_ttl_interval) THEN
    RETURN QUERY
    SELECT
      (e->>'section')::TEXT AS section,
      (e->>'id')::UUID      AS id,
      (e->>'score')::NUMERIC AS score,
      e->'payload'          AS payload,
      e->'context'          AS context
    FROM jsonb_array_elements(v_cached_events) AS e;
    RETURN;
  END IF;

  SELECT COALESCE(
           jsonb_agg(
             jsonb_build_object(
               'section', f.section,
               'id', f.id,
               'score', f.score,
               'payload', f.payload,
               'context', f.context
             )
           ),
           '[]'::JSONB
         )
  INTO v_cached_events
  FROM public.get_personalized_feed_v5(
    p_user_id,
    p_section,
    p_limit,
    p_offset,
    p_city_lat,
    p_city_lng,
    p_radius_miles,
    p_include_past,
    p_city_filter,
    p_state_filter,
    p_max_days_ahead
  ) AS f(section, id, score, payload, context);

  INSERT INTO public.personalized_feed_cache (
    cache_key,
    user_id,
    city_lat,
    city_lng,
    radius_miles,
    date_start,
    date_end,
    created_at,
    events
  )
  VALUES (
    v_cache_key,
    p_user_id,
    p_city_lat,
    p_city_lng,
    p_radius_miles,
    NULL,
    NULL,
    NOW(),
    v_cached_events
  )
  ON CONFLICT (cache_key) DO UPDATE
    SET created_at = EXCLUDED.created_at,
        events     = EXCLUDED.events,
        user_id    = EXCLUDED.user_id;

  RETURN QUERY
  SELECT
    (e->>'section')::TEXT   AS section,
    (e->>'id')::UUID        AS id,
    (e->>'score')::NUMERIC  AS score,
    e->'payload'            AS payload,
    e->'context'            AS context
  FROM jsonb_array_elements(v_cached_events) AS e;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_or_refresh_feed_v5_cached(
  UUID, TEXT, INT, INT, NUMERIC, NUMERIC, NUMERIC, BOOLEAN, TEXT, TEXT, INT, INT
) TO authenticated;

-- Ensure client-callable feed cache invalidation exists
CREATE OR REPLACE FUNCTION public.invalidate_personalized_feed_cache(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN;
  END IF;
  DELETE FROM public.personalized_feed_cache WHERE user_id = p_user_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invalidate_personalized_feed_cache(uuid) TO authenticated;

-- Reload PostgREST schema cache so new view/RPCs are visible immediately
NOTIFY pgrst, 'reload schema';

COMMIT;
