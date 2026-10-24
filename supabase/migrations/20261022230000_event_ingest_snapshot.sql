-- Store one JamBase ingest report and make page loads read that row.
-- The live views scanned genre resolution once per event on every admin open.
-- Rebuild runs after the daily sync (and from the admin Rebuild button).
-- Freshness is recomputed on read from the stored last-write time, so the
-- snapshot does not go stale just because the clock moved.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.refresh_jambase_ingest_snapshot();
--   DROP FUNCTION IF EXISTS public.admin_event_ingest_snapshot();
--   DROP FUNCTION IF EXISTS public.jambase_ingest_overlay(jsonb);
--   DROP FUNCTION IF EXISTS public.jambase_ingest_require_admin();
--   DROP TABLE IF EXISTS public.jambase_ingest_snapshot;
--   Then re-apply 20261022160000_event_ingest_health.sql for the live functions.

-- Upcoming catalog and the artist/venue sets the rebuild joins.
CREATE INDEX IF NOT EXISTS events_jambase_event_date_idx
  ON public.events (event_date)
  WHERE source = 'jambase';

CREATE INDEX IF NOT EXISTS events_jambase_updated_at_idx
  ON public.events (updated_at DESC)
  WHERE source = 'jambase';

CREATE INDEX IF NOT EXISTS events_jambase_modified_idx
  ON public.events (last_modified_at DESC)
  WHERE source = 'jambase' AND last_modified_at IS NOT NULL;

CREATE INDEX IF NOT EXISTS events_jambase_artist_idx
  ON public.events (artist_id)
  WHERE source = 'jambase' AND artist_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS events_jambase_venue_idx
  ON public.events (venue_id)
  WHERE source = 'jambase' AND venue_id IS NOT NULL;

-- lower(identifier) LIKE 'jambase:%' needs the pattern opclass under a non-C collation.
CREATE INDEX IF NOT EXISTS artists_identifier_lower_prefix_idx
  ON public.artists (lower(identifier) text_pattern_ops)
  WHERE identifier IS NOT NULL;

-- Trending: time range of interested/going, then group by event.
CREATE INDEX IF NOT EXISTS user_event_relationships_recent_interest_idx
  ON public.user_event_relationships (created_at, event_id)
  WHERE relationship_type IN ('interested', 'going');

-- Trending: public non-draft reviews in a time window.
CREATE INDEX IF NOT EXISTS reviews_public_created_event_idx
  ON public.reviews (created_at, event_id)
  WHERE event_id IS NOT NULL
    AND COALESCE(is_public, true)
    AND NOT COALESCE(is_draft, false);

