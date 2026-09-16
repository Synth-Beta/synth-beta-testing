-- Read-only. Nothing here writes. Run each query on its own.
--
-- WHAT THIS IS MEASURING
-- src/components/onboarding/ProfileSetupStep.tsx checked username availability WITHOUT
-- excluding the signed-in user's own row. The signup trigger (ensure_public_user, see
-- supabase/migrations/20260716130000 + 20260813030000) inserts public.users with a
-- username BEFORE onboarding ever runs, and OnboardingFlow prefills that username into
-- the form. So the check found the user's own row and returned "This username is already
-- taken", validateAndGetData returned valid:false, and handleCompleteSetup refused to
-- submit. A new web user could only finish by typing a DIFFERENT username than the one
-- they were handed. Mobile was never affected (it passes .neq('user_id', userId)).
--
-- Fixed 2026-09-16 by passing excludeUserId at both call sites. These queries size how
-- many signups it cost, and confirm the fix by watching completion rates after deploy.
--
-- CAVEAT ON PLATFORM: users.signup_platform is derived from the auth provider
-- ('email' / 'ios' / 'android'), NOT the device. Apple and Google signups are effectively
-- mobile; 'email' is mostly web but not provably so. Read the gap between them, not the
-- absolute numbers.

-- ---------------------------------------------------------------------------
-- 1. COMPLETION RATE BY WEEK AND PLATFORM
--    If the wall is real, 'email' completion should be far below 'ios'/'android'
--    for every week since mid-July, and should jump after the fix deploys.
-- ---------------------------------------------------------------------------
SELECT date_trunc('week', pu.created_at)::date            AS week,
       coalesce(pu.signup_platform, 'unknown')            AS platform,
       count(*)                                           AS signups,
       count(*) FILTER (WHERE pu.onboarding_completed)    AS completed,
       count(*) FILTER (WHERE pu.birthday IS NOT NULL)    AS reached_profile_save,
       round(100.0 * count(*) FILTER (WHERE pu.onboarding_completed) / count(*))
                                                          AS pct_completed
FROM public.users pu
WHERE coalesce(pu.is_bot, false) = false
  AND pu.created_at >= now() - interval '120 days'
GROUP BY 1, 2
ORDER BY 1 DESC, 2;


-- ---------------------------------------------------------------------------
-- 2. THE PEOPLE IT MAY HAVE COST
--    Signed up, got an account, never saved a profile. acquisition_source is NULL for
--    all of them because it is written by the same blocked submit.
--    seconds_in_app = how long between the row appearing and the last sign of life.
--    A handful of seconds means they hit something and left.
-- ---------------------------------------------------------------------------
WITH refreshed AS (
  SELECT rt.user_id::text AS uid, max(rt.created_at) AS last_refresh_at
  FROM auth.refresh_tokens rt
  GROUP BY rt.user_id::text
)
SELECT pu.username,
       au.email,
       coalesce(pu.signup_platform, 'unknown')                     AS platform,
       pu.created_at,
       GREATEST(au.last_sign_in_at, r.last_refresh_at)             AS last_seen,
       round(EXTRACT(epoch FROM
         GREATEST(au.last_sign_in_at, r.last_refresh_at) - pu.created_at))  AS seconds_in_app,
       pu.onboarding_completed,
       pu.birthday IS NOT NULL                                     AS reached_profile_save,
       (SELECT count(*) FROM public.artist_follows af WHERE af.user_id = pu.user_id) AS follows
FROM public.users pu
LEFT JOIN auth.users au ON au.id = pu.user_id
LEFT JOIN refreshed r   ON r.uid = pu.user_id::text
WHERE coalesce(pu.is_bot, false) = false
  AND pu.onboarding_completed IS NOT TRUE
  AND pu.birthday IS NULL
  AND pu.created_at >= timestamptz '2026-07-16'   -- when the trigger began pre-assigning usernames
ORDER BY pu.created_at DESC;


-- ---------------------------------------------------------------------------
-- 3. THE CONTROL GROUP
--    Users who DID finish since 2026-07-16. If the wall is real, these are the people
--    who happened to type a different username than the one prefilled for them.
--    Compare username to the local-part of their email / their name: a completer whose
--    username still matches the derived default would contradict the theory.
-- ---------------------------------------------------------------------------
SELECT pu.username,
       au.email,
       split_part(au.email, '@', 1)            AS email_local_part,
       lower(regexp_replace(pu.name, '[^a-zA-Z0-9]', '', 'g')) AS name_derived_default,
       coalesce(pu.signup_platform, 'unknown') AS platform,
       pu.created_at::date                     AS joined,
       pu.acquisition_source
FROM public.users pu
LEFT JOIN auth.users au ON au.id = pu.user_id
WHERE coalesce(pu.is_bot, false) = false
  AND pu.onboarding_completed IS TRUE
  AND pu.created_at >= timestamptz '2026-07-16'
ORDER BY pu.created_at DESC;
