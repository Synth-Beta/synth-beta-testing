-- Danielle signup diagnosis + onboarding health since the 2026-09-16 fixes.
-- READ ONLY. No writes, no DDL. Safe to run in the Supabase SQL editor.
--
-- Context: Slack alerted at 2026-09-19T14:52:13Z with
--   Name: Danielle / Username: danielle / auth id d4153f28-78bc-44b9-ba00-5a23ff0e8921
--   Referral: d285f5464a  and NO "Acquisition:" line.
--
-- The missing Acquisition line is NOT evidence of a bug: the Slack alert fires from
-- an AFTER INSERT trigger on public.users, so it always describes the row at
-- millisecond zero, before onboarding has run. acquisition_source is null for every
-- signup at that instant. These queries read the row as it stands NOW.


-- ---------------------------------------------------------------------------
-- 1. Danielle's current onboarding state. THE question: did she get in?
-- ---------------------------------------------------------------------------
SELECT
  u.user_id,
  u.name,
  u.username,
  u.email,
  u.contact_email,
  u.account_type,
  u.account_status,
  u.onboarding_completed,
  u.acquisition_source,
  u.other_acquisition_source,
  u.referral_code,
  u.location_city,
  u.location_state,
  u.birthday,
  u.gender,
  u.avatar_url IS NOT NULL AS has_avatar,
  u.music_streaming_service,
  u.created_at,
  u.updated_at,
  -- updated_at ~= created_at + a couple of seconds means nothing but the signup
  -- trigger ever wrote to this row: she never saved an onboarding screen.
  round(EXTRACT(EPOCH FROM (u.updated_at - u.created_at))::numeric, 1) AS seconds_created_to_updated
FROM public.users u
WHERE u.user_id = 'd4153f28-78bc-44b9-ba00-5a23ff0e8921';


-- ---------------------------------------------------------------------------
-- 2. What does referral_code actually MEAN?
--    If nearly every user has one, it is a self-assigned share code and tells you
--    nothing about where Danielle came from. If only some users have one, it is
--    attribution and d285f5464a is a real signal.
-- ---------------------------------------------------------------------------
SELECT
  count(*)                                        AS total_users,
  count(referral_code)                            AS users_with_referral_code,
  count(DISTINCT referral_code)                   AS distinct_referral_codes,
  round(100.0 * count(referral_code) / NULLIF(count(*), 0), 1) AS pct_with_code
FROM public.users;


-- ---------------------------------------------------------------------------
-- 3. Does d285f5464a belong to somebody ELSE (a referrer), or to Danielle herself?
--    Self  -> her own share code, no attribution value.
--    Other -> she was referred by that user.
-- ---------------------------------------------------------------------------
SELECT
  user_id,
  name,
  username,
  referral_code,
  created_at,
  CASE
    WHEN user_id = 'd4153f28-78bc-44b9-ba00-5a23ff0e8921' THEN 'SELF - own share code'
    ELSE 'OTHER USER - real referral attribution'
  END AS interpretation
FROM public.users
WHERE referral_code = 'd285f5464a';


-- ---------------------------------------------------------------------------
-- 4. Her telemetry: which onboarding screens did she reach, and did anything block?
--    entity_id 'onboarding_one_page' = web. 'onboarding_<step>' = mobile.
--    'onboarding_blocked_<reason>' = she hit a validation wall.
--    ZERO rows = she never rendered an instrumented onboarding screen.
-- ---------------------------------------------------------------------------
SELECT
  i.event_type,
  i.entity_type,
  i.entity_id,
  i.session_id,
  i.created_at
FROM public.interactions i
WHERE i.user_id = 'd4153f28-78bc-44b9-ba00-5a23ff0e8921'
ORDER BY i.created_at;


-- ---------------------------------------------------------------------------
-- 5. Every signup since the onboarding fixes were pushed (2026-09-16 17:26Z).
--    This is the real "are the fixes working" question.
-- ---------------------------------------------------------------------------
SELECT
  u.created_at,
  u.name,
  u.username,
  u.signup_platform,
  u.onboarding_completed,
  u.acquisition_source,
  u.location_city,
  (u.birthday IS NOT NULL)  AS has_birthday,
  (u.avatar_url IS NOT NULL) AS has_avatar,
  (SELECT count(*) FROM public.interactions i WHERE i.user_id = u.user_id) AS interaction_rows
FROM public.users u
WHERE u.created_at >= TIMESTAMPTZ '2026-09-16 17:26:00+00'
ORDER BY u.created_at DESC;


-- ---------------------------------------------------------------------------
-- 6. Acquisition-source coverage for the last 30 days.
--    acquisition_source is mandatory on BOTH platforms (web OnboardingFlow.tsx:484,
--    mobile profile.tsx:310), so a null here means the user never finished the
--    profile screen - not that the question was skippable.
-- ---------------------------------------------------------------------------
SELECT
  COALESCE(u.acquisition_source, '(null - never finished profile screen)') AS acquisition_source,
  count(*) AS users,
  count(*) FILTER (WHERE u.onboarding_completed) AS completed_onboarding
FROM public.users u
WHERE u.created_at >= now() - INTERVAL '30 days'
GROUP BY 1
ORDER BY users DESC;
