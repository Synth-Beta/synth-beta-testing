-- =============================================================================
-- 07 — Follow-up after running 03 and 04
-- Two corrections to my earlier queries, one disambiguation. All READ-ONLY.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- A. DISAMBIGUATE the 29-table result — RUN THIS FIRST
--
--   File 04's Q1 and Q2 both output a single `table_name` column, so I cannot
--   tell from the paste which one produced your list. The two answers are very
--   far apart:
--
--     Q1 (RLS DISABLED)          -> those tables are readable via the REST API by
--                                   anyone holding the anon key. Given the list
--                                   includes users_backup_20260715 (a full copy of
--                                   your users table) and web_session_bridge (live
--                                   access + refresh tokens), that would be critical.
--
--     Q2 (RLS ON, zero policies) -> fail-closed. Nothing is exposed. Benign, and
--                                   just means those tables are cleanup candidates.
--
--   I expect Q2, for two reasons: web_session_bridge's own migration runs
--   ALTER TABLE ... ENABLE ROW LEVEL SECURITY (20260820000000, line 26), and the
--   Supabase SQL editor auto-injects an RLS-enable for tables created through it
--   (the same behaviour noted in your reference_supabase_editor_do_block_into memory).
--   Expectation is not verification — run this.
--
--   This query answers it definitively AND accounts for the thing RLS status alone
--   does not tell you: whether anon actually holds a grant on the table. Exposure
--   requires BOTH rls_enabled = false AND anon_select = true.
-- -----------------------------------------------------------------------------
SELECT c.relname                                             AS table_name,
       c.relrowsecurity                                      AS rls_enabled,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count,
       has_table_privilege('anon', c.oid, 'SELECT')          AS anon_select,
       has_table_privilege('anon', c.oid, 'INSERT')          AS anon_insert,
       CASE
         WHEN NOT c.relrowsecurity AND has_table_privilege('anon', c.oid, 'SELECT')
           THEN 'EXPOSED — anon can read every row'
         WHEN NOT c.relrowsecurity
           THEN 'rls off, but anon has no SELECT grant'
         WHEN (SELECT count(*) FROM pg_policies p
                WHERE p.schemaname = 'public' AND p.tablename = c.relname) = 0
           THEN 'fail-closed (rls on, no policies)'
         ELSE 'rls on, has policies'
       END                                                   AS verdict
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    -- the sensitive ones from your list
    'web_session_bridge', 'users_backup_20260715', 'ai_message_audits',
    'ai_conversation_plans', 'notification_queue', 'push_delivery_log',
    'device_tokens', 'personalized_feed_cache', 'shadow_reviews',
    'shadow_deliveries', 'pm_meeting_notes', 'pm_members', 'pm_projects',
    'pm_tasks', 'pm_workspaces', 'ops_alert_config', 'ops_alert_dedupe',
    -- work tables, low sensitivity, included for completeness
    '_device_token_dedup_2026_08_02_backup', '_genre_cooc_stg', '_venue_canon',
    '_venue_canon_unique', 'event_dedup_map', 'events_dedup_backup',
    'venue_dedup_map', 'genre_merge_map_20260820',
    'genre_placeholder_backup_20260820', 'event_popularity_scores',
    'feed_cache_refresh_queue', 'genre_cooccurrence_pairs',
    'jambase_sync_failed_pages'
  )
ORDER BY
  CASE WHEN NOT c.relrowsecurity AND has_table_privilege('anon', c.oid, 'SELECT')
       THEN 0 ELSE 1 END,
  c.relname;

-- Paste the result back. If every verdict reads 'fail-closed', we are done here
-- and those tables are only a cleanup question, not a security one.

-- -----------------------------------------------------------------------------
-- B. CORRECTED Q3 — file 04's version omitted with_check, which made every
--   INSERT policy unreadable.
--
--   In Postgres, a SELECT/UPDATE/DELETE policy's condition lives in `qual`, but an
--   INSERT policy's condition lives in `with_check` — `qual` is always null there.
--   So rows like:
--       artist_follows | Users can follow artists | INSERT | {public} | null
--       events         | Users can create events  | INSERT | {public} | null
--   told us nothing. The null is the wrong column, not an open policy.
--
--   Also note: role `{public}` in pg_policies means the SQL PUBLIC role, which
--   covers anon AND authenticated. It does not by itself mean "world readable" —
--   a policy on {public} with USING (auth.uid() = user_id) yields nothing for a
--   logged-out caller, because auth.uid() is null. What matters is the condition.
-- -----------------------------------------------------------------------------
SELECT tablename, policyname, cmd, roles,
       COALESCE(qual, '(none)')       AS using_expr,
       COALESCE(with_check, '(none)') AS with_check_expr
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('INSERT', 'ALL')
  AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
ORDER BY tablename, policyname;

-- -----------------------------------------------------------------------------
-- C. The truly world-readable tables — policies whose condition is literally
--   `true` for SELECT. These are readable by anyone with the anon key, logged out.
--   From your Q3 paste this includes achievements, artists, artists_genres,
--   city_centers, comments, engagements, entities, events, events_genres,
--   external_entity_ids, genres and the genre_* taxonomy tables, jambase_events.
--   Most are reference data and correct. Read the list and confirm each one is
--   meant to be public — `comments` and `engagements` are the two worth a second
--   look, since they are user-generated rather than catalogue data.
-- -----------------------------------------------------------------------------
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd = 'SELECT'
  AND qual = 'true'
  AND ('anon' = ANY(roles) OR 'public' = ANY(roles))
ORDER BY tablename;

-- -----------------------------------------------------------------------------
-- D. Write access granted to plain authenticated users on catalogue tables.
--   Your Q3 showed these, and they are a data-integrity question rather than a
--   data-disclosure one:
--       artists  | can be updated by authenticated users | UPDATE | auth.role() = 'authenticated'
--       artists  | can be deleted by authenticated users | DELETE | auth.role() = 'authenticated'
--   Any signed-in user can rename or delete any artist row, which cascades through
--   events and feed personalization. Same pattern to check on jambase_events.
--   Not part of the 20-point checklist; flagging because it surfaced here.
-- -----------------------------------------------------------------------------
SELECT tablename, policyname, cmd, COALESCE(qual, with_check) AS condition
FROM pg_policies
WHERE schemaname = 'public'
  AND cmd IN ('UPDATE', 'DELETE')
  AND COALESCE(qual, with_check) ILIKE '%authenticated%'
ORDER BY tablename;
