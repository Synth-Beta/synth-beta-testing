# Admin Signup Method Tracking — Design

## Problem

The admin site (`apps/admin`, deployed at getsynth.app/admin) has no way to tell whether a user signed up via Apple Sign-In (iOS), Google Sign-In (Android), or plain email/password. This data is wanted in the existing "Users & Analytics" tab (`apps/admin/src/pages/Admin.tsx`).

## Key finding

Supabase already records this for every user, automatically, at signup time — no app code writes it. `auth.users.raw_app_meta_data->>'provider'` holds `'apple'`, `'google'`, or `'email'` for every account, past and future. Nothing in this codebase currently reads it. This means:

- No new column, trigger, or backfill migration is needed — the data already exists for all historical users.
- The only gap is that `auth.users` isn't reachable from the admin frontend, which holds only the anon/publishable key and talks to Postgres through RLS-gated PostgREST. `auth.users` isn't exposed to PostgREST at all.

## Scope

- Admin site only (`apps/admin`). No changes to signup/auth flows on web or mobile.
- Three buckets: **Apple** (iOS), **Android** (Google Sign-In — Android-only in this app today), **Email** (password signup, web or mobile). A fourth **Unknown** bucket covers any row where `raw_app_meta_data` has no provider (shouldn't normally occur, but the function should degrade gracefully rather than error).

## Data layer

New migration (written for review, **not applied** — per this project's rule that DB changes go through review before being run):

- `public.get_user_signup_providers()` — `SECURITY DEFINER`, `SET search_path = public, auth, pg_catalog`.
- Gated to admins only: raises/returns empty unless the calling `auth.uid()` matches a `public.users` row with `account_type = 'admin'` — the same check already used inline across ~10 existing RLS policies (e.g. `supabase/perf-review-2026-07-12/02_consolidate_rls_policies.sql:86-87`).
- Returns `TABLE(user_id uuid, signup_method text)` for every row in `auth.users`, where `signup_method` is normalized from `raw_app_meta_data->>'provider'`: `'apple' | 'android' | 'email' | 'unknown'` (Supabase's `'google'` provider value is mapped to the `'android'` label since that's the only place Google sign-in is offered).
- This mirrors the existing `SECURITY DEFINER` pattern already in the codebase for reading `auth.users` from a trigger context (`supabase/migrations/20260716130000_add_public_user_trigger.sql`), just exposed as a callable function instead of a trigger.

## Frontend changes (`apps/admin/src/pages/Admin.tsx`)

On the existing `fetchUsers()` call, additionally call `db.rpc('get_user_signup_providers')` and store the result as a `Record<user_id, signup_method>` map in state, keyed to join against the existing `users` array (`public.users.user_id` = `auth.users.id`).

**Users side (left column, alongside the existing "Users · Shares" card):**
New card, "Users · Signup Method":
- A `Select` filter (All / Apple / Android / Email) — same `Select`/`SelectTrigger` component already used elsewhere in this file.
- A scrollable name + badge table, same visual pattern as "Users · Shares" (`Table`/`TableRow` capped height, `max-h-[280px] overflow-auto`).
- Badge colors: distinct `Badge` variant per method, consistent with existing badge usage (e.g. `getModerationStatusBadge` pattern) — Apple/Android/Email/Unknown each get a fixed variant so they're visually scannable.

**Analytics side (right column, alongside the existing "Event Type Distribution" chart):**
New card, "Signup Method Distribution" — a `recharts` `BarChart` counting users per method, styled identically to the adjacent "Event Type Distribution" chart (same `CartesianGrid`/`XAxis`/`YAxis`/`Tooltip`/`Bar` structure, same card chrome).

## Error handling

- If the RPC call fails (e.g. non-admin caller, or the migration hasn't been applied yet), the new cards show "Signup method data unavailable" rather than blocking the rest of the tab — the existing users list/stats/other charts must keep working regardless.
- Users with no resolvable provider render as "Unknown" rather than being dropped from counts.

## Explicitly out of scope

- Any change to signup/auth flows themselves.
- Historical backfill work — none needed, the data already exists.
- Exposing this data outside the admin site (e.g. to `src/pages/Admin.tsx`, the smaller secondary admin surface in the consumer app) — out of scope unless requested later.

## Testing / verification

- Migration SQL reviewed and applied manually by the user (not by Claude) per the DB-change-review rule.
- After the migration is applied, verify in the admin UI: counts in the new bar chart should roughly match `SELECT raw_app_meta_data->>'provider', count(*) FROM auth.users GROUP BY 1` run manually against the project.
- Verify the filter dropdown actually filters the name/badge list.
- Verify a non-admin session (or the RPC call failing) shows the graceful fallback text instead of breaking the tab.
