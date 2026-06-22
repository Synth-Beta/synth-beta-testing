-- ============================================================
-- Lightweight per-user/location cache for Feed V5
-- ============================================================

BEGIN;

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

-- Wrapper RPC: returns same shape as get_personalized_feed_v5 but
-- serves cached rows when a fresh entry exists for the same key.

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
  -- Build a stable cache key from all parameters that affect results
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

  -- Try to read from cache
  SELECT c.events, c.created_at
  INTO v_cached_events, v_created_at
  FROM public.personalized_feed_cache c
  WHERE c.cache_key = v_cache_key;

  IF v_cached_events IS NOT NULL
     AND v_created_at > (NOW() - v_ttl_interval) THEN
    -- Fresh cache hit: materialize rows from JSONB array
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

  -- Cache miss or stale entry: call underlying function once, cache full result
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

  -- Upsert cache entry
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
        events     = EXCLUDED.events;

  -- Return rows from freshly computed JSON
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

COMMIT;

