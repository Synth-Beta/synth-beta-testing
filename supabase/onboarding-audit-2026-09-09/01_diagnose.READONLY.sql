-- Read-only. Nothing here writes. Run top to bottom.
--
-- Context: `users.onboarding_completed = false` conflates three unrelated populations,
-- which is why the raw flag looks alarming. This file separates them so the number is
-- interpretable, and adds a recurrence monitor for the bug that is now fixed in code.
--
-- The bug (fixed 2026-09-02, commit 1a522681): mobile completeOnboarding() used
-- supabase-js .upsert(). That compiles to INSERT ... ON CONFLICT DO UPDATE, and Postgres
-- validates NOT NULL on the proposed insert tuple BEFORE arbitrating the conflict.
-- users.name and users.username are NOT NULL and were absent from the payload, so every
-- call failed 23502 and wrote nothing. artists.tsx set the local device flag first and
-- swallowed the error, so affected users looked onboarded until they reinstalled.

-- ---------------------------------------------------------------------------
-- 1. Population breakdown. This is the query that answers "why is everyone false".
-- ---------------------------------------------------------------------------
WITH f AS (
  SELECT u.user_id,
         u.username,
         u.created_at,
         u.onboarding_completed,
         u.onboarding_skipped,
         u.birthday IS NOT NULL AS did_profile_step,
         (SELECT count(*) FROM public.artist_follows af WHERE af.user_id = u.user_id) AS follows
  FROM public.users u
  WHERE coalesce(u.is_bot, false) = false
)
SELECT
  CASE
    -- The mobile onboarding flow was written 2026-07-26. Anyone older was never asked.
    WHEN onboarding_completed IS NOT TRUE AND created_at < timestamptz '2026-07-26'
      THEN 'A. legacy - predates the mobile flow, never asked'
    WHEN onboarding_completed IS NOT TRUE AND follows >= 3
      THEN 'C. BUG - finished the wizard, flag never landed'
    WHEN onboarding_completed IS NOT TRUE
      THEN 'B. genuine drop-off - started, quit before the final screen'
    ELSE 'D. completed'
  END AS population,
  count(*) AS users
FROM f
GROUP BY 1
ORDER BY 1;

-- ---------------------------------------------------------------------------
-- 2. Population C in full - the only rows that are actually wrong.
--    Reaching the final screen requires >= 3 artist follows, and the follow insert
--    runs milliseconds before the completion write. So >= 3 follows with the flag
--    still false is the signature of "finished, write died".
-- ---------------------------------------------------------------------------
SELECT u.user_id, u.username, au.email, u.created_at, u.signup_platform,
       u.birthday IS NOT NULL AS did_profile_step,
       u.acquisition_source, u.contact_email,
       count(af.artist_id) AS follows
FROM public.users u
JOIN public.artist_follows af ON af.user_id = u.user_id
LEFT JOIN auth.users au ON au.id = u.user_id
WHERE u.onboarding_completed IS NOT TRUE
  AND coalesce(u.is_bot, false) = false
GROUP BY u.user_id, u.username, au.email, u.created_at, u.signup_platform,
         u.birthday, u.acquisition_source, u.contact_email
HAVING count(af.artist_id) >= 3
ORDER BY u.created_at DESC;

-- ---------------------------------------------------------------------------
-- 3. RECURRENCE MONITOR. Run this after any onboarding change ships.
--    Every post-fix signup that reached the final screen must have the flag set.
--    Any row returned here means the write is broken again in the shipped build.
--    Expect: zero rows.
-- ---------------------------------------------------------------------------
SELECT u.username, u.created_at, u.onboarding_completed,
       count(af.artist_id) AS follows
FROM public.users u
JOIN public.artist_follows af ON af.user_id = u.user_id
WHERE u.created_at > timestamptz '2026-09-02 14:03:29+00'   -- fix commit 1a522681
  AND coalesce(u.is_bot, false) = false
  AND u.onboarding_completed IS NOT TRUE
GROUP BY u.username, u.created_at, u.onboarding_completed
HAVING count(af.artist_id) >= 3
ORDER BY u.created_at DESC;

-- ---------------------------------------------------------------------------
-- 4. Who the contact-email gate now reaches, after decoupling it from the
--    onboarding flag in mobile/app/_layout.tsx.
--    Gate fires for: apple/google provider, AND no contact_email on file, AND the
--    provider email is missing or an undeliverable Apple private-relay address.
--    (Mirrors packages/synth-shared/src/contactEmailGate.ts exactly.)
-- ---------------------------------------------------------------------------
SELECT u.username, au.email, u.onboarding_completed, u.created_at,
       au.raw_app_meta_data->>'provider' AS provider
FROM public.users u
JOIN auth.users au ON au.id = u.user_id
WHERE coalesce(u.is_bot, false) = false
  AND au.raw_app_meta_data->>'provider' IN ('apple', 'google')
  AND coalesce(btrim(u.contact_email), '') = ''
  AND (au.email IS NULL OR lower(au.email) LIKE '%@privaterelay.appleid.com')
ORDER BY u.onboarding_completed DESC, u.created_at DESC;