CREATE TABLE IF NOT EXISTS public.jambase_ingest_snapshot (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  refreshed_at timestamptz NOT NULL DEFAULT now(),
  health jsonb NOT NULL,
  samples jsonb NOT NULL DEFAULT '[]'::jsonb,
  trending_7 jsonb NOT NULL DEFAULT '[]'::jsonb,
  trending_30 jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.jambase_ingest_snapshot ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.jambase_ingest_snapshot FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.jambase_ingest_require_admin()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
END;
$$;

-- Recompute clock-dependent flags without scanning the catalog.
CREATE OR REPLACE FUNCTION public.jambase_ingest_overlay(p_health jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_failed bigint := 0;
  v_cron timestamptz;
  v_latest timestamptz;
BEGIN
  v_cron := (date_trunc('day', now() AT TIME ZONE 'utc') + interval '9 hours 30 minutes') AT TIME ZONE 'utc';
  IF now() < v_cron THEN
    v_cron := v_cron - interval '1 day';
  END IF;

  v_latest := NULLIF(p_health #>> '{events,latest_updated_at}', '')::timestamptz;

  IF to_regclass('public.jambase_sync_failed_pages') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.jambase_sync_failed_pages WHERE resolved_at IS NULL'
      INTO v_failed;
  END IF;

  RETURN p_health || jsonb_build_object(
    'generated_at', now(),
    'cron_start', v_cron,
    'fresh', v_latest IS NOT NULL AND v_latest >= v_cron,
    'stale', v_latest IS NULL OR v_latest < now() - interval '26 hours',
    'failed_pages', v_failed
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_jambase_ingest_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_temp, public
SET statement_timeout = '180s'
AS $refresh$
DECLARE
  v_events jsonb;
  v_artists jsonb;
  v_venues jsonb;
  v_health jsonb;
  v_samples jsonb;
  v_trending jsonb;
  v_trending_7 jsonb := '[]'::jsonb;
  v_trending_30 jsonb := '[]'::jsonb;
  v_days integer;
  v_totals record;
BEGIN
  PERFORM public.jambase_ingest_require_admin();

  DROP TABLE IF EXISTS pg_temp.jb_artists;
  DROP TABLE IF EXISTS pg_temp.jb_artist_genre;
  DROP TABLE IF EXISTS pg_temp.jb_event_genre;
  DROP TABLE IF EXISTS pg_temp.jb_upcoming;

  CREATE TEMP TABLE jb_artists ON COMMIT DROP AS
  SELECT a.id, a.name, a.identifier, a.genres, a.created_at, a.updated_at
  FROM public.artists a
  WHERE lower(a.identifier) LIKE 'jambase:%'
     OR a.id IN (
       SELECT e.artist_id
       FROM public.events e
       WHERE e.source = 'jambase'
         AND e.artist_id IS NOT NULL
     );

  ALTER TABLE jb_artists ADD PRIMARY KEY (id);

  -- One hash join into genre_idf, not a correlated lookup per tag.
  CREATE TEMP TABLE jb_artist_genre ON COMMIT DROP AS
  SELECT
    t.id,
    count(*)::integer AS real_tags,
    count(*) FILTER (WHERE gi.genre_slug IS NULL)::integer AS unresolved
  FROM (
    SELECT a.id, public.genre_match_slug(g.genre) AS slug
    FROM jb_artists a
    CROSS JOIN LATERAL unnest(COALESCE(a.genres, ARRAY[]::text[])) AS g(genre)
    WHERE btrim(g.genre) <> ''
      AND lower(btrim(g.genre)) <> 'small artist'
  ) t
  LEFT JOIN public.genre_idf gi ON gi.genre_slug = t.slug
  GROUP BY t.id;

  ALTER TABLE jb_artist_genre ADD PRIMARY KEY (id);

  CREATE TEMP TABLE jb_event_genre ON COMMIT DROP AS
  SELECT
    t.id,
    count(*)::integer AS real_tags,
    count(*) FILTER (WHERE gi.genre_slug IS NULL)::integer AS unresolved
  FROM (
    SELECT e.id, public.genre_match_slug(g.genre) AS slug
    FROM public.events e
    CROSS JOIN LATERAL unnest(COALESCE(e.genres, ARRAY[]::text[])) AS g(genre)
    WHERE e.source = 'jambase'
      AND e.event_date >= now()
      AND btrim(g.genre) <> ''
      AND lower(btrim(g.genre)) <> 'small artist'
  ) t
  LEFT JOIN public.genre_idf gi ON gi.genre_slug = t.slug
  GROUP BY t.id;

  ALTER TABLE jb_event_genre ADD PRIMARY KEY (id);

  CREATE TEMP TABLE jb_upcoming ON COMMIT DROP AS
  SELECT
    flagged.*,
    (
      flagged.artist_ok AND flagged.venue_ok AND flagged.title_ok AND flagged.date_ok
      AND flagged.jambase_id_ok AND flagged.city_ok AND flagged.state_ok AND flagged.geo_ok
      AND flagged.tickets_ok AND flagged.image_ok AND flagged.doors_ok AND flagged.status_ok
      AND flagged.announced_ok AND flagged.genres_ok AND NOT flagged.genres_should_inherit
    ) AS is_clean
  FROM (
    SELECT
      e.id,
      e.title,
      e.event_date,
      a.name AS artist_name,
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
      (COALESCE(eg.real_tags, 0) > 0) AS genres_real,
      (COALESCE(eg.real_tags, 0) > 0 AND COALESCE(eg.unresolved, 0) = 0) AS genres_ok,
      (COALESCE(eg.real_tags, 0) > 0 AND COALESCE(eg.unresolved, 0) > 0) AS genres_unresolved,
      (COALESCE(eg.real_tags, 0) = 0 AND COALESCE(ag.real_tags, 0) > 0) AS genres_should_inherit
    FROM public.events e
    LEFT JOIN public.artists a ON a.id = e.artist_id
    LEFT JOIN public.venues v ON v.id = e.venue_id
    LEFT JOIN jb_event_genre eg ON eg.id = e.id
    LEFT JOIN jb_artist_genre ag ON ag.id = e.artist_id
    WHERE e.source = 'jambase'
      AND e.event_date >= now()
  ) flagged;

  ALTER TABLE jb_upcoming ADD PRIMARY KEY (id);
  ANALYZE jb_artists;
  ANALYZE jb_artist_genre;
  ANALYZE jb_event_genre;
  ANALYZE jb_upcoming;

  SELECT
    count(*) AS total,
    count(*) FILTER (WHERE event_date >= now()) AS upcoming,
    count(*) FILTER (WHERE created_at > now() - interval '26 hours') AS created_26h,
    count(*) FILTER (
      WHERE updated_at > now() - interval '26 hours'
        AND created_at <= now() - interval '26 hours'
    ) AS updated_26h,
    max(updated_at) AS latest_updated_at,
    max(last_modified_at) AS latest_modified_at
  INTO v_totals
  FROM public.events
  WHERE source = 'jambase';

  SELECT jsonb_build_object(
    'total', COALESCE(v_totals.total, 0),
    'upcoming', COALESCE(v_totals.upcoming, 0),
    'clean', count(*) FILTER (WHERE is_clean),
    'clean_pct', ROUND(100.0 * count(*) FILTER (WHERE is_clean) / NULLIF(count(*), 0), 1),
    'created_26h', COALESCE(v_totals.created_26h, 0),
    'updated_26h', COALESCE(v_totals.updated_26h, 0),
    'latest_updated_at', v_totals.latest_updated_at,
    'latest_modified_at', v_totals.latest_modified_at,
    'missing', jsonb_build_object(
      'artist', count(*) FILTER (WHERE NOT artist_ok),
      'venue', count(*) FILTER (WHERE NOT venue_ok),
      'title', count(*) FILTER (WHERE NOT title_ok),
      'event_date', count(*) FILTER (WHERE NOT date_ok),
      'jambase_id', count(*) FILTER (WHERE NOT jambase_id_ok),
      'city', count(*) FILTER (WHERE NOT city_ok),
      'state', count(*) FILTER (WHERE NOT state_ok),
      'geo', count(*) FILTER (WHERE NOT geo_ok),
      'tickets', count(*) FILTER (WHERE NOT tickets_ok),
      'image', count(*) FILTER (WHERE NOT image_ok),
      'doors_time', count(*) FILTER (WHERE NOT doors_ok),
      'event_status', count(*) FILTER (WHERE NOT status_ok),
      'announced_at', count(*) FILTER (WHERE NOT announced_ok),
      'genres', count(*) FILTER (WHERE NOT genres_real),
      'genres_unresolved', count(*) FILTER (WHERE genres_unresolved),
      'genres_should_inherit', count(*) FILTER (WHERE genres_should_inherit)
    )
  )
  INTO v_events
  FROM jb_upcoming;

  SELECT jsonb_build_object(
    'total', count(*),
    'clean', count(*) FILTER (
      WHERE s.name IS NOT NULL AND btrim(s.name) <> ''
        AND s.identifier IS NOT NULL AND btrim(s.identifier) <> ''
        AND COALESCE(ag.real_tags, 0) > 0
        AND COALESCE(ag.unresolved, 0) = 0
    ),
    'clean_pct', ROUND(
      100.0 * count(*) FILTER (
        WHERE s.name IS NOT NULL AND btrim(s.name) <> ''
          AND s.identifier IS NOT NULL AND btrim(s.identifier) <> ''
          AND COALESCE(ag.real_tags, 0) > 0
          AND COALESCE(ag.unresolved, 0) = 0
      ) / NULLIF(count(*), 0),
      1
    ),
    'created_26h', count(*) FILTER (WHERE s.created_at > now() - interval '26 hours'),
    'updated_26h', count(*) FILTER (
      WHERE s.updated_at > now() - interval '26 hours'
        AND s.created_at <= now() - interval '26 hours'
    ),
    'latest_updated_at', max(s.updated_at),
    'missing', jsonb_build_object(
      'name', count(*) FILTER (WHERE s.name IS NULL OR btrim(s.name) = ''),
      'identifier', count(*) FILTER (WHERE s.identifier IS NULL OR btrim(s.identifier) = ''),
      'genres', count(*) FILTER (WHERE COALESCE(ag.real_tags, 0) = 0),
      'genres_unresolved', count(*) FILTER (
        WHERE COALESCE(ag.real_tags, 0) > 0 AND COALESCE(ag.unresolved, 0) > 0
      )
    )
  )
  INTO v_artists
  FROM jb_artists s
  LEFT JOIN jb_artist_genre ag ON ag.id = s.id;

  SELECT jsonb_build_object(
    'total', count(*),
    'clean', count(*) FILTER (
      WHERE v.name IS NOT NULL AND btrim(v.name) <> ''
        AND v.city IS NOT NULL AND btrim(v.city) <> ''
        AND v.state IS NOT NULL AND btrim(v.state) <> ''
        AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
    ),
    'clean_pct', ROUND(
      100.0 * count(*) FILTER (
        WHERE v.name IS NOT NULL AND btrim(v.name) <> ''
          AND v.city IS NOT NULL AND btrim(v.city) <> ''
          AND v.state IS NOT NULL AND btrim(v.state) <> ''
          AND v.latitude IS NOT NULL AND v.longitude IS NOT NULL
      ) / NULLIF(count(*), 0),
      1
    ),
    'created_26h', count(*) FILTER (WHERE v.created_at > now() - interval '26 hours'),
    'updated_26h', count(*) FILTER (
      WHERE v.updated_at > now() - interval '26 hours'
        AND v.created_at <= now() - interval '26 hours'
    ),
    'latest_updated_at', max(v.updated_at),
    'missing', jsonb_build_object(
      'name', count(*) FILTER (WHERE v.name IS NULL OR btrim(v.name) = ''),
      'city', count(*) FILTER (WHERE v.city IS NULL OR btrim(v.city) = ''),
      'state', count(*) FILTER (WHERE v.state IS NULL OR btrim(v.state) = ''),
      'geo', count(*) FILTER (WHERE v.latitude IS NULL OR v.longitude IS NULL)
    )
  )
  INTO v_venues
  FROM public.venues v
  WHERE v.id IN (
    SELECT e.venue_id
    FROM public.events e
    WHERE e.source = 'jambase'
      AND e.venue_id IS NOT NULL
  );

  v_health := jsonb_build_object(
    'events', COALESCE(v_events, '{}'::jsonb),
    'artists', COALESCE(v_artists, '{}'::jsonb),
    'venues', COALESCE(v_venues, '{}'::jsonb)
  );

  SELECT COALESCE(jsonb_agg((to_jsonb(s) - 'severity') ORDER BY s.severity DESC, s.event_date), '[]'::jsonb)
  INTO v_samples
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
    FROM jb_upcoming h
    WHERE NOT h.is_clean
    ORDER BY severity DESC, h.event_date
    LIMIT 25
  ) s;

  FOR v_days IN SELECT unnest(ARRAY[7, 30])
  LOOP
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', t.id,
        'title', t.title,
        'event_date', t.event_date,
        'artist_name', t.artist_name,
        'venue_name', t.venue_name,
        'city', t.city,
        'interested', t.interested,
        'going', t.going,
        'reviews', t.reviews,
        'score', t.score,
        'issues', CASE
          WHEN h.id IS NULL THEN NULL
          WHEN h.is_clean THEN '[]'::jsonb
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
    ), '[]'::jsonb)
    INTO v_trending
    FROM (
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
      )
      SELECT
        e.id,
        e.title,
        e.event_date,
        a.name AS artist_name,
        v.name AS venue_name,
        e.venue_city AS city,
        COALESCE(i.interested, 0) AS interested,
        COALESCE(i.going, 0) AS going,
        COALESCE(rv.reviews, 0) AS reviews,
        COALESCE(i.interested, 0) + COALESCE(i.going, 0) + COALESCE(rv.reviews, 0) AS score
      FROM public.events e
      LEFT JOIN interest i ON i.event_id = e.id
      LEFT JOIN reviewed rv ON rv.event_id = e.id
      LEFT JOIN public.artists a ON a.id = e.artist_id
      LEFT JOIN public.venues v ON v.id = e.venue_id
      WHERE e.event_date >= now()
        AND COALESCE(i.interested, 0) + COALESCE(i.going, 0) + COALESCE(rv.reviews, 0) > 0
      ORDER BY score DESC, e.event_date
      LIMIT 20
    ) t
    LEFT JOIN jb_upcoming h ON h.id = t.id;

    IF v_days = 7 THEN
      v_trending_7 := v_trending;
    ELSE
      v_trending_30 := v_trending;
    END IF;
  END LOOP;

  INSERT INTO public.jambase_ingest_snapshot AS snap (
    singleton, refreshed_at, health, samples, trending_7, trending_30
  )
  VALUES (true, now(), v_health, COALESCE(v_samples, '[]'::jsonb), v_trending_7, v_trending_30)
  ON CONFLICT (singleton) DO UPDATE SET
    refreshed_at = EXCLUDED.refreshed_at,
    health = EXCLUDED.health,
    samples = EXCLUDED.samples,
    trending_7 = EXCLUDED.trending_7,
    trending_30 = EXCLUDED.trending_30;

  RETURN public.admin_event_ingest_snapshot();
