-- Event Likes support
create table if not exists public.event_likes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.jambase_events(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(user_id, event_id)
);

alter table public.event_likes enable row level security;

create policy event_likes_select on public.event_likes for select using (true);
create policy event_likes_insert_own on public.event_likes for insert with check (auth.uid() = user_id);
create policy event_likes_delete_own on public.event_likes for delete using (auth.uid() = user_id);


