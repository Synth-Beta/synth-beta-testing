-- =============================================================================
-- 01 — Persistent retry queue for JamBase sync page failures
-- =============================================================================
-- WHY: sync-jambase-incremental-3nf.mjs retries a failed page 3x inline, then
-- once more at the end of the same run. If it still fails, the events on that
-- page are simply logged and forgotten — the next run's dateModifiedFrom
-- watermark only advances based on what DID succeed, so a permanently-failed
-- page's events are never automatically revisited. This table lets the sync
-- script persist exactly which page + query params failed, so a future run
-- can replay that exact request until it succeeds or is escalated.
--
-- run_key is a deterministic string (not raw columns) because a plain
-- UNIQUE(page, date_modified_from, upcoming_catalog) would NOT correctly
-- de-duplicate catalog-mode rows: SQL treats NULL as distinct from NULL, and
-- date_modified_from is always null in catalog mode, so two catalog-mode
-- failures for the same page would insert as two separate rows instead of
-- updating one. A single always-non-null text key sidesteps that entirely.
--
-- SAFETY: purely additive, no existing tables touched. Idempotent (CREATE
-- TABLE IF NOT EXISTS). Review, then apply yourself.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.jambase_sync_failed_pages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_key text NOT NULL,
  page integer NOT NULL,
  per_page integer NOT NULL,
  date_modified_from timestamptz,
  event_date_from date,
  upcoming_catalog boolean NOT NULL DEFAULT false,
  first_failed_at timestamptz NOT NULL DEFAULT now(),
  last_attempted_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 1,
  last_error text,
  resolved_at timestamptz,
  alerted boolean NOT NULL DEFAULT false,
  CONSTRAINT jambase_sync_failed_pages_run_key_unique UNIQUE (run_key)
);

REVOKE ALL ON public.jambase_sync_failed_pages FROM anon, authenticated;

-- ---- VERIFY -----------------------------------------------------------------
SELECT count(*) AS table_exists_expect_1
FROM information_schema.tables
WHERE table_schema = 'public' AND table_name = 'jambase_sync_failed_pages';

SELECT has_table_privilege('anon', 'public.jambase_sync_failed_pages', 'SELECT') AS anon_can_read_expect_false;

-- ---- ROLLBACK -----------------------------------------------------------------
--   DROP TABLE IF EXISTS public.jambase_sync_failed_pages;
