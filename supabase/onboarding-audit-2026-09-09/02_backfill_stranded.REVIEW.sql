-- REVIEW ONLY. Step 2 is commented out. Read step 1's output before uncommenting it.
--
-- Repairs ONLY population C from 01_diagnose: users who finished the mobile wizard but
-- whose completion write died 23502 (see that file for the mechanism).
--
-- SCOPE, and why it is this narrow:
--   >= 3 artist follows is the qualifier because the final onboarding screen enforces
--   MIN_ARTISTS = 3 (mobile/app/(onboarding)/artists.tsx) and the follow insert runs
--   immediately before the completion write. Nobody reaches that screen without them.
--
--   Do NOT widen this. Marking someone complete who has < 3 follows drops them into the
--   app with no artist signal, which is exactly what get_personalized_feed_v5 needs to
--   return anything - and mobile has no way back into the wizard, so the cold feed is
--   permanent. The ~65 legacy users (created before the flow existed, 0 follows) are
--   deliberately excluded: they should get the full wizard on first mobile launch.
--
-- Idempotent and safe to re-run: the WHERE clause already excludes anyone repaired.
-- As of 2026-09-09 the only qualifying row was herbyhabecker, already repaired by hand,
-- so on a clean DB this should now select 0 rows.

BEGIN;

-- 1. Preview. Run alone. Eyeball every row before uncommenting step 2.
SELECT u.user_id, u.username, u.created_at, u.signup_platform,
       u.birthday IS NOT NULL AS did_profile_step,
       count(af.artist_id) AS follows
FROM public.users u
JOIN public.artist_follows af ON af.user_id = u.user_id
WHERE u.onboarding_completed IS NOT TRUE
  AND coalesce(u.is_bot, false) = false
GROUP BY u.user_id, u.username, u.created_at, u.signup_platform, u.birthday
HAVING count(af.artist_id) >= 3
ORDER BY u.created_at DESC;

-- 2. The repair. onboarding_skipped is left untouched on purpose: nobody in this set
--    skipped, they completed, and overwriting it would erase real state for anyone
--    who genuinely did skip.
-- UPDATE public.users u
-- SET onboarding_completed = true,
--     updated_at = now()
-- WHERE u.onboarding_completed IS NOT TRUE
--   AND coalesce(u.is_bot, false) = false
--   AND (SELECT count(*) FROM public.artist_follows af WHERE af.user_id = u.user_id) >= 3;

-- 3. Verify. Expect 0 rows.
-- SELECT u.username FROM public.users u
-- WHERE u.onboarding_completed IS NOT TRUE
--   AND coalesce(u.is_bot, false) = false
--   AND (SELECT count(*) FROM public.artist_follows af WHERE af.user_id = u.user_id) >= 3;

COMMIT;
