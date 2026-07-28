-- Create event_comments table for commenting on events
create table if not exists public.event_comments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_id uuid not null references public.jambase_events(id) on delete cascade,
  parent_comment_id uuid null references public.event_comments(id) on delete set null,
  comment_text text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Basic RLS (optional; align with your environment)
alter table public.event_comments enable row level security;

create policy "event_comments_select"
  on public.event_comments for select
  using (true);

create policy "event_comments_insert_own"
  on public.event_comments for insert
  with check (auth.uid() = user_id);

create policy "event_comments_update_own"
  on public.event_comments for update
  using (auth.uid() = user_id);

create policy "event_comments_delete_own"
  on public.event_comments for delete
  using (auth.uid() = user_id);

-- Trigger to keep updated_at fresh
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists set_event_comments_updated_at on public.event_comments;
create trigger set_event_comments_updated_at
before update on public.event_comments
for each row execute procedure public.set_updated_at();


