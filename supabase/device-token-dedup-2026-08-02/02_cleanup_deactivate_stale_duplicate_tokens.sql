-- =============================================================================
-- 02 — One-time cleanup: deactivate stale duplicate device tokens
-- =============================================================================
-- WHY: see 01's header. This is the backfill half — 01 stops NEW duplicates from
-- accumulating, this cleans up the ones that already exist so affected users stop
-- getting duplicate/triplicate pushes on their very next notification (don't wait for
-- them to happen to re-register).
--
-- Live audit at the time of writing (2026-08-02):
--   SELECT user_id, count(*) FROM device_tokens WHERE is_active = true
--   GROUP BY user_id HAVING count(*) > 1;
-- returned 5 users with 2-3 simultaneously active tokens each.
--
-- This keeps only the most-recently-updated active token per (user_id, platform) and
-- deactivates the rest. No rows are deleted — deactivated tokens stay for history and
-- push_delivery_log correlation, they just stop receiving pushes until that install
-- re-registers (which flips is_active back to true).
--
-- SAFETY: only flips is_active true -> false on rows that lose the "most recent per
-- user+platform" tiebreak. A backup table records exactly which rows this touched, so
-- it's fully reversible. Idempotent — re-running finds nothing left to deactivate.
-- Run this AFTER applying 01 (so newly-registering devices don't immediately
-- re-create the same pileup while you're testing).
-- Review, then apply yourself.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public._device_token_dedup_2026_08_02_backup (
  id             uuid PRIMARY KEY,
  user_id        uuid NOT NULL,
  platform       text NOT NULL,
  deactivated_at timestamptz NOT NULL DEFAULT now()
);

WITH ranked AS (
  SELECT
    id, user_id, platform,
    row_number() OVER (
      PARTITION BY user_id, platform
      ORDER BY updated_at DESC, created_at DESC
    ) AS rn
  FROM public.device_tokens
  WHERE is_active = true
),
to_deactivate AS (
  SELECT id, user_id, platform FROM ranked WHERE rn > 1
)
INSERT INTO public._device_token_dedup_2026_08_02_backup (id, user_id, platform)
SELECT id, user_id, platform FROM to_deactivate
ON CONFLICT (id) DO NOTHING;

UPDATE public.device_tokens dt
SET is_active = false, updated_at = now()
WHERE dt.id IN (SELECT id FROM public._device_token_dedup_2026_08_02_backup)
  AND dt.is_active = true;

-- ---- VERIFY -----------------------------------------------------------------
-- Expect 0 rows: no user+platform pair should have more than 1 active token left.
SELECT user_id, platform, count(*) AS active_tokens
FROM public.device_tokens
WHERE is_active = true
GROUP BY user_id, platform
HAVING count(*) > 1;

-- Spot-check the incident user specifically — expect exactly 1 active ios row
-- (the newest, ExponentPushToken[...64ut2NdV94Y] from app v1.4.7):
SELECT id, platform, right(device_token, 12) AS token_tail, app_version, is_active, updated_at
FROM public.device_tokens
WHERE user_id = '349bda34-7878-4c10-9f86-ec5888e55571'
ORDER BY updated_at DESC;

-- How many rows this cleanup touched, for the record:
SELECT count(*) AS rows_deactivated FROM public._device_token_dedup_2026_08_02_backup;

-- ---- ROLLBACK -----------------------------------------------------------------
--   UPDATE public.device_tokens SET is_active = true, updated_at = now()
--   WHERE id IN (SELECT id FROM public._device_token_dedup_2026_08_02_backup);
--   DROP TABLE public._device_token_dedup_2026_08_02_backup;
--
-- Tidy-up: once verified stable (no missed-push reports from the affected users for
-- a week or two), drop the backup table:
--   DROP TABLE public._device_token_dedup_2026_08_02_backup;
