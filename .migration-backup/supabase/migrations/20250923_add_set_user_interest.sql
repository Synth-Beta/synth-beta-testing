-- Create a unique constraint to support idempotent upserts
do $$ begin
  if not exists (
    select 1 from pg_indexes where schemaname = 'public' and indexname = 'user_jambase_events_user_event_unique'
  ) then
    execute 'create unique index user_jambase_events_user_event_unique on public.user_jambase_events (user_id, jambase_event_id)';
  end if;
end $$;

-- SECURE function to toggle interest without tripping recursive RLS
create or replace function public.set_user_interest(event_id uuid, interested boolean)
returns void
language plpgsql
security definer
as $$
begin
  if interested then
    insert into public.user_jambase_events (user_id, jambase_event_id)
    values (auth.uid(), event_id)
    on conflict (user_id, jambase_event_id) do nothing;
  else
    delete from public.user_jambase_events
    where user_id = auth.uid() and jambase_event_id = event_id;
  end if;
end;
$$;

-- Grant execute to authenticated users
grant execute on function public.set_user_interest(uuid, boolean) to authenticated;

