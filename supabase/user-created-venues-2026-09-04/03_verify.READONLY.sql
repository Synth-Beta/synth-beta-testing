-- Read-only. Run after 02. Every assert must pass.
-- Assignments use `:=` with scalar subqueries on purpose: the Supabase editor
-- mangles DO blocks containing SELECT ... INTO (it injects an
-- `ALTER TABLE ... ENABLE ROW LEVEL SECURITY` into the $$ body and fails 42601).

do $$
declare
  n int;
begin
  -- Columns match the artist twin.
  n := (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'user_created_venues'
           and column_name in ('id', 'user_id', 'name', 'image_url', 'created_at', 'updated_at'));
  assert n = 6, format('user_created_venues is missing columns (found %s of 6)', n);

  n := (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'user_created_venues'
           and column_name = 'id' and column_default = 'gen_random_uuid()');
  assert n = 1, 'user_created_venues.id has no gen_random_uuid() default';

  -- user_id FKs to auth.users(id), not public.users(user_id).
  n := (select count(*) from pg_constraint
         where conrelid = 'public.user_created_venues'::regclass and contype = 'f'
           and confrelid = 'auth.users'::regclass);
  assert n = 1, 'user_created_venues.user_id does not FK to auth.users(id)';

  -- RLS on, with the four mirrored policies.
  n := (select count(*) from pg_class
         where oid = 'public.user_created_venues'::regclass and relrowsecurity);
  assert n = 1, 'RLS is not enabled on user_created_venues';

  n := (select count(*) from pg_policy
         where polrelid = 'public.user_created_venues'::regclass);
  assert n = 4, format('expected 4 policies on user_created_venues, found %s', n);

  n := (select count(*) from pg_policy
         where polrelid = 'public.user_created_venues'::regclass
           and polcmd = 'r' and pg_get_expr(polqual, polrelid) = 'true');
  assert n = 1, 'SELECT is not open — venue names will render blank on other users profiles';

  -- Writes are owner-gated (all three write policies mention auth.uid()).
  n := (select count(*) from pg_policy
         where polrelid = 'public.user_created_venues'::regclass
           and polcmd in ('a', 'w', 'd')
           and coalesce(pg_get_expr(polwithcheck, polrelid), pg_get_expr(polqual, polrelid)) ilike '%auth.uid()%');
  assert n = 3, format('expected 3 owner-gated write policies, found %s', n);

  -- updated_at trigger, same shared function as the artist table.
  n := (select count(*) from pg_trigger
         where tgrelid = 'public.user_created_venues'::regclass and not tgisinternal);
  assert n = 1, 'updated_at trigger missing on user_created_venues';

  -- Grants.
  n := (select count(*) from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'user_created_venues'
           and grantee = 'anon' and privilege_type = 'SELECT');
  assert n = 1, 'anon cannot SELECT user_created_venues';

  n := (select count(*) from information_schema.role_table_grants
         where table_schema = 'public' and table_name = 'user_created_venues'
           and grantee = 'authenticated' and privilege_type in ('INSERT', 'UPDATE', 'DELETE'));
  assert n = 3, format('authenticated is missing write grants (found %s of 3)', n);

  -- The review column exists and is a real FK with ON DELETE SET NULL.
  n := (select count(*) from information_schema.columns
         where table_schema = 'public' and table_name = 'reviews'
           and column_name = 'user_created_venue_id');
  assert n = 1, 'reviews.user_created_venue_id was not added';

  n := (select count(*) from pg_constraint
         where conrelid = 'public.reviews'::regclass and contype = 'f'
           and confrelid = 'public.user_created_venues'::regclass
           and confdeltype = 'n');
  assert n = 1, 'reviews.user_created_venue_id has no FK to user_created_venues with ON DELETE SET NULL';

  raise notice 'user-created-venues: all assertions passed';
end $$;

-- Symmetry check: the artist and venue sides should now read the same.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('user_created_artists', 'user_created_venues')
order by table_name, ordinal_position;

select polrelid::regclass::text as tbl, polname, polcmd,
       pg_get_expr(polqual, polrelid)      as using_expr,
       pg_get_expr(polwithcheck, polrelid) as with_check_expr
from pg_policy
where polrelid in ('public.user_created_artists'::regclass, 'public.user_created_venues'::regclass)
order by tbl, polcmd;

select conrelid::regclass::text as tbl, conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.reviews'::regclass
  and pg_get_constraintdef(oid) ilike '%user_created%'
order by conname;

-- Decision input for the two optional items at the bottom of 02.
-- (a) 0 here means the venue CHECK constraint can be added safely.
select count(*) as reviews_with_no_venue_and_no_event
from public.reviews where event_id is null and venue_id is null;

-- (b) Reviews that the current unique index cannot dedup, because it keys on
--     venue_id alone. Grows only once custom venues are in use.
select count(*) as custom_venue_reviews_outside_unique_index
from public.reviews
where event_id is null and is_draft = false and venue_id is null
  and user_created_venue_id is not null;
