-- =============================================================================
-- 02 — Schedule the feed-cache background jobs (pg_cron)
-- =============================================================================
-- Run AFTER 01. Requires pg_cron (confirmed installed: v1.6).
--
--   feed-cache-drain   : every minute  -> rebuild anything users flagged stale (SWR)
--   feed-cache-prewarm : every 3 min   -> enqueue active caches BEFORE they expire
--
-- Together these keep active users' caches continuously fresh, so the stale rows
-- the SWR function serves are almost always only a couple minutes old, and a user
-- essentially never triggers a synchronous cold recompute after their first load.
--
-- pg_cron's finest granularity is 1 minute. Jobs run as the scheduling role
-- (postgres) which has EXECUTE on both helpers (granted in 01).
-- Idempotent: unschedules any prior job of the same name first.
-- =============================================================================

-- Clean up any previous versions of these jobs (safe if they don't exist).
DO $$
BEGIN
  PERFORM cron.unschedule('feed-cache-drain')   WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='feed-cache-drain');
  PERFORM cron.unschedule('feed-cache-prewarm') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname='feed-cache-prewarm');
END $$;

-- Drain the SWR queue every minute (rebuild caches users just found stale).
SELECT cron.schedule(
  'feed-cache-drain',
  '* * * * *',
  $$SELECT public.process_feed_cache_refresh_queue(200);$$
);

-- Pre-warm every 3 minutes: enqueue active caches nearing the TTL so they get
-- rebuilt before any user hits them stale. The drain job (or this same tick's
-- worker) then rebuilds them.
SELECT cron.schedule(
  'feed-cache-prewarm',
  '*/3 * * * *',
  $$SELECT public.prewarm_feed_caches(500);$$
);

-- ----------------------------------------------------------------------------
-- VERIFY — both jobs should be listed and active.
-- ----------------------------------------------------------------------------
SELECT jobid, jobname, schedule, active, command
FROM cron.job
WHERE jobname IN ('feed-cache-drain','feed-cache-prewarm')
ORDER BY jobname;

-- Recent run history (after a few minutes):
--   SELECT j.jobname, r.status, r.return_message, r.start_time
--   FROM cron.job_run_details r JOIN cron.job j USING (jobid)
--   WHERE j.jobname IN ('feed-cache-drain','feed-cache-prewarm')
--   ORDER BY r.start_time DESC LIMIT 20;

-- Confirm caches are staying fresh (run a while after enabling — expect fresh > 0):
--   SELECT count(*) FILTER (WHERE created_at > now()-interval '10 min') AS fresh,
--          count(*) FILTER (WHERE created_at <= now()-interval '10 min') AS stale
--   FROM public.personalized_feed_cache;

-- ----------------------------------------------------------------------------
-- ROLLBACK:
--   SELECT cron.unschedule('feed-cache-drain');
--   SELECT cron.unschedule('feed-cache-prewarm');
-- ----------------------------------------------------------------------------
