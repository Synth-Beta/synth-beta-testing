-- Read-only. Why does the mobile onboarding-complete upsert on public.users fail?
-- Client statement it maps to (mobile/src/services/onboardingService.ts:57):
--   INSERT INTO public.users (user_id, onboarding_completed, onboarding_skipped, updated_at)
--   VALUES (...) ON CONFLICT (user_id) DO UPDATE ... RETURNING onboarding_completed;
-- The identical-shaped upsert in saveProfileSetup (name/username/birthday/...) succeeds,
-- so look for something scoped to these columns or to UPDATE-with-RETURNING.

-- 1. RLS policies on users (INSERT + UPDATE are the ones the upsert needs).
select polname, polcmd, polroles::regrole[] as roles,
       pg_get_expr(polqual, polrelid)      as using_expr,
       pg_get_expr(polwithcheck, polrelid) as with_check_expr
from pg_policy where polrelid = 'public.users'::regclass order by polcmd, polname;

-- 2. Column-level grants for authenticated (empty rows = table-level grant, which is fine).
select privilege_type, column_name
from information_schema.column_privileges
where table_schema='public' and table_name='users' and grantee='authenticated'
  and column_name in ('onboarding_completed','onboarding_skipped','updated_at','username','birthday')
order by privilege_type, column_name;

select grantee, privilege_type from information_schema.role_table_grants
where table_schema='public' and table_name='users' and grantee in ('authenticated','anon');

-- 3. Triggers on users that could throw on an UPDATE of these columns.
select tgname, tgenabled, pg_get_triggerdef(oid) as def
from pg_trigger where tgrelid='public.users'::regclass and not tgisinternal;

-- 4. CHECK constraints mentioning onboarding_*.
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid='public.users'::regclass and pg_get_constraintdef(oid) ilike '%onboarding%';

-- 5. Sanity: who actually completed, and when did it stop?
select date_trunc('week', created_at)::date as signup_week,
       count(*) as signups,
       count(*) filter (where onboarding_completed) as completed
from public.users
where created_at > now() - interval '120 days' and coalesce(is_bot,false)=false
group by 1 order by 1;
