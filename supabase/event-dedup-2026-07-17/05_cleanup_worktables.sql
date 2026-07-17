-- =============================================================================
-- 05 — Optional tidy-up: drop leftover dedup work tables
-- =============================================================================
-- Safe to run whenever you're confident in the venue + event dedup results.
-- These are throwaway work/mapping tables — dropping them removes NO app data.
-- Each is tiny, so this runs instantly.
-- =============================================================================

-- Event dedup work table (mapping was applied; no longer needed)
DROP TABLE IF EXISTS public.event_dedup_map;

-- Venue dedup work tables (dedup was applied; no longer needed)
DROP TABLE IF EXISTS public.venue_dedup_map;
DROP TABLE IF EXISTS public._venue_canon;
DROP TABLE IF EXISTS public._venue_canon_unique;

-- Any stray residual temp tables from re-runs (harmless if absent)
DROP TABLE IF EXISTS public._evt_null_residual;
DROP TABLE IF EXISTS public._venue_residual_map;

-- -----------------------------------------------------------------------------
-- BACKUPS — keep these as a safety net for now. They are the ONLY way to restore
-- the removed duplicate rows, so drop them only when fully confident (weeks later):
--   DROP TABLE IF EXISTS public.events_dedup_backup;      -- 6,766 removed event copies
--   DROP TABLE IF EXISTS public.users_backup_20260715;    -- partner's login-fix backup
-- -----------------------------------------------------------------------------

-- Verify what's left (these should be gone; backups may remain by choice)
SELECT relname
FROM pg_class
WHERE relkind='r' AND relnamespace='public'::regnamespace
  AND relname IN ('event_dedup_map','venue_dedup_map','_venue_canon','_venue_canon_unique',
                  '_evt_null_residual','_venue_residual_map','events_dedup_backup','users_backup_20260715')
ORDER BY relname;
