-- =============================================================================
-- 03 — Throttle the feed-cache refresh worker (fix 80–93s runs + statement timeouts)
-- =============================================================================
-- REGRESSION (observed in Postgres logs 2026-07-21): the 'feed-cache-drain' cron
--   SELECT public.process_feed_cache_refresh_queue(200);   -- every 1 minute
-- was taking 80–93 SECONDS and hitting "canceling statement due to statement
-- timeout". Recomputing up to 200 slow get_personalized_feed_v5 feeds per run is far
-- too heavy: the job overruns its own 1-minute schedule and pins the DB.
--
-- FIX (three layers):
--   1. PER-FEED CAP: statement_timeout=8s inside the worker, so no single slow
--      get_personalized_feed_v5 (some take ~20s+) can dominate a run. A feed that
--      exceeds it is caught + re-queued; SWR keeps serving that user meanwhile.
--   2. Give the worker an INTERNAL TIME BUDGET (clock_timestamp based) so it stops
--      after ~25s no matter how many/slow the queued feeds are — it can never run
--      away again. Whatever it didn't finish stays queued for the next tick.
--   3. Shrink the cron batch sizes (drain 200→25, prewarm 500→100). With the time
--      budget this is belt-and-suspenders, but it keeps each tick cheap.
--
-- (Deeper root cause, not fixed here: get_personalized_feed_v5 is slow for some
--  users — worth profiling/optimizing separately so their caches refresh fully.)
--
-- SAFETY: replaces one function (adds a stop condition; same signature/behavior
-- otherwise) and reschedules two cron jobs. No data changed. Idempotent.
-- Review, then apply yourself.
-- =============================================================================

-- ---- 1) Worker with a time budget ------------------------------------------
CREATE OR REPLACE FUNCTION public.process_feed_cache_refresh_queue(p_max integer DEFAULT 200)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r        RECORD;
  p        JSONB;
  v_events JSONB;
  v_count  INTEGER := 0;
  -- Stop cleanly well before any 1-minute schedule / statement timeout. Leftover
  -- rows remain queued and get picked up on the next tick.
  v_deadline TIMESTAMPTZ := clock_timestamp() + interval '25 seconds';
BEGIN
  -- Cap EACH recompute so one pathologically-slow user's feed (seen at ~20s+) can't
  -- dominate a whole run. A feed that exceeds this raises, is caught below, and is
  -- re-queued for a later tick; meanwhile stale-while-revalidate keeps serving them.
  PERFORM set_config('statement_timeout', '8000', true);  -- 8s, local to this txn
  FOR r IN
    SELECT cache_key, params
    FROM public.feed_cache_refresh_queue
    ORDER BY requested_at ASC
    LIMIT GREATEST(p_max, 0)
    FOR UPDATE SKIP LOCKED
  LOOP
    -- Time budget: bail out (don't start another slow recompute) once we're past it.
    EXIT WHEN clock_timestamp() > v_deadline;

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
      UPDATE public.feed_cache_refresh_queue q
        SET requested_at = NOW()
        WHERE q.cache_key = r.cache_key;
    END;
  END LOOP;

  RETURN v_count;
END;
$$;

-- ---- 2) Reschedule the cron jobs with smaller batches ----------------------
DO $$
BEGIN
  PERFORM cron.unschedule('feed-cache-drain')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='feed-cache-drain');
  PERFORM cron.unschedule('feed-cache-prewarm') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='feed-cache-prewarm');
END $$;

-- Drain every minute, but at most 25 recomputes (and ≤25s) per tick.
SELECT cron.schedule('feed-cache-drain',   '* * * * *',   $$SELECT public.process_feed_cache_refresh_queue(25);$$);
-- Pre-warm every 3 min, cap enqueue at 100 so the queue can't balloon.
SELECT cron.schedule('feed-cache-prewarm', '*/3 * * * *', $$SELECT public.prewarm_feed_caches(100);$$);

-- ---- VERIFY -----------------------------------------------------------------
SELECT jobname, schedule, command FROM cron.job
WHERE jobname IN ('feed-cache-drain','feed-cache-prewarm') ORDER BY jobname;

-- After a few minutes, runtimes should be small and timeouts gone:
--   SELECT j.jobname, r.status, r.return_message,
--          round(extract(epoch FROM (r.end_time - r.start_time)),1) AS secs, r.start_time
--   FROM cron.job_run_details r JOIN cron.job j USING (jobid)
--   WHERE j.jobname LIKE 'feed-cache-%' ORDER BY r.start_time DESC LIMIT 20;
--
-- Queue should stay small (not grow unbounded):
--   SELECT count(*) AS queued FROM public.feed_cache_refresh_queue;

-- ROLLBACK: re-run 01_stale_while_revalidate.sql (restores the un-budgeted worker)
--   and 02_schedule_cron.sql (restores batch 200/500).
