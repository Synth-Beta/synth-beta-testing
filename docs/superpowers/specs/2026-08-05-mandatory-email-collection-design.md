# Mandatory Email Collection for Social-Auth Users — Design

**Status:** Draft approved in conversation 2026-08-05. Paused before spec self-review / writing-plans handoff — resume this when ready to implement.

**Update 2026-08-05 (post-write):** The legacy Capacitor iOS app referenced below has since been removed from the repo (root `ios/`, `@capacitor/*` deps, and all dead `Capacitor.isNativePlatform()` branches in `src/`, including `src/services/appleAuthService.ts`, which is now deleted entirely). This doesn't change anything in this design — Apple auth on iOS goes through `mobile/lib/appleAuth.ts` (Expo), not the web bundle — but it does simplify the "Data layer" section below: the "existing Apple-auth client code" mentioned there no longer exists, so there's no redundant write path to worry about, just the one new trigger.

## Problem

Email/password signups always have a real email. Apple and Google (Android-only) social-auth signups often don't: Apple's identity token/native credential only ever includes email on the user's *first* authorization and may be a `@privaterelay.appleid.com` relay address rather than their real one; if the user declines "Share My Email" with no relay, we get nothing at all. The business wants a real, deliverable email on file for every user (safety/contact purposes, and to grow the newsletter list), so we need to:

1. Collect a mandatory real email during onboarding for new Apple/Google signups.
2. Retrofit existing Apple/Google users who lack one.
3. Do this without breaking existing auth/onboarding code paths, and keep Supabase data consistent.

## Scope

- **Platforms:** Web (Vercel) and the Expo mobile app (`mobile/`) only. The legacy Capacitor-wrapped iOS app (`src/` + root `ios/`) has since been removed from the repo — out of scope here.
- **Providers affected:** Apple (web + mobile) and Google (Android mobile only — no Google option exists on web or iOS). Email/password users are never affected.

## The "needs a real email" predicate

A user needs the gate if: auth provider is `apple` or `google`, AND email is NULL **or** matches `@privaterelay.appleid.com`. This predicate is evaluated against `auth.users.email` (post-fix, the canonical column — see below).

## Data layer

**Root cause of a related bug found during research:** `public.users.email` and `auth.users.email` already drift — Settings' "Change Email" flow (`SettingsModal.tsx` / mobile `settings.tsx`) only calls `supabase.auth.updateUser({ email })`, which updates `auth.users.email`, but never touches `public.users.email`. `public.users.email` is currently only populated once, at row-creation time, by the `ensure_public_user_for_user` trigger.

**Fix (folded into this work since the gate needs a reliable read/write path anyway):**
- `auth.users.email` becomes the single source of truth.
- New `AFTER UPDATE ON auth.users` trigger (same defensive `information_schema` column-existence check pattern as the existing `20260716130000_add_public_user_trigger.sql` / `20260721151000_fix_auth_signup_trigger_conflicts.sql` migrations) copies `NEW.email` into `public.users.email` whenever it changes.
- One-time backfill migration: `UPDATE public.users u SET email = a.email FROM auth.users a WHERE u.id = a.id AND u.email IS NULL AND a.email IS NOT NULL` — additive only, never overwrites an existing `public.users.email`.
- The gate's write path is `supabase.auth.updateUser({ email })` — the exact call Settings already uses. No new write path, no client-side duplicate write into `public.users`.
- No verification: per decision, the email is accepted immediately, no confirmation-link flow. (Note: confirm in implementation that the Supabase project's "Confirm email change" auth setting is OFF, or `updateUser` will not apply the change until the link is clicked, silently breaking the "accept immediately" requirement.)

## New signups (Apple/Google)

- No new onboarding step. Add a conditional "What's your email?" field into the existing first profile step:
  - Mobile: `mobile/app/(onboarding)/profile.tsx`
  - Web: `ProfileSetupStep` within `src/components/onboarding/OnboardingFlow.tsx`
- Field is shown only when the predicate is true for the signed-in user; required to proceed when shown (same required/no-skip treatment as username/birthday on that step).
- On submit, call `supabase.auth.updateUser({ email })` before/alongside the rest of the profile save.

## Existing users (retrofit)

- Hard block, no dismiss, no grace period — reusing the `UsernameRequiredModal` pattern already established on web:
  - **Web:** new `EmailRequiredModal`, wired into `MainApp.tsx` the same way — a `useEffect` checks the predicate once `user`/`loading` resolve, and if true, the modal renders in the same gate slot (after the onboarding/auth checks, before normal app UI), full-screen (`fixed inset-0 z-[200]`), no persisted flag (re-derives from the DB on every load, so nothing to desync).
  - **Mobile:** no modal-gate precedent exists yet. Add the equivalent check into the existing `_layout.tsx` route-gate logic (`mobile/app/_layout.tsx`), in the same place the onboarding-incomplete redirect lives — route to a new blocking screen instead of `/(tabs)` when the predicate is true.
- **Copy/framing:** presented as a policy/safety update, not a marketing ask — e.g. "We now require a verified contact email on every account so we can reach you about your account and about reports of harassment or abuse." This is genuinely true (contact email helps with abuse reports/account recovery) and avoids friction from framing it as "give us your email for our newsletter."

## Explicitly out of scope

- Email verification/confirmation flow.
- Any actual newsletter/ESP sending infrastructure — none exists in this repo today (no edge functions, no ESP integration); this design only ensures the *data* (a real email per user) exists for whenever that infrastructure is built.

## Open items for when we resume

- Live-query `public.users`/`auth.users` to get actual counts of NULL/relay emails (not knowable from code — needs authenticated Supabase MCP or dashboard access).
- Confirm the Supabase project's email-change confirmation setting before relying on "accept immediately" behavior.
- Exact copy for the retrofit modal and the new onboarding field (draft above, not final).
- Write the two migrations (trigger + backfill) for review per the project's "SQL for review first, no direct apply" rule.
