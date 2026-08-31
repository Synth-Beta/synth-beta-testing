-- =============================================================================
-- Security scan — READ ONLY. Nothing here writes.
--
-- RUN THE SUPABASE ADVISORS FIRST: Dashboard > Advisors > Security.
-- They already cover, and you should not re-implement here:
--   rls_disabled_in_public, rls_enabled_no_policy, policy_exists_rls_disabled,
--   security_definer_view, function_search_path_mutable, auth_users_exposed,
--   extension_in_public, multiple_permissive_policies, weak password / MFA config.
--
-- This file covers what Advisors does NOT tell you: the *content* of your
-- policies and grants. Advisors says "this table has 4 permissive policies";
-- it does not say "one of them is USING (true)".
-- =============================================================================


-- ============================================================
-- 1. Policies that are open by content, not just permissive by count
--    A USING (true) on SELECT means every row is world-readable to that role.
--    A WITH CHECK (true) on INSERT/UPDATE means any row can be written.
--    Some of these are intentional (public artist/venue/event catalogue).
--    You are looking for a user-data table in this list.
-- ============================================================
select
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual        as using_expression,
  with_check  as with_check_expression
from pg_policies
where schemaname = 'public'
  and (
    coalesce(qual, '')       in ('true', '(true)')
    or coalesce(with_check, '') in ('true', '(true)')
  )
order by tablename, cmd, policyname;


-- ============================================================
-- 2. Every policy, full text — for the tables that hold user data.
--    Read these by hand. Look for: a policy that compares to a column the
--    client controls, a missing auth.uid() check, or an OR that widens access.
-- ============================================================
select tablename, policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'users', 'user_settings', 'user_settings_preferences', 'user_relationships',
    'chats', 'chat_participants', 'messages', 'message_reactions',
    'notifications', 'device_tokens', 'reviews', 'event_media',
    'user_event_relationships', 'bucket_list', 'passport_entries',
    'streaming_profiles', 'spotify_user_tokens', 'user_preference_signals',
    'user_preferences', 'interactions'
  )
order by tablename, cmd, policyname;


-- ============================================================
-- 3. Table-level grants to anon / authenticated.
--    RLS only filters rows — it does not remove a grant. A table with no RLS
--    and a GRANT to anon is fully readable through PostgREST by anyone holding
--    your public anon key, which ships in your client bundle.
-- ============================================================
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  g.grantee,
  string_agg(g.privilege_type, ', ' order by g.privilege_type) as privileges
from information_schema.role_table_grants g
join pg_class c on c.relname = g.table_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where g.table_schema = 'public'
  and g.grantee in ('anon', 'authenticated')
group by c.relname, c.relrowsecurity, g.grantee
order by c.relrowsecurity, c.relname, g.grantee;

-- 3b. The dangerous subset: writable by anon, or readable by anon with RLS off.
select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  g.grantee,
  g.privilege_type
from information_schema.role_table_grants g
join pg_class c on c.relname = g.table_name
join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
where g.table_schema = 'public'
  and g.grantee = 'anon'
  and (g.privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
       or c.relrowsecurity = false)
order by c.relname, g.privilege_type;


-- ============================================================
-- 4. SECURITY DEFINER functions callable by anon or authenticated.
--    These run as their owner and bypass RLS entirely. You revoked a set of
--    these on 2026-07-10 — this confirms none have come back, and catches any
--    added since.
-- ============================================================
select
  p.proname,
  pg_get_function_identity_arguments(p.oid) as args,
  has_function_privilege('anon',          p.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authed_can_execute,
  p.proconfig as search_path_setting
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef                       -- SECURITY DEFINER only
  and (has_function_privilege('anon', p.oid, 'EXECUTE')
       or has_function_privilege('authenticated', p.oid, 'EXECUTE'))
order by anon_can_execute desc, p.proname;

-- 4b. SECURITY DEFINER functions with no pinned search_path.
--     Without `SET search_path`, a caller-controlled schema can shadow the
--     objects the function references. You pinned these on 2026-07-10.
select p.proname, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prosecdef
  and (p.proconfig is null
       or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
order by p.proname;


-- ============================================================
-- 5. Views exposed through PostgREST.
--    A view runs with its OWNER's privileges unless security_invoker is set,
--    so a view over a RLS-protected table can hand out every row. You have a
--    lot of these: users_complete, public_profiles, analytics_users,
--    chat_members_view, pm_members (real_name!), notifications_with_details,
--    reviews_with_connection_degree, users_with_subscription, ...
--    Any view over user data with security_invoker = false needs a reason.
-- ============================================================
select
  c.relname as view_name,
  pg_get_userbyid(c.relowner) as owner,
  coalesce(
    (select option_value from pg_options_to_table(c.reloptions)
     where option_name = 'security_invoker'),
    'false'
  ) as security_invoker,
  has_table_privilege('anon',          c.oid, 'SELECT') as anon_can_select,
  has_table_privilege('authenticated', c.oid, 'SELECT') as authed_can_select
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('v', 'm')
order by security_invoker, anon_can_select desc, c.relname;


-- ============================================================
-- 6. RLS coverage: tables with RLS on but no policies (deny-all — a silently
--    broken feature), and tables with RLS off entirely.
--    This is section 7 of 00_readonly_scan.sql, which never got run.
-- ============================================================
select
  c.relname,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  count(p.polname) as policy_count,
  s.n_live_tup as rows
from pg_class c
left join pg_policy p on p.polrelid = c.oid
left join pg_stat_user_tables s on s.relid = c.oid
where c.relnamespace = 'public'::regnamespace and c.relkind = 'r'
group by c.relname, c.relrowsecurity, c.relforcerowsecurity, s.n_live_tup
order by
  (c.relrowsecurity = false) desc,      -- RLS off first
  (count(p.polname) = 0) desc,          -- then RLS on with no policy
  count(p.polname) desc,
  c.relname;