END;
$refresh$;

CREATE OR REPLACE FUNCTION public.admin_event_ingest_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_row public.jambase_ingest_snapshot%ROWTYPE;
BEGIN
  PERFORM public.jambase_ingest_require_admin();

  SELECT * INTO v_row FROM public.jambase_ingest_snapshot WHERE singleton;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'snapshot_missing', true,
      'refreshed_at', NULL,
      'health', NULL,
      'samples', '[]'::jsonb,
      'trending_7', '[]'::jsonb,
      'trending_30', '[]'::jsonb
    );
  END IF;

  RETURN jsonb_build_object(
    'snapshot_missing', false,
    'refreshed_at', v_row.refreshed_at,
    'health', public.jambase_ingest_overlay(v_row.health),
    'samples', v_row.samples,
    'trending_7', v_row.trending_7,
    'trending_30', v_row.trending_30
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_event_ingest_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_health jsonb;
BEGIN
  PERFORM public.jambase_ingest_require_admin();

  SELECT health INTO v_health FROM public.jambase_ingest_snapshot WHERE singleton;
  IF NOT FOUND OR v_health IS NULL THEN
    RETURN jsonb_build_object('snapshot_missing', true);
  END IF;

  RETURN public.jambase_ingest_overlay(v_health);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_event_hygiene_samples(p_limit integer DEFAULT 25)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_limit integer := LEAST(GREATEST(COALESCE(p_limit, 25), 1), 50);
  v_samples jsonb;
BEGIN
  PERFORM public.jambase_ingest_require_admin();

  SELECT samples INTO v_samples FROM public.jambase_ingest_snapshot WHERE singleton;
  IF NOT FOUND OR v_samples IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(elem ORDER BY ord)
    FROM (
      SELECT elem, ord
      FROM jsonb_array_elements(v_samples) WITH ORDINALITY AS listed(elem, ord)
      ORDER BY ord
      LIMIT v_limit
    ) sliced
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_trending_events(p_days integer DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5s'
AS $$
DECLARE
  v_days integer := LEAST(GREATEST(COALESCE(p_days, 7), 1), 90);
  v_rows jsonb;
BEGIN
  PERFORM public.jambase_ingest_require_admin();

  SELECT CASE WHEN v_days <= 7 THEN trending_7 ELSE trending_30 END
  INTO v_rows
  FROM public.jambase_ingest_snapshot
  WHERE singleton;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

-- The per-row views are what made every page load scan the catalog.
DROP VIEW IF EXISTS public.jambase_event_hygiene;
DROP VIEW IF EXISTS public.jambase_artist_hygiene;
DROP VIEW IF EXISTS public.jambase_venue_hygiene;

REVOKE ALL ON FUNCTION public.jambase_ingest_require_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.jambase_ingest_overlay(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_jambase_ingest_snapshot() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_event_ingest_snapshot() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_event_ingest_health() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_event_hygiene_samples(integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.admin_trending_events(integer) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.refresh_jambase_ingest_snapshot() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_event_ingest_snapshot() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_event_ingest_health() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_event_hygiene_samples(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.admin_trending_events(integer) TO authenticated, service_role;
