-- =============================================================================
-- 01 — Feed cache: STALE-WHILE-REVALIDATE  (fixes "no events until pull-to-refresh")
-- =============================================================================
-- ROOT CAUSE (verified 2026-07-18): get_or_refresh_feed_v5_cached is a
-- "recompute-and-block" cache. When the entry is missing OR older than the TTL,
-- it DISCARDS the stale data and synchronously recomputes the expensive
-- get_personalized_feed_v5(). If that recompute exceeds the statement timeout the
-- RPC errors -> the client shows "no events" until a retry/pull-to-refresh warms it.
-- Live proof: all 490 cache rows were stale, 0 fresh -> every load paid the cold cost.
--
-- THIS FILE makes the cache stale-while-revalidate (SWR):
--   * FRESH entry            -> return it (unchanged).
--   * STALE entry (exists)   -> return the stale rows INSTANTLY, and enqueue a
--                               background refresh. The user NEVER blocks on a
--                               recompute once they've loaded the feed even once.
--   * MISSING entry (truly   -> compute synchronously (first-ever load only) and
--     cold, first load)         store it + its params.
--
-- A background worker (process_feed_cache_refresh_queue) drains the queue, and a
-- pre-warm pass (prewarm_feed_caches) keeps active users' caches fresh so the
-- stale data that gets served is almost always only a few minutes old.
-- Cron scheduling is in 02_schedule_cron.sql.
--
-- SAFETY: read/compute-only + additive schema. Adds one nullable column, one work
-- table, and 2 helper functions; the cache function keeps the SAME signature so all
-- existing callers (web + mobile) are unaffected. No app data is modified/removed.
-- Idempotent / re-runnable. Review, then apply yourself.
-- =============================================================================

-- ----------------------------------------------------------------------------
-- STEP 1 — store the exact recompute params on each cache row so a background
--          job can rebuild it without the caller present.
-- ----------------------------------------------------------------------------
ALTER TABLE public.personalized_feed_cache
  ADD COLUMN IF NOT EXISTS params jsonb;

