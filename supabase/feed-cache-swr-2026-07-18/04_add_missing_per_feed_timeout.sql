-- =============================================================================
-- 04 — Restore the missing per-feed statement_timeout (fix incomplete 03 apply)
-- =============================================================================
-- Checked the LIVE function on 2026-07-27 (pg_get_functiondef) against
-- 03_throttle_refresh_worker.sql. Two of the three planned layers are live:
--   - the 25s v_deadline / EXIT WHEN clock_timestamp() check   -> PRESENT
--   - the cron batch size drop 200 -> 25                       -> PRESENT
-- But the third layer is MISSING from the deployed function body:
--   PERFORM set_config('statement_timeout', '8000', true);
--
-- Without that line, the 25s deadline is only re-checked BETWEEN loop
-- iterations. It does nothing to bound a single slow get_personalized_feed_v5
-- call while it's running. 03's own comment already documented some feeds
-- take ~20s+ individually — with no per-call cap, one or two bad users can
-- blow straight through the "budget" in a single iteration.
--
-- Live evidence (Postgres logs, 2026-07-27 ~18:44 UTC):
--   duration: 84592.534 ms  Query Text: SELECT public.process_feed_cache_refresh_queue(25);
-- 84.6s for a 25-row batch that's supposed to bail out at 25s is consistent
-- with exactly this gap: one iteration ran ~60s+ past the deadline check
-- because nothing was capping it from the inside.
--
-- This sustained per-call runtime is the leading suspect for the project's
-- "about to deplete Disk IO Budget" warning (cron fires every 1 minute; even
-- a fraction of ticks running 80s+ instead of ~25s is a lot of extra sustained
-- I/O). It's a shared-resource issue: once the IO budget hits baseline
-- (5 MB/s), EVERY query on this Postgres instance slows down, including
-- Supabase Auth — so yes, this can manifest as slow/failing sign-ins.
--
-- FIX: add back just the missing line. No other behavior changes; the
-- deadline/reschedule logic already live is left untouched.
-- SAFETY: replaces one function (adds a local, transaction-scoped
-- statement_timeout only). No data changed. Idempotent.
--
-- WHY THE FIRST ATTEMPT TIMED OUT (2026-07-27): CREATE OR REPLACE FUNCTION
-- needs an exclusive lock on this function. The drain cron fires every
-- 60 seconds and individual calls have been observed running up to 84s, so
-- there's a real chance a call is still in-flight when you run this — the
-- REPLACE then queues behind that lock, and the SQL editor's own connection
-- gives up first ("Connection terminated due to connection timeout") even
-- though the DDL might eventually go through once the in-flight call ends.
--
-- Run in THIS order to avoid the lock wait entirely:
--   1. Pause the job so no new call starts:
--        SELECT cron.alter_job(job_id, active := false)
--        FROM cron.job WHERE jobname = 'feed-cache-drain';
--   2. Confirm nothing is still running (should return 0 rows — if it
--      returns a row, wait for it to finish, then re-check):
--        SELECT pid, now() - query_start AS running_for
--        FROM pg_stat_activity
--        WHERE query ILIKE '%process_feed_cache_refresh_queue%'
--          AND pid <> pg_backend_pid();
--   3. Run the CREATE OR REPLACE FUNCTION block below.
--   4. Resume the job:
--        SELECT cron.alter_job(job_id, active := true)
--        FROM cron.job WHERE jobname = 'feed-cache-drain';
-- Review, then apply yourself.
-- =============================================================================

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
  v_deadline TIMESTAMPTZ := clock_timestamp() + interval '25 seconds';
BEGIN
  -- Cap EACH recompute so one pathologically-slow user's feed (seen at ~20s+) can't
  -- dominate a whole run. A feed that exceeds this raises, is caught below, and is
  -- re-queued for a later tick; meanwhile stale-while-revalidate keeps serving them.
  -- (This is the line that was missing from the live function.)
  PERFORM set_config('statement_timeout', '8000', true);  -- 8s, local to this txn

  FOR r IN
    SELECT cache_key, params
    FROM public.feed_cache_refresh_queue
    ORDER BY requested_at ASC
    LIMIT GREATEST(p_max, 0)
    FOR UPDATE SKIP LOCKED
  LOOP
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

-- ---- VERIFY -----------------------------------------------------------------
-- After a few minutes, runtimes should drop to well under 25s consistently:
--   SELECT j.jobname, r.status, r.return_message,
--          round(extract(epoch FROM (r.end_time - r.start_time)),1) AS secs, r.start_time
--   FROM cron.job_run_details r JOIN cron.job j USING (jobid)
--   WHERE j.jobname = 'feed-cache-drain' ORDER BY r.start_time DESC LIMIT 20;

-- ROLLBACK: re-run 03_throttle_refresh_worker.sql's function definition
--   (restores the version without the per-feed statement_timeout).
