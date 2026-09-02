-- =============================================================================
-- 10 — ONE-SHOT AUDIT. Run PART 1 as a single query. Paste the whole result back.
-- =============================================================================
--
-- Replaces the per-query grind in files 04, 07 and 09. Everything below reads
-- ONLY Postgres catalogs (pg_class, pg_policies, pg_proc, information_schema),
-- never an application column — so it cannot fail with 42703 the way my
-- scene_participants and users queries did.
--
-- Output columns:
--   section  — which check produced the row
--   object   — table, policy, function or view involved
--   detail   — the specifics
--   verdict  — what it means. Anything starting with "!!" wants attention.
--
-- An empty section means that check found nothing, which is the good outcome for
-- sections A, B and D.

-- #############################################################################
-- PART 1 — RUN THIS WHOLE BLOCK AS ONE QUERY
-- #############################################################################
WITH
-- A. Tables with RLS disabled. Exposure needs RLS off AND an anon grant.
a_rls_off AS (
  SELECT 'A. RLS DISABLED'::text AS section,
         c.relname::text AS object,
         ('anon_select=' || has_table_privilege('anon', c.oid, 'SELECT')::text)::text AS detail,
         CASE WHEN has_table_privilege('anon', c.oid, 'SELECT')
              THEN '!! EXPOSED — anon reads every row'
              ELSE 'rls off but no anon grant' END::text AS verdict
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity
),
-- B. SELECT policies with no row filter, reachable by anon.
b_world_read AS (
  SELECT 'B. WORLD-READABLE'::text,
         p.tablename::text,
         p.policyname::text,
         '!! anon reads all rows — confirm this table is meant to be public'::text
  FROM pg_policies p
  WHERE p.schemaname = 'public' AND p.cmd = 'SELECT' AND p.qual = 'true'
    AND ('anon' = ANY(p.roles) OR 'public' = ANY(p.roles))
),
-- C. Write policies gated only on "are you logged in", with no ownership test.
c_blanket_write AS (
  SELECT 'C. BLANKET AUTH WRITE'::text,
         p.tablename::text,
         (p.policyname || '  [' || p.cmd || ']')::text,
         '!! any logged-in user can write any row'::text
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.cmd IN ('INSERT', 'UPDATE', 'DELETE', 'ALL')
    AND COALESCE(p.qual, p.with_check, '') ILIKE '%authenticated%'
    AND COALESCE(p.qual, p.with_check, '') NOT ILIKE '%auth.uid%'
    AND COALESCE(p.qual, p.with_check, '') NOT ILIKE '%account_type%'
),
-- D. SECURITY DEFINER functions anon may execute (they bypass RLS).
d_anon_secdef AS (
  SELECT 'D. ANON SECDEF FN'::text,
         p.proname::text,
         pg_get_function_identity_arguments(p.oid)::text,
         'confirm this needs pre-login access'::text
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.prosecdef
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
),
-- E. RLS-on-but-no-policy tables that still carry an anon grant. Inert today;
--    one DISABLE ROW LEVEL SECURITY away from being section A.
e_latent AS (
  SELECT 'E. FAIL-CLOSED + ANON GRANT'::text,
         c.relname::text,
         (pg_size_pretty(pg_total_relation_size(c.oid)) || ', ~' ||
          GREATEST(c.reltuples, 0)::bigint::text || ' rows')::text,
         CASE WHEN c.relname ILIKE '%user%' OR c.relname ILIKE '%backup%'
              THEN '!! holds user data — drop it'
              ELSE 'work table — droppable' END::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relrowsecurity
    AND has_table_privilege('anon', c.oid, 'SELECT')
    AND NOT EXISTS (SELECT 1 FROM pg_policies p
                    WHERE p.schemaname = 'public' AND p.tablename = c.relname)
),
-- F. Column-level exposure on the two tables that hold the most PII.
f_columns AS (
  SELECT 'F. COLUMN EXPOSURE'::text,
         t.table_name::text,
         (count(*) FILTER (WHERE has_column_privilege('anon', 'public.' || t.table_name, t.column_name, 'SELECT'))::text
          || ' of ' || count(*)::text || ' columns readable by anon')::text,
         CASE WHEN count(*) FILTER (WHERE has_column_privilege('anon', 'public.' || t.table_name, t.column_name, 'SELECT')) = count(*)
              THEN '!! every column exposed'
              ELSE 'partially restricted' END::text
  FROM information_schema.columns t
  WHERE t.table_schema = 'public'
    AND t.table_name IN ('users', 'user_settings', 'streaming_profiles', 'reviews')
    AND EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE n.nspname = 'public' AND c.relname = t.table_name AND c.relkind = 'r')
  GROUP BY t.table_name
),
-- G. Views that bypass RLS by running as their owner.
g_views AS (
  SELECT 'G. VIEW OWNER RIGHTS'::text,
         c.relname::text,
         ('owner=' || pg_get_userbyid(c.relowner))::text,
         CASE WHEN COALESCE((SELECT option_value FROM pg_options_to_table(c.reloptions)
                             WHERE option_name = 'security_invoker'), 'off') = 'off'
              THEN 'runs as owner — check it does not leak RLS-protected rows'
              ELSE 'security_invoker on — safe' END::text
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'v'
)
SELECT * FROM (
  SELECT 1 AS sort, * FROM a_rls_off
  UNION ALL SELECT 2, * FROM b_world_read
  UNION ALL SELECT 3, * FROM c_blanket_write
  UNION ALL SELECT 4, * FROM d_anon_secdef
  UNION ALL SELECT 5, * FROM e_latent
  UNION ALL SELECT 6, * FROM f_columns
  UNION ALL SELECT 7, * FROM g_views
) x
ORDER BY sort, verdict DESC, object;

-- #############################################################################
-- PART 2 — FIXES. Do not run yet; wait until we have read PART 1's output.
-- #############################################################################
--
-- The scene_participants fix from file 09 assumed a user_id column that does not
-- exist. Get the real shape first (this is the ONLY thing to run before we talk):

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'scene_participants'
ORDER BY ordinal_position;

-- Once PART 1 and the query above are pasted back, I will write the exact policy
-- replacements against real column names instead of guessing them.
--
-- Still outstanding from earlier files, unchanged:
--   06 — Concerts Upload: DONE (locked down, had 1 object so delete was skipped)
--   08 — users column allowlist: DONE (13 of 45 columns anon-readable, was 45)
--   08 STEP 4 — authenticated users can still read every other user's PII.
--        Needs a view or an ownership/admin policy. Not yet designed.
--   09 D — leftover table drops, incl. users_backup_20260715.
--        PART 1 section E now lists these authoritatively with sizes.
