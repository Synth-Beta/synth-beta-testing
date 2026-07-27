-- Run this AFTER 01_fix_ensure_public_user.sql is applied.
--
-- Backfills public.users rows for real people who signed up since the bug
-- landed (2026-07-16) and got stuck with an auth.users row but no profile:
--   lauren@gmail.com          (2026-07-21)
--   wondertommy25@gmail.com   (2026-07-22)
--   olivia.anrrich@icloud.com (2026-07-24)
--   test@synth.com            (2026-07-27)
--
-- Calls the now-fixed ensure_public_user_for_user() directly so these users
-- get a row built from their real signup metadata (actual name/username where
-- available) instead of the generic "user_XXXXXXXX" fallback. Safe to re-run —
-- the function no-ops (ON CONFLICT DO NOTHING) if a row already exists.
--
-- Run as 4 separate statements (not one DO-block transaction) — a prior
-- attempt with a single DO block looping over all 4 hit "upstream timeout"
-- and rolled back all 4 together. One statement per user means a slow/stuck
-- one can't take the others down with it, and each result is visible
-- immediately instead of only via RAISE NOTICE (which the dashboard editor
-- may not surface on timeout).

SELECT * FROM public.ensure_public_user_for_user('10d434d6-a17e-47a4-b29e-f4d2725242f5'); -- lauren@gmail.com

SELECT * FROM public.ensure_public_user_for_user('5a62bd6b-ca74-4a68-97fa-1f51ab1ee4d4'); -- wondertommy25@gmail.com

SELECT * FROM public.ensure_public_user_for_user('4ef3766e-f6dd-4267-93b4-31e0184d2da1'); -- olivia.anrrich@icloud.com

SELECT * FROM public.ensure_public_user_for_user('72fd077a-e401-4ebc-8e77-8b6182a19cf0'); -- test@synth.com

-- Verify afterward — should return 0 rows:
-- SELECT au.id, au.email FROM auth.users au LEFT JOIN public.users pu ON pu.user_id = au.id WHERE pu.user_id IS NULL;
