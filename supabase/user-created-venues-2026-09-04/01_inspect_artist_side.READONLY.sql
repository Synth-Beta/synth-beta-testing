-- Read-only. Run FIRST, so 02 can be checked against what the artist twin
-- actually looks like rather than against what it is assumed to look like.
--
-- Context: public.user_created_artists + reviews.user_created_artist_id exist.
-- Their venue counterparts do NOT — `user_created_venues` 404s (PGRST205) and
-- `reviews.user_created_venue_id` 42703s, verified live 2026-09-04. Both
-- clients already write to both, so 02 builds the missing half by mirroring
-- this one.

-- 1. Full column definition of the artist table (02 should match this shape).
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'user_created_artists'
order by ordinal_position;

-- 2. Is RLS on, and what do its policies say?
select relrowsecurity as rls_enabled, relforcerowsecurity as rls_forced
from pg_class where oid = 'public.user_created_artists'::regclass;

select polname, polcmd, polroles::regrole[] as roles,
       pg_get_expr(polqual, polrelid)      as using_expr,
       pg_get_expr(polwithcheck, polrelid) as with_check_expr
from pg_policy where polrelid = 'public.user_created_artists'::regclass
order by polcmd, polname;

-- 3. Grants (02 mirrors these; anon can already SELECT this table live).
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'user_created_artists'
  and grantee in ('anon', 'authenticated')
order by grantee, privilege_type;

-- 4. Constraints on both tables, including the FK + any CHECK enforcing
--    "exactly one of artist_id / user_created_artist_id" that 02 may need a
--    venue equivalent of.
select conname, contype, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid in ('public.user_created_artists'::regclass, 'public.reviews'::regclass)
order by conrelid::regclass::text, contype, conname;

-- 5. Indexes on the artist column, to mirror for the venue column.
select indexname, indexdef from pg_indexes
where schemaname = 'public'
  and (tablename = 'user_created_artists'
       or (tablename = 'reviews' and indexdef ilike '%user_created%'))
order by tablename, indexname;

-- 6. Triggers on the artist table (e.g. an updated_at toucher to mirror).
select tgname, pg_get_triggerdef(oid) as def
from pg_trigger
where tgrelid = 'public.user_created_artists'::regclass and not tgisinternal;
