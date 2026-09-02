-- =============================================================================
-- 08 — public.users is world-readable, including minor flags and moderation state
-- NEW finding, surfaced by 07 section C. This outranks everything else so far.
-- =============================================================================
--
-- THE FINDING:
--   pg_policies shows, on public.users:
--       "Users are viewable by everyone" | SELECT | roles {public} | qual = true
--   Role {public} includes `anon`. `qual = true` means no row filter. So anyone
--   holding the anon key — which ships in every client bundle — can read EVERY
--   column of EVERY row via PostgREST:
--
--       GET /rest/v1/users?select=name,email,birthday,is_minor,location_city
--
--   The exact column list must come from STEP 1c below, not from
--   src/types/database.ts — that interface has drifted from the real schema.
--   Known-present and confirmed by app code, the exposure includes at least:
--       email                         — read by supabase/functions/newsletter-send/index.ts:98
--       contact_email                 — read by src/components/MainApp.tsx:132
--                                       and mobile/app/_layout.tsx:228
--       birthday, gender,
--         location_city/state         — PII, read by
--                                       apps/admin/src/lib/newsletterPersonalization.ts:1528
--                                       and mobile/src/services/onboardingService.ts:62
--       is_minor / age_verified /
--         parental_controls_enabled /
--         dm_restricted               — child-safety flags, if present. Your
--                                       settings audit (2026-07-20) treats
--                                       dm_restricted as auto-on for minors, so
--                                       these identify minor accounts.
--       account_type                  — reveals which accounts are admins
--       apple_user_id                 — identity-provider subject id
--   Run STEP 1c and read the real list before deciding the allowlist in STEP 2.
--
-- RELATIONSHIP TO FINDING #5:
--   File 01 revoked get_email_by_username because it let anon map a username to an
--   email. That fix was correct and worth keeping — but it was a side door. This
--   policy is the front door to the same data and more, and it needs no RPC at all,
--   just a REST call. My earlier report understated #5's context by not checking
--   the table policy behind it. Treat this file as the real fix for that class.
--
-- Run each block separately.

-- -----------------------------------------------------------------------------
-- STEP 1 — VERIFY the exposure before changing anything.
--   Confirms the anon role actually holds SELECT on the sensitive columns. If
--   anon_select_email comes back false, the policy is permissive but the grant is
--   not, and the practical exposure is smaller than the policy implies.
-- -----------------------------------------------------------------------------
--   Column-name-agnostic: has_column_privilege() raises 42703 on a column that
--   does not exist, so this drives off information_schema instead of a fixed list.
SELECT has_table_privilege('anon', 'public.users', 'SELECT') AS anon_table_select;

SELECT c.column_name,
       has_column_privilege('anon', 'public.users', c.column_name, 'SELECT') AS anon_can_read
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'users'
ORDER BY c.ordinal_position;

-- STEP 1b — the definitive test, run from a terminal, NOT the SQL editor. Use the
--   anon key from your client bundle (the public one, not service_role):
--     curl "https://<project>.supabase.co/rest/v1/users?select=name,email&limit=5" \
--       -H "apikey: <ANON KEY>"
--   If that returns rows with real emails, the exposure is confirmed and live.

-- STEP 1c — dump the REAL column list. Do not skip this.
--   My first draft of STEP 2 listed columns taken from src/types/database.ts and
--   failed with 42703 — that file is a hand-maintained TypeScript interface, not
--   generated from the schema, and it has drifted (it declares moderation_status,
--   ban_reason, warning_count etc. which do not exist on the table). Treat it as
--   documentation, never as a source of column names for SQL.
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users'
ORDER BY ordinal_position;