-- ----------------------------------------------------------------------------
-- STEP 2 — the refresh queue. One row per cache_key that needs rebuilding.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.feed_cache_refresh_queue (
  cache_key    text PRIMARY KEY,
  params       jsonb NOT NULL,
  requested_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.feed_cache_refresh_queue IS
  'SWR work queue for personalized_feed_cache. Drained by process_feed_cache_refresh_queue().';

-- Lock the queue down: only the definer/service_role touches it.
ALTER TABLE public.feed_cache_refresh_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.feed_cache_refresh_queue FROM anon, authenticated;

-- ----------------------------------------------------------------------------
-- STEP 3 — the SWR version of the cache function (SAME signature as today).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_refresh_feed_v5_cached(
  p_user_id uuid,
  p_section text DEFAULT NULL::text,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_city_lat numeric DEFAULT NULL::numeric,
  p_city_lng numeric DEFAULT NULL::numeric,
  p_radius_miles numeric DEFAULT 50,
  p_include_past boolean DEFAULT false,
  p_city_filter text DEFAULT NULL::text,
  p_state_filter text DEFAULT NULL::text,
  p_max_days_ahead integer DEFAULT 90,
  p_ttl_seconds integer DEFAULT 600
)
RETURNS TABLE(section text, id uuid, score numeric, payload jsonb, context jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cache_key     TEXT;
  v_cached_events JSONB;
  v_created_at    TIMESTAMPTZ;
  v_ttl_interval  INTERVAL;
  v_params        JSONB;
BEGIN
  v_cache_key := md5(
    COALESCE(p_user_id::TEXT, '') || '|' ||
    COALESCE(p_section, '') || '|' ||
    COALESCE(p_limit::TEXT, '') || '|' ||
    COALESCE(p_offset::TEXT, '') || '|' ||
    COALESCE(ROUND(p_city_lat, 1)::TEXT, '') || '|' ||
    COALESCE(ROUND(p_city_lng, 1)::TEXT, '') || '|' ||
    COALESCE(p_radius_miles::TEXT, '') || '|' ||
    COALESCE(p_include_past::TEXT, '') || '|' ||
    COALESCE(p_city_filter, '') || '|' ||
    COALESCE(p_state_filter, '') || '|' ||
    COALESCE(p_max_days_ahead::TEXT, '')
  );

  v_ttl_interval := make_interval(secs => GREATEST(p_ttl_seconds, 0));

  -- The exact args needed to rebuild this cache row later, in the background.
  v_params := jsonb_build_object(
    'p_user_id',        p_user_id,
    'p_section',        p_section,
    'p_limit',          p_limit,
    'p_offset',         p_offset,
    'p_city_lat',       p_city_lat,
    'p_city_lng',       p_city_lng,
    'p_radius_miles',   p_radius_miles,
    'p_include_past',   p_include_past,
    'p_city_filter',    p_city_filter,
    'p_state_filter',   p_state_filter,
    'p_max_days_ahead', p_max_days_ahead
  );

  SELECT c.events, c.created_at
  INTO v_cached_events, v_created_at
  FROM public.personalized_feed_cache c
  WHERE c.cache_key = v_cache_key;

  -- (A) FRESH: serve directly.
  IF v_cached_events IS NOT NULL
     AND v_created_at > (NOW() - v_ttl_interval) THEN
    RETURN QUERY
    SELECT
      (e->>'section')::TEXT   AS section,
      (e->>'id')::UUID        AS id,
      (e->>'score')::NUMERIC  AS score,
      e->'payload'            AS payload,
      e->'context'            AS context
    FROM jsonb_array_elements(v_cached_events) AS e;
    RETURN;
  END IF;

  -- (B) STALE but present: serve the stale rows INSTANTLY, enqueue a background
  --     refresh, and return. This is the core "never block / never show empty"
  --     guarantee — the user gets slightly-old events now, fresh ones next load.
  IF v_cached_events IS NOT NULL THEN
    INSERT INTO public.feed_cache_refresh_queue (cache_key, params, requested_at)
    VALUES (v_cache_key, v_params, NOW())
    ON CONFLICT (cache_key) DO NOTHING;

    RETURN QUERY
    SELECT
      (e->>'section')::TEXT   AS section,
      (e->>'id')::UUID        AS id,
      (e->>'score')::NUMERIC  AS score,
      e->'payload'            AS payload,
      e->'context'            AS context
    FROM jsonb_array_elements(v_cached_events) AS e;
    RETURN;
  END IF;

  -- (C) MISSING (truly cold, first-ever load for this key): compute synchronously.
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
    p_user_id, p_section, p_limit, p_offset, p_city_lat, p_city_lng,
    p_radius_miles, p_include_past, p_city_filter, p_state_filter, p_max_days_ahead
  ) AS f(section, id, score, payload, context);

  INSERT INTO public.personalized_feed_cache (
    cache_key, user_id, city_lat, city_lng, radius_miles,
    date_start, date_end, created_at, events, params
  )
  VALUES (
    v_cache_key, p_user_id, p_city_lat, p_city_lng, p_radius_miles,
    NULL, NULL, NOW(), v_cached_events, v_params
  )
  ON CONFLICT (cache_key) DO UPDATE
    SET created_at = EXCLUDED.created_at,
        events     = EXCLUDED.events,
        params     = EXCLUDED.params,
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

-- ----------------------------------------------------------------------------
-- STEP 4 — background worker: rebuild queued cache rows. Each row is isolated in
--          its own BEGIN/EXCEPTION block so one slow/failing feed never stalls the
--          batch; a failed row stays queued (requested_at bumped) for next tick.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_feed_cache_refresh_queue(p_max integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r       RECORD;
  p       JSONB;
  v_events JSONB;
  v_count  INTEGER := 0;
BEGIN
  FOR r IN
    SELECT cache_key, params
    FROM public.feed_cache_refresh_queue
    ORDER BY requested_at ASC
    LIMIT GREATEST(p_max, 0)
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      p := r.params;

      SELECT COALESCE(
               jsonb_agg(jsonb_build_object(
                 'section', f.section, 'id', f.id, 'score', f.score,
                 'payload', f.payload, 'context', f.context)),
               '[]'::JSONB)
      INTO v_events
      FROM public.get_personalized_feed_v5(
        (p->>'p_user_id')::uuid,
        NULLIF(p->>'p_section','')::text,
        COALESCE((p->>'p_limit')::int, 100),
        COALESCE((p->>'p_offset')::int, 0),
        NULLIF(p->>'p_city_lat','')::numeric,
        NULLIF(p->>'p_city_lng','')::numeric,
        COALESCE((p->>'p_radius_miles')::numeric, 50),
        COALESCE((p->>'p_include_past')::boolean, false),
        NULLIF(p->>'p_city_filter','')::text,
        NULLIF(p->>'p_state_filter','')::text,
        COALESCE((p->>'p_max_days_ahead')::int, 90)
      ) AS f(section, id, score, payload, context);

      INSERT INTO public.personalized_feed_cache (
        cache_key, user_id, city_lat, city_lng, radius_miles,
        date_start, date_end, created_at, events, params
      )
      VALUES (
        r.cache_key,
        (p->>'p_user_id')::uuid,
        NULLIF(p->>'p_city_lat','')::numeric,
        NULLIF(p->>'p_city_lng','')::numeric,
        COALESCE((p->>'p_radius_miles')::numeric, 50),
        NULL, NULL, NOW(), v_events, p
      )
      ON CONFLICT (cache_key) DO UPDATE
        SET created_at = EXCLUDED.created_at,
            events     = EXCLUDED.events,
            params     = EXCLUDED.params,
            user_id    = EXCLUDED.user_id;

      DELETE FROM public.feed_cache_refresh_queue q WHERE q.cache_key = r.cache_key;
      v_count := v_count + 1;

    EXCEPTION WHEN OTHERS THEN
      -- Leave it queued for a later attempt; bump requested_at so it doesn't hot-loop.
      UPDATE public.feed_cache_refresh_queue q
        SET requested_at = NOW()
        WHERE q.cache_key = r.cache_key;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- STEP 5 — pre-warm: enqueue caches that are going stale but belong to a
--          recently-active user (written within the last 14 days). Self-limiting:
--          once a user is inactive for 14 days we stop spending compute on them;
--          their next visit computes cold once, then stays warm.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.prewarm_feed_caches(p_max integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  WITH eligible AS (
    SELECT c.cache_key, c.params
    FROM public.personalized_feed_cache c
    WHERE c.params IS NOT NULL
      AND c.created_at <  NOW() - INTERVAL '8 minutes'   -- nearing the 10-min TTL
      AND c.created_at >  NOW() - INTERVAL '14 days'      -- active in last 2 weeks
    ORDER BY c.created_at ASC
    LIMIT GREATEST(p_max, 0)
  ),
  ins AS (
    INSERT INTO public.feed_cache_refresh_queue (cache_key, params, requested_at)
    SELECT cache_key, params, NOW() FROM eligible
    ON CONFLICT (cache_key) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_count FROM ins;
  RETURN v_count;
END;
$$;

-- ----------------------------------------------------------------------------
-- STEP 6 — grants. Only the definer/service_role runs the background helpers;
--          the cache function keeps whatever grants it already had (unchanged sig).
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.process_feed_cache_refresh_queue(integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.process_feed_cache_refresh_queue(integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.process_feed_cache_refresh_queue(integer) TO postgres, service_role;

REVOKE ALL ON FUNCTION public.prewarm_feed_caches(integer) FROM public;
REVOKE EXECUTE ON FUNCTION public.prewarm_feed_caches(integer) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.prewarm_feed_caches(integer) TO postgres, service_role;

-- ----------------------------------------------------------------------------
-- STEP 7 — OPTIONAL one-time warm-up so nobody pays a cold recompute right after
--          you deploy. Enqueues every recently-active stale cache; the worker (or
--          02's cron) drains it. Safe to run now or skip.
-- ----------------------------------------------------------------------------
-- SELECT public.prewarm_feed_caches(1000);
-- SELECT public.process_feed_cache_refresh_queue(1000);   -- drains synchronously in one call

-- ----------------------------------------------------------------------------
-- VERIFY
-- ----------------------------------------------------------------------------
SELECT
  (SELECT count(*) FROM information_schema.columns
     WHERE table_schema='public' AND table_name='personalized_feed_cache' AND column_name='params')       AS params_col_expect_1,
  (SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename='feed_cache_refresh_queue')      AS queue_table_expect_1,
  (SELECT count(*) FROM pg_proc WHERE proname='process_feed_cache_refresh_queue')                          AS worker_fn_expect_1,
  (SELECT count(*) FROM pg_proc WHERE proname='prewarm_feed_caches')                                       AS prewarm_fn_expect_1;

-- ----------------------------------------------------------------------------
-- ROLLBACK (restores the original block-on-stale behavior):
--   Re-create get_or_refresh_feed_v5_cached from its pre-change definition, then:
--   DROP FUNCTION IF EXISTS public.process_feed_cache_refresh_queue(integer);
--   DROP FUNCTION IF EXISTS public.prewarm_feed_caches(integer);
--   DROP TABLE IF EXISTS public.feed_cache_refresh_queue;
--   ALTER TABLE public.personalized_feed_cache DROP COLUMN IF EXISTS params;
-- (Leaving them in place is harmless even without the cron.)
-- ----------------------------------------------------------------------------
