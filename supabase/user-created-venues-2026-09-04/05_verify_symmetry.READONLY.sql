-- Read-only. Run after 04. Every assert must pass.
-- `:=` assignments on purpose — the Supabase editor mangles DO blocks that use
-- SELECT ... INTO.

do $$
declare
  n int;
begin
  -- (a) The venue CHECK exists and mirrors the artist one.
  n := (select count(*) from pg_constraint
         where conrelid = 'public.reviews'::regclass
           and conname = 'reviews_venue_or_user_created_check' and contype = 'c');
  assert n = 1, 'reviews_venue_or_user_created_check was not added';

  -- (b) The dedup index COALESCEs both sides now.
  n := (select count(*) from pg_indexes
         where schemaname = 'public'
           and indexname = 'reviews_user_id_artist_or_custom_venue_id_unique'
           and indexdef ilike '%COALESCE(venue_id, user_created_venue_id)%'
           and indexdef ilike '%COALESCE(artist_id, user_created_artist_id)%'
           and indexdef ilike '%UNIQUE%');
  assert n = 1, 'dedup index was not rebuilt with the venue COALESCE';

  -- Nothing was lost in the rebuild: still exactly one unique index on reviews
  -- for the no-event case.
  n := (select count(*) from pg_indexes
         where schemaname = 'public' and tablename = 'reviews'
           and indexdef ilike '%UNIQUE%' and indexdef ilike '%event_id IS NULL%');
  assert n = 1, format('expected 1 partial unique index for event-less reviews, found %s', n);

  raise notice 'user-created-venues symmetry: all assertions passed';
end $$;

-- Side-by-side: the artist and venue constraints should now read the same shape.
select conname, pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.reviews'::regclass and contype = 'c'
  and conname in ('reviews_artist_or_user_created_check', 'reviews_venue_or_user_created_check')
order by conname;

select indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename = 'reviews' and indexdef ilike '%user_created%'
order by indexname;

-- Existing rows still satisfy the new CHECK (0 means the constraint is not
-- silently un-validated).
select count(*) as rows_violating_new_check
from public.reviews
where not (
  event_id is not null
  or (venue_id is not null and user_created_venue_id is null)
  or (venue_id is null and user_created_venue_id is not null)
);
