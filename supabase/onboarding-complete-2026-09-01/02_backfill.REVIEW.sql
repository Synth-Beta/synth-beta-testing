-- REVIEW ONLY - do not run until approved.
--
-- Repairs users stranded by the completeOnboarding() upsert bug: `upsert` compiled to
-- INSERT ... ON CONFLICT DO UPDATE, Postgres validated NOT NULL on the proposed insert
-- tuple before arbitrating the conflict, users.name/username were absent from the
-- payload, so every call failed 23502 and mobile/app/(onboarding)/artists.tsx swallowed
-- it into a console.warn before navigating to the tabs anyway.
--
-- Who qualifies: reaching the final onboarding screen requires following >= 3 artists,
-- and that insert runs immediately before the failed write. So >= 3 artist_follows plus
-- onboarding_completed = false is the signature of "finished, but the flag never landed".
-- 7 rows matched at time of writing (testaccount3, brentonstrahla, andyroo, eliabellera,
-- andrewpeters7, joshbaim, mrrogersyo). The other 72 incomplete users have < 3 follows -
-- genuine drop-off, left alone.

BEGIN;

-- 1. Preview. Run this alone first and eyeball the list before uncommitting step 2.
SELECT u.user_id, u.username, u.created_at, u.signup_platform,
       count(af.artist_id) AS follows
FROM public.users u
JOIN public.artist_follows af ON af.user_id = u.user_id
WHERE u.onboarding_completed IS NOT TRUE
  AND coalesce(u.is_bot, false) = false
GROUP BY u.user_id, u.username, u.created_at, u.signup_platform
HAVING count(af.artist_id) >= 3
ORDER BY u.created_at DESC;

-- 2. The backfill. onboarding_skipped is left untouched: nobody in this set skipped,
--    they completed, and overwriting it would erase real state for anyone who did.
-- UPDATE public.users u
-- SET onboarding_completed = true,
--     updated_at = now()
-- WHERE u.onboarding_completed IS NOT TRUE
--   AND coalesce(u.is_bot, false) = false
--   AND (SELECT count(*) FROM public.artist_follows af WHERE af.user_id = u.user_id) >= 3;

-- 3. Verify: expect 0 rows.
-- SELECT u.username FROM public.users u
-- WHERE u.onboarding_completed IS NOT TRUE AND coalesce(u.is_bot,false) = false
--   AND (SELECT count(*) FROM public.artist_follows af WHERE af.user_id = u.user_id) >= 3;

COMMIT;
