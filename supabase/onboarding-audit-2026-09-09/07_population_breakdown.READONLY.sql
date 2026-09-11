-- Read-only. Nothing here writes. Run each query on its own.
--
-- Who is where: bots / fully in the app / old users stuck in onboarding / everyone else.
--
-- Buckets are mutually exclusive and checked in this order:
--   1. bot                    users.is_bot
--   2. fully in the app       onboarding_completed = true. This is what BOTH gates read:
--                             mobile/_layout.tsx asks the server for exactly this flag, and
--                             web MainApp.tsx lets you in on completed OR skipped.
--   3. BUG                    not completed but >= 3 artist follows. The follow insert runs
--                             milliseconds before the completion write, so this is the
--                             signature of "finished, write died". Expect 0 since 1a522681.
--   4. skipped                onboarding_skipped = true. In on web, force-wizarded on mobile
--                             (mobile never reads the column). Nothing sets it any more;
--                             expect only the one legacy row (theokagan).
--   5. old user, STUCK        created before the mobile flow (2026-07-26), not completed, and
--                             HAS opened the app since -- so they met the wizard and did not
--                             finish it. This is the bucket that is actually stuck.
--   6. old user, dormant      created before 2026-07-26, not completed, and NOT seen since.
--                             Not stuck -- they have not come back. The wizard is waiting.
--   7. new user, dropped off  created after the flow shipped, started, did not finish.
--
-- WHY THE ACTIVITY SIGNAL IS BUILT THIS WAY
--   users.last_active_at looks right and is useless: nothing in web, mobile, backend or SQL
--   ever writes it (every reader falls back to `|| new Date()`), so it is a signup stamp.
--   auth.users.last_sign_in_at alone undercounts -- it only moves on a real sign-in, and
--   someone who stays logged in for months never updates it. So last_seen also takes the
--   newest auth.refresh_tokens row: supabase-js rotates the refresh token roughly hourly
--   while the app is open, creating a new row each time, so that is "last opened the app".
--   user_id is compared as text because refresh_tokens.user_id is varchar in most GoTrue
--   versions and uuid in some; ::text on both sides works either way.
--   Signing out deletes the session and its tokens, so a signed-out user falls back to
--   last_sign_in_at -- still correct, just coarser.

-- ---------------------------------------------------------------------------
-- 1. THE BREAKDOWN
-- ---------------------------------------------------------------------------
WITH refreshed AS (
  SELECT rt.user_id::text AS uid, max(rt.created_at) AS last_refresh_at
  FROM auth.refresh_tokens rt
  GROUP BY rt.user_id::text
),
u AS (
  SELECT pu.user_id,
         pu.created_at,
         coalesce(pu.is_bot, false)          AS is_bot,
         pu.onboarding_completed IS TRUE     AS completed,
         pu.onboarding_skipped IS TRUE       AS skipped,
         pu.birthday IS NOT NULL             AS did_profile_step,
         (SELECT count(*) FROM public.artist_follows af WHERE af.user_id = pu.user_id) AS follows,
         GREATEST(au.last_sign_in_at, r.last_refresh_at) AS last_seen   -- GREATEST skips NULLs
  FROM public.users pu
  LEFT JOIN auth.users au ON au.id = pu.user_id
  LEFT JOIN refreshed r   ON r.uid = pu.user_id::text
),
bucketed AS (
  SELECT *,
    CASE
      WHEN is_bot                                   THEN '1. bot'
      WHEN completed                                THEN '2. fully in the app'
      WHEN follows >= 3                             THEN '3. BUG - finished, flag never landed'
      WHEN skipped                                  THEN '4. skipped - in on web, wizard on mobile'
      WHEN created_at < timestamptz '2026-07-26'
       AND last_seen >= timestamptz '2026-07-26'    THEN '5. old user, STUCK - came back, has not finished'
      WHEN created_at < timestamptz '2026-07-26'    THEN '6. old user, dormant - not back since the flow shipped'
      ELSE                                               '7. new user, dropped off mid-onboarding'
    END AS bucket
  FROM u
)
SELECT CASE WHEN GROUPING(bucket) = 1 THEN 'TOTAL' ELSE bucket END   AS population,
       count(*)                                                       AS users,
       count(*) FILTER (WHERE last_seen >= now() - interval '30 days') AS active_last_30d,
       count(*) FILTER (WHERE did_profile_step)                       AS did_profile_step,
       round(avg(follows), 1)                                         AS avg_follows
FROM bucketed
GROUP BY ROLLUP (bucket)
ORDER BY GROUPING(bucket), bucket;


-- ---------------------------------------------------------------------------
-- 2. THE PEOPLE BEHIND THE ACTIONABLE BUCKETS (3, 4, 5, 7)
--    Bots, completers and dormant legacy users are left out -- nothing to do for them.
--    how_far_they_got reads the wizard in order: profile step (birthday) -> follows.
-- ---------------------------------------------------------------------------
WITH refreshed AS (
  SELECT rt.user_id::text AS uid, max(rt.created_at) AS last_refresh_at
  FROM auth.refresh_tokens rt
  GROUP BY rt.user_id::text
),
u AS (
  SELECT pu.user_id, pu.username, au.email, pu.signup_platform, pu.created_at,
         coalesce(pu.is_bot, false)          AS is_bot,
         pu.onboarding_completed IS TRUE     AS completed,
         pu.onboarding_skipped IS TRUE       AS skipped,
         pu.birthday IS NOT NULL             AS did_profile_step,
         (SELECT count(*) FROM public.artist_follows af WHERE af.user_id = pu.user_id) AS follows,
         GREATEST(au.last_sign_in_at, r.last_refresh_at) AS last_seen
  FROM public.users pu
  LEFT JOIN auth.users au ON au.id = pu.user_id
  LEFT JOIN refreshed r   ON r.uid = pu.user_id::text
),
bucketed AS (
  SELECT *,
    CASE
      WHEN is_bot OR completed                      THEN NULL
      WHEN follows >= 3                             THEN '3. BUG'
      WHEN skipped                                  THEN '4. skipped'
      WHEN created_at < timestamptz '2026-07-26'
       AND last_seen >= timestamptz '2026-07-26'    THEN '5. old, STUCK'
      WHEN created_at < timestamptz '2026-07-26'    THEN NULL   -- dormant
      ELSE                                               '7. new, dropped off'
    END AS bucket
  FROM u
)
SELECT bucket, username, email, signup_platform,
       created_at::date AS joined,
       last_seen::date  AS last_seen,
       CASE WHEN follows > 0      THEN 'profile done, ' || follows || '/3 artists'
            WHEN did_profile_step THEN 'profile done, 0/3 artists'
            ELSE                       'never finished profile step' END AS how_far_they_got
FROM bucketed
WHERE bucket IS NOT NULL
ORDER BY bucket, last_seen DESC NULLS LAST;
