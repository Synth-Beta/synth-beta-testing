-- The stored snapshot rebuild nested-looped artists via OR id IN (subquery)
-- and died at the API gateway. Pick artist and venue ids with indexable scans,
-- then hash-join back to the dimension tables.

CREATE OR REPLACE FUNCTION public.refresh_jambase_ingest_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_temp, public
SET statement_timeout = '8min'
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
  v_festivals integer;
BEGIN
  PERFORM public.jambase_ingest_require_admin();

  DROP TABLE IF EXISTS pg_temp.jb_artist_ids;
  DROP TABLE IF EXISTS pg_temp.jb_venue_ids;
  DROP TABLE IF EXISTS pg_temp.jb_artists;
  DROP TABLE IF EXISTS pg_temp.jb_artist_genre;
  DROP TABLE IF EXISTS pg_temp.jb_event_genre;
  DROP TABLE IF EXISTS pg_temp.jb_upcoming;

  -- UNION of two indexable lookups, then one hash join. The old OR id IN (...)
  -- plan nested-looped artists and never finished before the API gateway.
  CREATE TEMP TABLE jb_artist_ids ON COMMIT DROP AS
  SELECT e.artist_id AS id
  FROM public.events e
  WHERE e.source = 'jambase'
    AND e.artist_id IS NOT NULL
  UNION
  SELECT a.id
  FROM public.artists a
  WHERE a.identifier IS NOT NULL
    AND lower(a.identifier) LIKE 'jambase:%';

  CREATE TEMP TABLE jb_artists ON COMMIT DROP AS
  SELECT a.id, a.name, a.identifier, a.genres, a.created_at, a.updated_at
  FROM public.artists a
  JOIN jb_artist_ids i ON i.id = a.id;

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
      AND flagged.tickets_ok
      AND flagged.genres_ok AND NOT flagged.genres_should_inherit
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
      (
        COALESCE(cardinality(e.ticket_urls), 0) > 0
        OR (e.external_url IS NOT NULL AND btrim(e.external_url) <> '')
      ) AS tickets_ok,
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
      AND NOT public.event_is_festival(e.title)
  ) flagged;

  ALTER TABLE jb_upcoming ADD PRIMARY KEY (id);

  CREATE TEMP TABLE jb_venue_ids ON COMMIT DROP AS
  SELECT DISTINCT e.venue_id AS id
  FROM public.events e
  WHERE e.source = 'jambase'
    AND e.venue_id IS NOT NULL;

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

  SELECT count(*)
  INTO v_festivals
  FROM public.events e
  WHERE e.source = 'jambase'
    AND e.event_date >= now()
    AND public.event_is_festival(e.title);

  SELECT jsonb_build_object(
    'total', COALESCE(v_totals.total, 0),
    'upcoming', COALESCE(v_totals.upcoming, 0),
    'festivals_excluded', COALESCE(v_festivals, 0),
    'hygiene_upcoming', count(*),
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
      'tickets', count(*) FILTER (WHERE NOT tickets_ok),
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
  JOIN jb_venue_ids i ON i.id = v.id;

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
        +         (NOT h.genres_ok)::int
        + (h.genres_should_inherit)::int
        + (NOT h.tickets_ok)::int
      ) AS severity,
      public.hygiene_issues(
        CASE WHEN NOT h.artist_ok THEN 'artist' END,
        CASE WHEN NOT h.venue_ok THEN 'venue' END,
        CASE WHEN NOT h.title_ok THEN 'title' END,
        CASE WHEN NOT h.date_ok THEN 'event_date' END,
        CASE WHEN NOT h.tickets_ok THEN 'tickets' END,
        CASE WHEN NOT h.genres_real THEN 'genres' END,
        CASE WHEN h.genres_unresolved THEN 'genres_unresolved' END,
        CASE WHEN h.genres_should_inherit THEN 'genres_should_inherit' END
      ) AS issues
    FROM jb_upcoming h
    WHERE NOT h.is_clean
    ORDER BY severity DESC, h.event_date
    LIMIT 25
  ) s;

  FOR v_days IN SELECT unnest(ARRAY[7, 30])
  LOOP
    DROP TABLE IF EXISTS pg_temp.jb_touch;
    CREATE TEMP TABLE jb_touch ON COMMIT DROP AS
    WITH window_reviews AS (
      SELECT r.id, r.event_id, r.artist_id, r.venue_id
      FROM public.reviews r
      WHERE r.created_at > now() - make_interval(days => v_days)
        AND COALESCE(r.is_public, true)
        AND NOT COALESCE(r.is_draft, false)
    ),
    raw AS (
      SELECT
        i.entity_type AS kind,
        COALESCE(
          i.entity_uuid,
          CASE
            WHEN i.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN i.entity_id::uuid
          END
        ) AS entity_id,
        'feeds'::text AS channel
      FROM public.interactions i
      WHERE i.occurred_at > now() - make_interval(days => v_days)
        AND i.event_type = 'view'
        AND i.entity_type IN ('event', 'artist', 'venue')

      UNION ALL
      SELECT 'event', r.event_id, 'reviews'
      FROM window_reviews r
      WHERE r.event_id IS NOT NULL
      UNION ALL
      SELECT 'artist', COALESCE(r.artist_id, e.artist_id), 'reviews'
      FROM window_reviews r
      LEFT JOIN public.events e ON e.id = r.event_id
      WHERE COALESCE(r.artist_id, e.artist_id) IS NOT NULL
      UNION ALL
      SELECT 'venue', COALESCE(r.venue_id, e.venue_id), 'reviews'
      FROM window_reviews r
      LEFT JOIN public.events e ON e.id = r.event_id
      WHERE COALESCE(r.venue_id, e.venue_id) IS NOT NULL

      UNION ALL
      SELECT 'event', rv.event_id, 'review_views'
      FROM public.interactions i
      JOIN public.reviews rv ON rv.id = COALESCE(
        i.entity_uuid,
        CASE
          WHEN i.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN i.entity_id::uuid
        END
      )
      WHERE i.occurred_at > now() - make_interval(days => v_days)
        AND i.event_type = 'view'
        AND i.entity_type = 'review'
        AND rv.event_id IS NOT NULL
      UNION ALL
      SELECT 'artist', COALESCE(rv.artist_id, e.artist_id), 'review_views'
      FROM public.interactions i
      JOIN public.reviews rv ON rv.id = COALESCE(
        i.entity_uuid,
        CASE
          WHEN i.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN i.entity_id::uuid
        END
      )
      LEFT JOIN public.events e ON e.id = rv.event_id
      WHERE i.occurred_at > now() - make_interval(days => v_days)
        AND i.event_type = 'view'
        AND i.entity_type = 'review'
        AND COALESCE(rv.artist_id, e.artist_id) IS NOT NULL
      UNION ALL
      SELECT 'venue', COALESCE(rv.venue_id, e.venue_id), 'review_views'
      FROM public.interactions i
      JOIN public.reviews rv ON rv.id = COALESCE(
        i.entity_uuid,
        CASE
          WHEN i.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN i.entity_id::uuid
        END
      )
      LEFT JOIN public.events e ON e.id = rv.event_id
      WHERE i.occurred_at > now() - make_interval(days => v_days)
        AND i.event_type = 'view'
        AND i.entity_type = 'review'
        AND COALESCE(rv.venue_id, e.venue_id) IS NOT NULL

      UNION ALL
      SELECT 'event', s.event_id, 'emails'
      FROM public.event_reminders_sent s
      WHERE s.sent_at > now() - make_interval(days => v_days)
      UNION ALL
      SELECT
        'event',
        CASE
          WHEN n.data->>'event_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (n.data->>'event_id')::uuid
        END,
        'emails'
      FROM public.notifications n
      WHERE n.created_at > now() - make_interval(days => v_days)
        AND n.type IN (
          'artist_new_event',
          'follows_new_events_summary',
          'bucket_list_new_events_summary',
          'friends_event_interest_summary'
        )
      UNION ALL
      SELECT
        'artist',
        CASE
          WHEN n.data->>'artist_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (n.data->>'artist_id')::uuid
        END,
        'emails'
      FROM public.notifications n
      WHERE n.created_at > now() - make_interval(days => v_days)
        AND n.type IN (
          'artist_new_event',
          'follows_new_events_summary',
          'bucket_list_new_events_summary',
          'friends_event_interest_summary'
        )
        AND (
          n.data->>'event_id' IS NULL
          OR n.data->>'event_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
      UNION ALL
      SELECT
        'venue',
        CASE
          WHEN n.data->>'venue_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
            THEN (n.data->>'venue_id')::uuid
        END,
        'emails'
      FROM public.notifications n
      WHERE n.created_at > now() - make_interval(days => v_days)
        AND n.type IN (
          'artist_new_event',
          'follows_new_events_summary',
          'bucket_list_new_events_summary',
          'friends_event_interest_summary'
        )
        AND (
          n.data->>'event_id' IS NULL
          OR n.data->>'event_id' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )

      UNION ALL
      SELECT
        i.entity_type,
        COALESCE(
          i.entity_uuid,
          CASE
            WHEN i.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN i.entity_id::uuid
          END
        ),
        'searches'
      FROM public.interactions i
      WHERE i.occurred_at > now() - make_interval(days => v_days)
        AND i.event_type = 'search'
        AND i.entity_type IN ('event', 'artist', 'venue')

      UNION ALL
      SELECT 'event', m.shared_event_id, 'shares'
      FROM public.messages m
      WHERE m.created_at > now() - make_interval(days => v_days)
        AND m.shared_event_id IS NOT NULL
      UNION ALL
      SELECT 'event', rv.event_id, 'shares'
      FROM public.messages m
      JOIN public.reviews rv ON rv.id = m.shared_review_id
      WHERE m.created_at > now() - make_interval(days => v_days)
        AND m.shared_review_id IS NOT NULL
        AND rv.event_id IS NOT NULL
      UNION ALL
      SELECT 'artist', COALESCE(rv.artist_id, e.artist_id), 'shares'
      FROM public.messages m
      JOIN public.reviews rv ON rv.id = m.shared_review_id
      LEFT JOIN public.events e ON e.id = rv.event_id
      WHERE m.created_at > now() - make_interval(days => v_days)
        AND m.shared_review_id IS NOT NULL
        AND COALESCE(rv.artist_id, e.artist_id) IS NOT NULL
      UNION ALL
      SELECT 'venue', COALESCE(rv.venue_id, e.venue_id), 'shares'
      FROM public.messages m
      JOIN public.reviews rv ON rv.id = m.shared_review_id
      LEFT JOIN public.events e ON e.id = rv.event_id
      WHERE m.created_at > now() - make_interval(days => v_days)
        AND m.shared_review_id IS NOT NULL
        AND COALESCE(rv.venue_id, e.venue_id) IS NOT NULL
      UNION ALL
      SELECT
        i.entity_type,
        COALESCE(
          i.entity_uuid,
          CASE
            WHEN i.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN i.entity_id::uuid
          END
        ),
        'shares'
      FROM public.interactions i
      WHERE i.occurred_at > now() - make_interval(days => v_days)
        AND i.event_type = 'share'
        AND i.entity_type IN ('event', 'artist', 'venue')

      UNION ALL
      SELECT 'event', r.event_id, 'interested'
      FROM public.user_event_relationships r
      WHERE r.created_at > now() - make_interval(days => v_days)
        AND r.relationship_type = 'interested'
      UNION ALL
      SELECT 'event', r.event_id, 'going'
      FROM public.user_event_relationships r
      WHERE r.created_at > now() - make_interval(days => v_days)
        AND r.relationship_type = 'going'
    ),
    credited AS (
      SELECT kind, entity_id, channel FROM raw WHERE entity_id IS NOT NULL
      UNION ALL
      SELECT 'artist', e.artist_id, t.channel
      FROM raw t
      JOIN public.events e ON e.id = t.entity_id
      WHERE t.kind = 'event'
        AND t.channel IN ('feeds', 'emails', 'searches', 'shares')
        AND e.artist_id IS NOT NULL
      UNION ALL
      SELECT 'venue', e.venue_id, t.channel
      FROM raw t
      JOIN public.events e ON e.id = t.entity_id
      WHERE t.kind = 'event'
        AND t.channel IN ('feeds', 'emails', 'searches', 'shares')
        AND e.venue_id IS NOT NULL
    )
    SELECT kind, entity_id, channel, count(*)::integer AS n
    FROM credited
    GROUP BY kind, entity_id, channel;

    WITH ranked AS (
      SELECT
        t.kind,
        t.entity_id,
        COALESCE(sum(t.n) FILTER (WHERE t.channel = 'feeds'), 0) AS feeds,
        COALESCE(sum(t.n) FILTER (WHERE t.channel = 'reviews'), 0) AS reviews,
        COALESCE(sum(t.n) FILTER (WHERE t.channel = 'review_views'), 0) AS review_views,
        COALESCE(sum(t.n) FILTER (WHERE t.channel = 'emails'), 0) AS emails,
        COALESCE(sum(t.n) FILTER (WHERE t.channel = 'searches'), 0) AS searches,
        COALESCE(sum(t.n) FILTER (WHERE t.channel = 'shares'), 0) AS shares,
        COALESCE(sum(t.n) FILTER (WHERE t.channel = 'interested'), 0) AS interested,
        COALESCE(sum(t.n) FILTER (WHERE t.channel = 'going'), 0) AS going,
        sum(t.n) AS score
      FROM jb_touch t
      GROUP BY t.kind, t.entity_id
    ),
    shaped AS (
      SELECT
        r.kind,
        jsonb_build_object(
          'id', r.entity_id,
          'name', CASE r.kind
            WHEN 'event' THEN e.title
            WHEN 'artist' THEN a.name
            ELSE v.name
          END,
          'title', CASE WHEN r.kind = 'event' THEN e.title END,
          'event_date', e.event_date,
          'artist_name', COALESCE(ea.name, CASE WHEN r.kind = 'artist' THEN a.name END),
          'venue_name', COALESCE(ev.name, CASE WHEN r.kind = 'venue' THEN v.name END),
          'city', COALESCE(e.venue_city, v.city),
          'feeds', r.feeds,
          'reviews', r.reviews,
          'review_views', r.review_views,
          'emails', r.emails,
          'searches', r.searches,
          'shares', r.shares,
          'interested', r.interested,
          'going', r.going,
          'score', r.score,
          'issues', CASE
            WHEN r.kind = 'event' AND e.source = 'jambase' AND public.event_is_festival(e.title) THEN '["festival"]'::jsonb
            WHEN r.kind <> 'event' OR h.id IS NULL THEN NULL
            WHEN h.is_clean THEN '[]'::jsonb
            ELSE to_jsonb(public.hygiene_issues(
              CASE WHEN NOT h.artist_ok THEN 'artist' END,
              CASE WHEN NOT h.venue_ok THEN 'venue' END,
              CASE WHEN NOT h.title_ok THEN 'title' END,
              CASE WHEN NOT h.date_ok THEN 'event_date' END,
              CASE WHEN NOT h.tickets_ok THEN 'tickets' END,
              CASE WHEN NOT h.genres_ok THEN 'genres' END,
              CASE WHEN h.genres_unresolved THEN 'genres_unresolved' END,
              CASE WHEN h.genres_should_inherit THEN 'genres_should_inherit' END
            ))
          END
        ) AS row,
        r.score,
        e.event_date
      FROM ranked r
      LEFT JOIN public.events e ON r.kind = 'event' AND e.id = r.entity_id
      LEFT JOIN public.artists a ON r.kind = 'artist' AND a.id = r.entity_id
      LEFT JOIN public.venues v ON r.kind = 'venue' AND v.id = r.entity_id
      LEFT JOIN public.artists ea ON ea.id = e.artist_id
      LEFT JOIN public.venues ev ON ev.id = e.venue_id
      LEFT JOIN jb_upcoming h ON h.id = r.entity_id AND r.kind = 'event'
      WHERE r.score > 0
    )
    SELECT jsonb_build_object(
      'events', COALESCE((
        SELECT jsonb_agg(s.row ORDER BY s.score DESC, s.event_date)
        FROM (SELECT row, score, event_date FROM shaped WHERE kind = 'event' ORDER BY score DESC, event_date LIMIT 20) s
      ), '[]'::jsonb),
      'artists', COALESCE((
        SELECT jsonb_agg(s.row ORDER BY s.score DESC)
        FROM (SELECT row, score FROM shaped WHERE kind = 'artist' ORDER BY score DESC LIMIT 20) s
      ), '[]'::jsonb),
      'venues', COALESCE((
        SELECT jsonb_agg(s.row ORDER BY s.score DESC)
        FROM (SELECT row, score FROM shaped WHERE kind = 'venue' ORDER BY score DESC LIMIT 20) s
      ), '[]'::jsonb)
    )
    INTO v_trending;

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