-- -----------------------------------------------------------------------------
-- STEP 2 — THE FIX: column-level revoke for anon.
--
--   Keeps public profiles working (username, name, avatar_url, bio, socials) while
--   removing every column a logged-out visitor has no business reading. This is
--   narrower and safer than rewriting the RLS policy, because it cannot change
--   which ROWS anyone sees — only which columns anon may name.
--
--   BREAKAGE PROFILE — read before running:
--     * Authenticated sessions are NOT touched. Every `.select('*')` on users in
--       the app runs logged-in (src/services/adminService.ts, adminAnalyticsService.ts,
--       src/components/events/ConcertFeed.tsx:289,
--       src/components/OnboardingPreferencesSettings.tsx:301) and keeps working.
--     * PostgREST rejects the WHOLE request if a caller names a column it lacks
--       grant on. So any LOGGED-OUT code path doing select('*') on users will now
--       401 instead of returning data. Test logged-out public profile viewing.
--     * Service role ignores grants entirely — newsletter-send and every server
--       path is unaffected.
-- -----------------------------------------------------------------------------
--   WHY AN ALLOWLIST, NOT A BLOCKLIST:
--     Listing sensitive columns to revoke fails open — miss one, or add a new
--     sensitive column next month, and it is exposed by default. Revoking the
--     table then granting back only the public-profile columns fails closed: a
--     column added later is private until someone deliberately grants it.
--     It is also immune to the 42703 error above, since the DO block only grants
--     columns that actually exist.
DO $$
DECLARE
  r record;
  -- Columns a logged-out visitor may read. Everything else becomes private.
  safe_columns text[] := ARRAY[
    'id', 'user_id', 'username', 'name', 'avatar_url', 'bio',
    'instagram_handle', 'music_streaming_profile', 'music_streaming_service',
    'is_public_profile', 'account_type', 'created_at', 'last_active_at'
  ];
  granted int := 0;
BEGIN
  EXECUTE 'REVOKE SELECT ON public.users FROM anon';

  FOR r IN
    SELECT c.column_name
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'users'
      AND c.column_name = ANY(safe_columns)
    ORDER BY c.ordinal_position
  LOOP
    EXECUTE format('GRANT SELECT (%I) ON public.users TO anon;', r.column_name);
    granted := granted + 1;
    RAISE NOTICE 'anon may read users.%', r.column_name;
  END LOOP;

  RAISE NOTICE 'Granted % public columns; every other column on users is now private to anon.', granted;
END $$;

-- -----------------------------------------------------------------------------
-- STEP 3 — VERIFY the fix.
-- -----------------------------------------------------------------------------
--   Lists every column with anon's verdict, so you can read the whole table at a
--   glance rather than probing names that may not exist.
SELECT c.column_name,
       has_column_privilege('anon', 'public.users', c.column_name, 'SELECT') AS anon_can_read
FROM information_schema.columns c
WHERE c.table_schema = 'public' AND c.table_name = 'users'
ORDER BY anon_can_read DESC, c.ordinal_position;

-- Expect exactly the 13 allowlisted columns true, everything else false.
-- Read the false list and confirm nothing the logged-out UI needs is in it.
-- Then re-run the STEP 1b curl — it should now fail with a permission error.
-- Then smoke test: logged-out profile view, login, onboarding, admin user list.

-- -----------------------------------------------------------------------------
-- STEP 4 — THE LARGER HALF, deliberately not automated here.
--
--   The revoke above closes anonymous access. It does NOT stop a logged-in user
--   from reading every other user's email, birthday and minor status, because the
--   same `qual = true` policy applies to `authenticated` too — all 121 accounts.
--
--   That is a real problem but a bigger change, because admin tooling legitimately
--   reads those columns with a user session
--   (apps/admin/src/lib/newsletterPersonalization.ts:1528 selects email).
--   Doing it properly means either:
--     a) splitting public profile fields into a view and pointing the app at it, or
--     b) replacing the blanket policy with one that returns sensitive columns only
--        for auth.uid() = user_id OR account_type = 'admin', and moving admin
--        reads to a service-role edge function.
--   Option (b) is closer to how the rest of this schema already works.
--
--   Not attempting it in this file — it needs its own change and its own testing
--   pass rather than being bundled into a hardening script.
-- -----------------------------------------------------------------------------

-- -----------------------------------------------------------------------------
-- ROLLBACK
-- -----------------------------------------------------------------------------
-- GRANT SELECT ON public.users TO anon;
