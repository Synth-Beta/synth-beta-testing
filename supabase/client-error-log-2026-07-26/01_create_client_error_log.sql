-- Purpose: give the mobile app a way to self-report client-side errors from
-- production (TestFlight) builds, where there's no Sentry/remote logging and
-- console.error is only visible via a Mac + Xcode device console.
--
-- Immediate use: mobile/app/chat/[id].tsx now catches an error from the
-- `mark_chat_as_read` RPC call (previously silently discarded via `void`).
-- This table lets that failure get written to the DB so it can be queried
-- directly instead of requiring a cabled device to watch console output live.
--
-- Scope: intentionally minimal/generic (context + message + details) so it can
-- be reused for other client-side error reports later, not just this one call.

create table if not exists public.client_error_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  context text not null,
  error_message text,
  error_details jsonb,
  platform text,
  app_version text,
  created_at timestamptz not null default now()
);

alter table public.client_error_log enable row level security;

-- Authenticated users can insert their own error reports; no SELECT/UPDATE/DELETE
-- policy is granted to anon/authenticated, so only service_role (which bypasses
-- RLS) can read them back — e.g. via the Supabase SQL editor or MCP tooling.
create policy client_error_log_insert on public.client_error_log
  for insert
  to authenticated
  with check (user_id = auth.uid());

-- Cheap cleanup path: nothing auto-deletes old rows. If this table gets reused
-- long-term, add a retention job; for now it's a short-lived debugging aid.
