-- JamBase ingest hygiene, derived from events, artists, and venues.
-- No new tables. Admin and the daily Slack report read the aggregate RPCs.
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.admin_trending_events(integer);
--   DROP FUNCTION IF EXISTS public.admin_event_hygiene_samples(integer);
--   DROP FUNCTION IF EXISTS public.admin_event_ingest_health();
--   DROP VIEW IF EXISTS public.jambase_venue_hygiene;
--   DROP VIEW IF EXISTS public.jambase_artist_hygiene;
--   DROP VIEW IF EXISTS public.jambase_event_hygiene;
--   DROP FUNCTION IF EXISTS public.genre_tags_are_clean(text[]);
--   DROP FUNCTION IF EXISTS public.genre_list_is_real(text[]);
--   DROP FUNCTION IF EXISTS public.hygiene_issues(text[]);

-- A real genre list has at least one tag that is not blank and not the
-- 'small artist' placeholder. Mixed arrays like {small artist,edm} still count.
CREATE OR REPLACE FUNCTION public.genre_list_is_real(p_genres text[])
RETURNS boolean
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM unnest(COALESCE(p_genres, ARRAY[]::text[])) AS g(genre)
    WHERE btrim(g.genre) <> ''
      AND lower(btrim(g.genre)) <> 'small artist'
  );
$$;

-- Real tags must also resolve through genre_match_slug into genre_idf.
-- Unresolved tags score as nothing in the feed.
CREATE OR REPLACE FUNCTION public.genre_tags_are_clean(p_genres text[])
RETURNS boolean
LANGUAGE sql
STABLE
PARALLEL SAFE
AS $$
  SELECT public.genre_list_is_real(p_genres)
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(COALESCE(p_genres, ARRAY[]::text[])) AS g(genre)
      WHERE btrim(g.genre) <> ''
        AND lower(btrim(g.genre)) <> 'small artist'
        AND NOT EXISTS (
          SELECT 1
          FROM public.genre_idf gi
          WHERE gi.genre_slug = public.genre_match_slug(g.genre)
        )
    );
$$;

-- ARRAY_REMOVE(arr, NULL) does not drop nulls. This does.
CREATE OR REPLACE FUNCTION public.hygiene_issues(VARIADIC p_issues text[])
RETURNS text[]
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT COALESCE(array_agg(issue), ARRAY[]::text[])
  FROM unnest(COALESCE(p_issues, ARRAY[]::text[])) AS issue
  WHERE issue IS NOT NULL AND btrim(issue) <> '';
$$;

