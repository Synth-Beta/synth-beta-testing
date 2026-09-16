-- Read-only. Nothing here writes. Run each query on its own.
--
-- ONBOARDING FUNNEL + THE STUCK USERS
--
-- Queries 1 and 2 work RIGHT NOW against data that already exists.
-- Queries 3 and 4 only return rows once the onboarding telemetry ships (they read
-- markers the app does not write yet) - they are here so you can watch it start working.
--
-- Background on the `interactions` table, which all of these read:
--   columns: user_id, session_id, event_type, entity_type, entity_id, entity_uuid
--   There is NO metadata column - it is dropped on write - so every fact has to live in
--   `entity_id`. That is why the block reasons are spelled into the id itself.

-- ---------------------------------------------------------------------------
-- 1. WHO WAS ON WEB?  (works now)
--    `useViewTracking('view','onboarding_one_page')` is a WEB-ONLY hook (src/hooks/), so
--    a row here proves that user reached web onboarding. users.signup_platform CANNOT
--    tell web from mobile - it records the auth provider ('email'/'ios'/'android') - so
--    this is the only way to place someone on a platform.
--
--    Run this for the 7 who never finished. For Parker specifically: a row = he was on
--    web and hit the username wall; no row = he was on mobile, where that bug never
--    existed. Views flush after 2 seconds, so absence only means something for someone
--    who stayed longer than that (Parker's session lived up to an hour, so it counts).
-- ---------------------------------------------------------------------------
SELECT pu.username,
       i.event_type,
       i.entity_type,
       i.entity_id
FROM public.users pu
LEFT JOIN public.interactions i ON i.user_id = pu.user_id
WHERE pu.username IN ('parker','psg2n2f5fy','h587p7dyp6','oliviaanrrich',
                      'wondertommy25','katzpdx','worldwideg')
ORDER BY pu.username;


-- ---------------------------------------------------------------------------
-- 2. THE CURRENT STUCK LIST  (works now)
--    Re-run this after the fixes deploy. The number should stop growing.
--    `dvtest` is the team's own account - ignore it, or set is_bot = true so it stops
--    showing up in every one of these.
-- ---------------------------------------------------------------------------
WITH refreshed AS (
  SELECT rt.user_id::text AS uid, max(rt.created_at) AS last_refresh_at
  FROM auth.refresh_tokens rt
  GROUP BY rt.user_id::text
)
SELECT pu.username,
       au.email,
       coalesce(pu.signup_platform, 'unknown')          AS auth_provider,
       pu.created_at::date                              AS joined,
       GREATEST(au.last_sign_in_at, r.last_refresh_at)::date AS last_seen,
       pu.birthday IS NOT NULL                          AS saved_profile,
       pu.acquisition_source,
       (SELECT count(*) FROM public.artist_follows af WHERE af.user_id = pu.user_id) AS follows
FROM public.users pu
LEFT JOIN auth.users au ON au.id = pu.user_id
LEFT JOIN refreshed r   ON r.uid = pu.user_id::text
WHERE coalesce(pu.is_bot, false) = false
  AND pu.onboarding_completed IS NOT TRUE
  AND pu.created_at >= timestamptz '2026-07-16'
ORDER BY pu.created_at DESC;


-- ---------------------------------------------------------------------------
-- 3. WHERE PEOPLE GET BLOCKED  (after the telemetry ships)
--    This is the query that replaces a day of guesswork. Every reason the app can refuse
--    someone writes `onboarding_blocked_<reason>`.
--
--    `completion_write` is the one to watch: those people did EVERYTHING and still have
--    no account. Any count above zero there is an emergency.
-- ---------------------------------------------------------------------------
SELECT i.entity_id                    AS blocked_at,
       count(*)                       AS times_hit,
       count(DISTINCT i.user_id)      AS users_affected
FROM public.interactions i
WHERE i.entity_type = 'form'
  AND i.entity_id LIKE 'onboarding_blocked_%'
GROUP BY 1
ORDER BY users_affected DESC, times_hit DESC;


-- ---------------------------------------------------------------------------
-- 4. STEP-BY-STEP DROP-OFF, WEB vs MOBILE  (after the telemetry ships)
--    Mobile records one view per wizard step, so you can see exactly which screen loses
--    people. Web is a single page, so it reports one step ('onboarding_one_page') - that
--    asymmetry is the flow itself, not a gap in the tracking.
-- ---------------------------------------------------------------------------
SELECT i.entity_id                    AS step,
       count(DISTINCT i.user_id)      AS users_reached
FROM public.interactions i
WHERE i.entity_type = 'view'
  AND i.entity_id LIKE 'onboarding_%'
GROUP BY 1
ORDER BY users_reached DESC;


-- ---------------------------------------------------------------------------
-- 5. DID MOBILE TELEMETRY ACTUALLY TURN ON?  (run after the next mobile build)
--    Mobile writes to `interactions` for the first time ever, so RLS has never been
--    exercised on that path from the app. If this returns 0 after a real device has gone
--    through onboarding, the insert is being rejected and the tracking is silently dead -
--    exactly the failure mode worth ruling out, since the code swallows write errors on
--    purpose so telemetry can never block a signup.
-- ---------------------------------------------------------------------------
SELECT count(*) AS mobile_onboarding_rows
FROM public.interactions
WHERE entity_id IN ('onboarding_profile', 'onboarding_connect',
                    'onboarding_scene', 'onboarding_artists');