REVOKE ALL ON FUNCTION public.genre_list_is_real(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.genre_tags_are_clean(text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.hygiene_issues(text[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.genre_list_is_real(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.genre_tags_are_clean(text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.hygiene_issues(text[]) TO service_role;

CREATE OR REPLACE VIEW public.jambase_event_hygiene
WITH (security_invoker = true) AS
SELECT
  g.id,
  g.title,
  g.event_date,
  g.created_at,
  g.updated_at,
  g.last_modified_at,
  g.artist_id,
  g.artist_name,
  g.venue_id,
  g.venue_name,
  g.venue_city,
  g.artist_ok,
  g.venue_ok,
  g.title_ok,
  g.date_ok,
  g.jambase_id_ok,
  g.city_ok,
  g.state_ok,
  g.geo_ok,
  g.tickets_ok,
  g.image_ok,
  g.doors_ok,
  g.status_ok,
  g.announced_ok,
  g.genres_real,
  g.genres_ok,
  (g.genres_real AND NOT g.genres_ok) AS genres_unresolved,
  (NOT g.genres_real AND g.artist_genres_real) AS genres_should_inherit,
  (
    g.artist_ok AND g.venue_ok AND g.title_ok AND g.date_ok AND g.jambase_id_ok
    AND g.city_ok AND g.state_ok AND g.geo_ok AND g.tickets_ok AND g.image_ok
    AND g.doors_ok AND g.status_ok AND g.announced_ok AND g.genres_ok
    AND NOT (NOT g.genres_real AND g.artist_genres_real)
  ) AS is_clean
FROM (
  SELECT
    e.id,
    e.title,
    e.event_date,
    e.created_at,
    e.updated_at,
    e.last_modified_at,
    e.artist_id,
    a.name AS artist_name,
    e.venue_id,
    v.name AS venue_name,
    e.venue_city,
    (e.artist_id IS NOT NULL AND a.id IS NOT NULL) AS artist_ok,
    (e.venue_id IS NOT NULL AND v.id IS NOT NULL) AS venue_ok,
    (e.title IS NOT NULL AND btrim(e.title) <> '') AS title_ok,
    (e.event_date IS NOT NULL) AS date_ok,
    (e.jambase_id IS NOT NULL AND btrim(e.jambase_id) <> '') AS jambase_id_ok,
    (e.venue_city IS NOT NULL AND btrim(e.venue_city) <> '') AS city_ok,
    (e.venue_state IS NOT NULL AND btrim(e.venue_state) <> '') AS state_ok,
    (e.latitude IS NOT NULL AND e.longitude IS NOT NULL) AS geo_ok,
    (
      COALESCE(cardinality(e.ticket_urls), 0) > 0
      OR (e.external_url IS NOT NULL AND btrim(e.external_url) <> '')
    ) AS tickets_ok,
    (
      (e.event_media_url IS NOT NULL AND btrim(e.event_media_url) <> '')
      OR (
        e.images IS NOT NULL
        AND e.images::jsonb <> 'null'::jsonb
        AND CASE
          WHEN jsonb_typeof(e.images::jsonb) = 'array' THEN jsonb_array_length(e.images::jsonb) > 0
          WHEN jsonb_typeof(e.images::jsonb) = 'object' THEN e.images::jsonb <> '{}'::jsonb
          ELSE true
        END
      )
    ) AS image_ok,
    (e.doors_time IS NOT NULL) AS doors_ok,
    (e.event_status IS NOT NULL AND btrim(e.event_status) <> '') AS status_ok,
    (e.announced_at IS NOT NULL) AS announced_ok,
    public.genre_list_is_real(e.genres) AS genres_real,
    public.genre_tags_are_clean(e.genres) AS genres_ok,
    public.genre_list_is_real(a.genres) AS artist_genres_real
  FROM public.events e
  LEFT JOIN public.artists a ON a.id = e.artist_id
  LEFT JOIN public.venues v ON v.id = e.venue_id
  WHERE e.source = 'jambase'
) g;

CREATE OR REPLACE VIEW public.jambase_artist_hygiene
WITH (security_invoker = true) AS
SELECT
  g.id,
  g.name,
  g.identifier,
  g.created_at,
  g.updated_at,
  g.name_ok,
  g.identifier_ok,
  g.genres_real,
  g.genres_ok,
  (g.genres_real AND NOT g.genres_ok) AS genres_unresolved,
  (g.name_ok AND g.identifier_ok AND g.genres_ok) AS is_clean
FROM (
  SELECT
    a.id,
    a.name,
    a.identifier,
    a.created_at,
    a.updated_at,
    (a.name IS NOT NULL AND btrim(a.name) <> '') AS name_ok,
    (a.identifier IS NOT NULL AND btrim(a.identifier) <> '') AS identifier_ok,
    public.genre_list_is_real(a.genres) AS genres_real,
    public.genre_tags_are_clean(a.genres) AS genres_ok
  FROM public.artists a
  WHERE a.identifier ILIKE 'jambase:%'
     OR EXISTS (
       SELECT 1
       FROM public.events e
       WHERE e.source = 'jambase'
         AND e.artist_id = a.id
     )
) g;

CREATE OR REPLACE VIEW public.jambase_venue_hygiene
WITH (security_invoker = true) AS
SELECT
  v.id,
  v.name,
  v.city,
  v.state,
  v.created_at,
  v.updated_at,
  (v.name IS NOT NULL AND btrim(v.name) <> '') AS name_ok,
  (v.city IS NOT NULL AND btrim(v.city) <> '') AS city_ok,
  (v.state IS NOT NULL AND btrim(v.state) <> '') AS state_ok,
  (v.latitude IS NOT NULL AND v.longitude IS NOT NULL) AS geo_ok,
  (
    (v.name IS NOT NULL AND btrim(v.name) <> '')
    AND (v.city IS NOT NULL AND btrim(v.city) <> '')
    AND (v.state IS NOT NULL AND btrim(v.state) <> '')
    AND v.latitude IS NOT NULL
    AND v.longitude IS NOT NULL
  ) AS is_clean
FROM public.venues v
WHERE EXISTS (
  SELECT 1
  FROM public.events e
  WHERE e.source = 'jambase'
    AND e.venue_id = v.id
);

REVOKE ALL ON public.jambase_event_hygiene FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.jambase_artist_hygiene FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.jambase_venue_hygiene FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.jambase_event_hygiene TO service_role;
GRANT SELECT ON public.jambase_artist_hygiene TO service_role;
GRANT SELECT ON public.jambase_venue_hygiene TO service_role;

CREATE OR REPLACE FUNCTION public.admin_event_ingest_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_failed bigint := 0;
  v_cron timestamptz;
  v_events jsonb;
  v_artists jsonb;
  v_venues jsonb;
  v_latest timestamptz;
BEGIN
  IF NOT (
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.account_type = 'admin'
    )
  ) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;

  -- Most recent 09:30 UTC ingest window that has already started.
  v_cron := (date_trunc('day', now() AT TIME ZONE 'utc') + interval '9 hours 30 minutes') AT TIME ZONE 'utc';
  IF now() < v_cron THEN
    v_cron := v_cron - interval '1 day';
  END IF;

  IF to_regclass('public.jambase_sync_failed_pages') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.jambase_sync_failed_pages WHERE resolved_at IS NULL'
      INTO v_failed;
  END IF;

  SELECT jsonb_build_object(
    'total', count(*),
    'upcoming', count(*) FILTER (WHERE event_date >= now()),
    'clean', count(*) FILTER (WHERE event_date >= now() AND is_clean),
    'clean_pct', ROUND(
      100.0 * count(*) FILTER (WHERE event_date >= now() AND is_clean)
      / NULLIF(count(*) FILTER (WHERE event_date >= now()), 0),
      1
    ),
    'created_26h', count(*) FILTER (WHERE created_at > now() - interval '26 hours'),
    'updated_26h', count(*) FILTER (
      WHERE updated_at > now() - interval '26 hours'
        AND created_at <= now() - interval '26 hours'
    ),
    'latest_updated_at', max(updated_at),
    'latest_modified_at', max(last_modified_at),
    'missing', jsonb_build_object(
      'artist', count(*) FILTER (WHERE event_date >= now() AND NOT artist_ok),
      'venue', count(*) FILTER (WHERE event_date >= now() AND NOT venue_ok),
      'title', count(*) FILTER (WHERE event_date >= now() AND NOT title_ok),
      'event_date', count(*) FILTER (WHERE event_date >= now() AND NOT date_ok),
      'jambase_id', count(*) FILTER (WHERE event_date >= now() AND NOT jambase_id_ok),
      'city', count(*) FILTER (WHERE event_date >= now() AND NOT city_ok),
      'state', count(*) FILTER (WHERE event_date >= now() AND NOT state_ok),
      'geo', count(*) FILTER (WHERE event_date >= now() AND NOT geo_ok),
      'tickets', count(*) FILTER (WHERE event_date >= now() AND NOT tickets_ok),
      'image', count(*) FILTER (WHERE event_date >= now() AND NOT image_ok),
      'doors_time', count(*) FILTER (WHERE event_date >= now() AND NOT doors_ok),
      'event_status', count(*) FILTER (WHERE event_date >= now() AND NOT status_ok),
      'announced_at', count(*) FILTER (WHERE event_date >= now() AND NOT announced_ok),
      'genres', count(*) FILTER (WHERE event_date >= now() AND NOT genres_real),
      'genres_unresolved', count(*) FILTER (WHERE event_date >= now() AND genres_unresolved),
      'genres_should_inherit', count(*) FILTER (WHERE event_date >= now() AND genres_should_inherit)
    )
  )
  INTO v_events
  FROM public.jambase_event_hygiene;

  v_latest := NULLIF(v_events ->> 'latest_updated_at', '')::timestamptz;

  SELECT jsonb_build_object(
    'total', count(*),
    'clean', count(*) FILTER (WHERE is_clean),
    'clean_pct', ROUND(100.0 * count(*) FILTER (WHERE is_clean) / NULLIF(count(*), 0), 1),
    'created_26h', count(*) FILTER (WHERE created_at > now() - interval '26 hours'),
    'updated_26h', count(*) FILTER (
      WHERE updated_at > now() - interval '26 hours'
        AND created_at <= now() - interval '26 hours'
    ),
    'latest_updated_at', max(updated_at),
    'missing', jsonb_build_object(
      'name', count(*) FILTER (WHERE NOT name_ok),
      'identifier', count(*) FILTER (WHERE NOT identifier_ok),
      'genres', count(*) FILTER (WHERE NOT genres_real),
      'genres_unresolved', count(*) FILTER (WHERE genres_unresolved)
    )
  )
  INTO v_artists
  FROM public.jambase_artist_hygiene;

  SELECT jsonb_build_object(
    'total', count(*),
    'clean', count(*) FILTER (WHERE is_clean),
    'clean_pct', ROUND(100.0 * count(*) FILTER (WHERE is_clean) / NULLIF(count(*), 0), 1),
    'created_26h', count(*) FILTER (WHERE created_at > now() - interval '26 hours'),
    'updated_26h', count(*) FILTER (
      WHERE updated_at > now() - interval '26 hours'
        AND created_at <= now() - interval '26 hours'
    ),
    'latest_updated_at', max(updated_at),
    'missing', jsonb_build_object(
      'name', count(*) FILTER (WHERE NOT name_ok),
      'city', count(*) FILTER (WHERE NOT city_ok),
      'state', count(*) FILTER (WHERE NOT state_ok),
      'geo', count(*) FILTER (WHERE NOT geo_ok)
    )
  )
  INTO v_venues
  FROM public.jambase_venue_hygiene;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'cron_start', v_cron,
    'fresh', v_latest IS NOT NULL AND v_latest >= v_cron,
    'stale', v_latest IS NULL OR v_latest < now() - interval '26 hours',
    'failed_pages', v_failed,
    'events', v_events,
    'artists', v_artists,
    'venues', v_venues
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_event_hygiene_samples(p_limit integer DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 50);
BEGIN
  IF NOT (
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.account_type = 'admin'
    )
  ) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg((to_jsonb(s) - 'severity') ORDER BY s.severity DESC, s.event_date)
    FROM (
      SELECT
        h.id,
        h.title,
        h.event_date,
        h.artist_name,
        h.venue_name,
        h.venue_city AS city,
        (
          (NOT h.artist_ok)::int
          + (NOT h.venue_ok)::int
          + (NOT h.genres_ok)::int
          + (h.genres_should_inherit)::int
        ) AS severity,
        public.hygiene_issues(
          CASE WHEN NOT h.artist_ok THEN 'artist' END,
          CASE WHEN NOT h.venue_ok THEN 'venue' END,
          CASE WHEN NOT h.title_ok THEN 'title' END,
          CASE WHEN NOT h.date_ok THEN 'event_date' END,
          CASE WHEN NOT h.jambase_id_ok THEN 'jambase_id' END,
          CASE WHEN NOT h.genres_real THEN 'genres' END,
          CASE WHEN h.genres_unresolved THEN 'genres_unresolved' END,
          CASE WHEN h.genres_should_inherit THEN 'genres_should_inherit' END,
          CASE WHEN NOT h.city_ok THEN 'city' END,
          CASE WHEN NOT h.state_ok THEN 'state' END,
          CASE WHEN NOT h.geo_ok THEN 'geo' END,
          CASE WHEN NOT h.tickets_ok THEN 'tickets' END,
          CASE WHEN NOT h.image_ok THEN 'image' END,
          CASE WHEN NOT h.doors_ok THEN 'doors_time' END,
          CASE WHEN NOT h.status_ok THEN 'event_status' END,
          CASE WHEN NOT h.announced_ok THEN 'announced_at' END
        ) AS issues
      FROM public.jambase_event_hygiene h
      WHERE h.event_date >= now()
        AND NOT h.is_clean
      ORDER BY severity DESC, h.event_date
      LIMIT v_limit
    ) s
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_trending_events(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '120s'
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 90);
BEGIN
  IF NOT (
    COALESCE(auth.jwt() ->> 'role', '') = 'service_role'
    OR EXISTS (
      SELECT 1
      FROM public.users u
      WHERE u.user_id = auth.uid()
        AND u.account_type = 'admin'
    )
  ) THEN
    RAISE EXCEPTION 'Admins only' USING ERRCODE = '42501';
  END IF;

  RETURN COALESCE((
    WITH interest AS (
      SELECT
        r.event_id,
        count(*) FILTER (WHERE r.relationship_type = 'interested') AS interested,
        count(*) FILTER (WHERE r.relationship_type = 'going') AS going
      FROM public.user_event_relationships r
      WHERE r.created_at > now() - make_interval(days => v_days)
        AND r.relationship_type IN ('interested', 'going')
      GROUP BY r.event_id
    ),
    reviewed AS (
      SELECT r.event_id, count(*) AS reviews
      FROM public.reviews r
      WHERE r.created_at > now() - make_interval(days => v_days)
        AND COALESCE(r.is_public, true)
        AND NOT COALESCE(r.is_draft, false)
        AND r.event_id IS NOT NULL
      GROUP BY r.event_id
    ),
    top_events AS (
      SELECT
        e.id,
        e.title,
        e.event_date,
        e.artist_id,
        e.venue_id,
        e.venue_city,
        COALESCE(i.interested, 0) AS interested,
        COALESCE(i.going, 0) AS going,
        COALESCE(rv.reviews, 0) AS reviews,
        COALESCE(i.interested, 0) + COALESCE(i.going, 0) + COALESCE(rv.reviews, 0) AS score
      FROM public.events e
      LEFT JOIN interest i ON i.event_id = e.id
      LEFT JOIN reviewed rv ON rv.event_id = e.id
      WHERE e.event_date >= now()
        AND COALESCE(i.interested, 0) + COALESCE(i.going, 0) + COALESCE(rv.reviews, 0) > 0
      ORDER BY score DESC, e.event_date
      LIMIT 20
    )
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'event_date', t.event_date,
        'artist_name', a.name,
        'venue_name', v.name,
        'city', t.venue_city,
        'interested', t.interested,
        'going', t.going,
        'reviews', t.reviews,
        'score', t.score,
        'issues', CASE
          WHEN h.id IS NULL THEN NULL
          ELSE to_jsonb(public.hygiene_issues(
            CASE WHEN NOT h.artist_ok THEN 'artist' END,
            CASE WHEN NOT h.venue_ok THEN 'venue' END,
            CASE WHEN NOT h.genres_ok THEN 'genres' END,
            CASE WHEN h.genres_unresolved THEN 'genres_unresolved' END,
            CASE WHEN h.genres_should_inherit THEN 'genres_should_inherit' END
          ))
        END
      )
      ORDER BY t.score DESC, t.event_date
    )
    FROM top_events t
    LEFT JOIN public.artists a ON a.id = t.artist_id
    LEFT JOIN public.venues v ON v.id = t.venue_id
    LEFT JOIN public.jambase_event_hygiene h ON h.id = t.id
  ), '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_event_ingest_health() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_event_hygiene_samples(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_trending_events(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_event_ingest_health() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_event_hygiene_samples(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_trending_events(integer) TO authenticated, service_role;
