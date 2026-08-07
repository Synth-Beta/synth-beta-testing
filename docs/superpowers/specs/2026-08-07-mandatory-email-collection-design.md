# Mandatory Email Collection for Social-Auth Users — Design

**Status:** Resumes and supersedes the 2026-08-05 draft of the same name (approved in conversation, paused before implementation, later deleted from the repo — recovered from git history and updated here with live data and two confirmed decisions).

## Problem

Email/password signups always have a real email. Apple (iOS) and Google (Android) social-auth signups often don't: Apple's identity token only ever includes an email on the user's *first* authorization and may be a `@privaterelay.appleid.com` relay address rather than their real one; if the user declines "Share My Email" with no relay, there's nothing at all. The business wants a real, deliverable email on file for every user — chiefly for safety/contact purposes (reaching a user about a harassment/abuse report, account issues), and secondarily as a newsletter-growth side effect.

**Live data (queried 2026-08-07):** 121 total users — 65 email/password, 56 Apple, 0 Google (nobody has used Android sign-in yet). Of the 56 Apple users, 0 have a NULL email, but **29 (52%) have a `@privaterelay.appleid.com` relay address** — not real/deliverable. So today, 29 users need this gate.

## Scope

- **Platforms:** Web (Vercel) and the Expo mobile app (`mobile/`). The legacy Capacitor-wrapped iOS app has been removed from the repo — not applicable.
- **Providers affected:** Apple (web + mobile) and Google (Android mobile only — no Google option exists on web or iOS). Email/password users are never affected. Google stays in scope alongside Apple even though it has 0 users today — the predicate and code path are provider-agnostic, so there's no marginal cost to covering it now versus adding it later.

## Revision (2026-08-07, post-write): write path changed after confirming "Confirm email change" is ON

The section below originally planned to write through `supabase.auth.updateUser({ email })`, evaluating the predicate directly against `user.email`. **Confirmed in the Supabase Dashboard: "Confirm email change" is ON.** That means `updateUser({ email })` does not apply the new email to `auth.users.email` until the user clicks a confirmation link in their inbox — evidenced independently by `SettingsModal.tsx:131-133`, whose existing success copy ("Confirmation sent — check {email} for a confirmation link") already assumes this. Routing a *required, blocking* gate through that mechanism creates a chicken-and-egg loop: the predicate would still read `needsEmailGate = true` immediately after submission, since `auth.users.email` hasn't actually changed yet, and would stay true indefinitely if the user doesn't check their inbox.

**Resolution — decouple from Supabase Auth's email entirely.** The stated goal is a real, human-provided email on file for safety/contact purposes, not necessarily a re-verified *login* email. New column `public.users.contact_email` (plain text, nullable) is written directly and synchronously — a normal `public.users` UPDATE, no confirmation step, applies instantly. This also cleanly satisfies "no verification flow" (previously an open risk, now moot) and keeps `supabase.auth.updateUser` (and the surprise confirmation email it would send) out of this feature entirely.

## The "needs a real email" predicate

```
needsContactEmail(user, contactEmail) =
  user.app_metadata?.provider in ('apple', 'google')
  AND (contactEmail is null or empty)
  AND (user.email is null OR user.email ends with '@privaterelay.appleid.com')
```

`user.email` / `user.app_metadata.provider` still come free on the already-loaded Supabase auth session (confirmed live: `apps/admin/src/hooks/useAccountType.ts:31`), zero extra calls. `contactEmail` (the new `public.users.contact_email` column) needs one extra column in an already-existing query on every surface except mobile onboarding (see below) — never a whole new round-trip.

## Data layer

**New column:** `public.users.contact_email text` (nullable) — the gate's read/write target. Written via a plain, targeted UPDATE (mirrors the existing `usernameService.updateUsername` pattern — a small dedicated write path, not routed through the heavier `OnboardingService.saveProfileSetup` upsert for the retrofit case; onboarding-time writes fold it into that upsert alongside `acquisition_source`, same as today).

**Bundled fix (independent bug, same column family):** `public.users.email` is only ever populated once, at row creation, by the `ensure_public_user_for_user` trigger. Settings' "Change Email" flow (`SettingsModal.tsx` / mobile `settings.tsx`) only calls `supabase.auth.updateUser({ email })`, which updates `auth.users.email` — it never touches `public.users.email`. **Live count: 77 of 121 users (64%) have a NULL `public.users.email` despite `auth.users.email` having a real value.** Fix:
- New `AFTER UPDATE ON auth.users` trigger copies `NEW.email` into `public.users.email` whenever it changes (no defensive `information_schema` check needed — already confirmed live via SQL that the column exists).
- One-time backfill: `UPDATE public.users u SET email = a.email FROM auth.users a WHERE u.user_id = a.id AND u.email IS NULL AND a.email IS NOT NULL` — additive only.
- Entirely orthogonal to `contact_email` / the gate above — kept in scope because it's the same column family and cheap, not because the gate needs it.

## New signups (Apple/Google) — folded into the existing onboarding step

Confirmed against current code (neither surface uses a dedicated wizard step per field — both bolt new conditional fields directly onto the existing profile screen, the same pattern `acquisition_source` already established):

- **Web** (`src/components/onboarding/OnboardingFlow.tsx`): add an email field as another inline conditional block, sibling to the existing acquisition_source block (`:458-530`) — own state, own validation folded into `handleCompleteSetup` (`:277-288` is the acquisition_source precedent to mirror), shown only when `needsContactEmail(user, null)` is true (brand-new user, `contact_email` is always null at this point). `contact_email` is added to `OnboardingService.ProfileSetupData` and included directly in the same `saveProfileSetup` upsert as `acquisition_source` (`:293-309`) — no separate write call. Do **not** route this through `ProfileSetupStep.tsx` — that component's contract is used only by `OnboardingFlow.tsx` and isn't the right seam for a cross-cutting, provider-conditional field.
- **Mobile** (`mobile/app/(onboarding)/profile.tsx`, step 2 of 5): add an email field the same way `acquisition_source` was added there (`:79-81, 146-152` is the precedent) — conditional on `needsContactEmail(user, null)`, gated into `canContinue` (`:175-179`) alongside username/birthday/acquisitionSource, included in the same `OnboardingService.saveProfileSetup(...)` call (`:211-220`).
- Field is required to proceed when shown (same required/no-skip treatment as username/birthday), never shown at all for email/password signups.

## Existing users (retrofit) — hard block, safety-framed, no dismiss

- **Copy/framing:** presented as a policy/safety update, not a marketing ask — e.g. "We now require a real contact email on every account so we can reach you about your account and about reports of harassment or abuse." (Avoid "verified" — this is explicitly unverified, human-submitted data, not a confirmed login credential.) Plain blocking screen, no formal terms-acceptance/checkbox mechanics.
- **Write path:** a new small, dedicated method (mirrors `usernameService.updateUsername`) on each platform's `OnboardingService` — `updateContactEmail(userId, email)` — a targeted `public.users` UPDATE, not the full onboarding upsert.
- **Web** (`src/components/MainApp.tsx`): new `emailRequired` state, companion `useEffect` right after the existing username-check effect (`:101-123`) — extends that same query to also `select('username, contact_email')` (one extra column, no new round-trip) and evaluates `needsContactEmail(user, data.contact_email)`. New `EmailRequiredModal.tsx`, built the same way as `UsernameRequiredModal.tsx` (full-screen `fixed inset-0 z-[200]`, no persisted flag). Render gate after the existing username gate (`:994-999`): username resolves first if both are needed, then email — sequential, no combined modal.
- **Mobile** (`mobile/app/_layout.tsx`): route-based, not modal-based. Add a `needsEmail` check (via a small additional query for `contact_email`) alongside the existing `isOnboardingComplete`/`onboardingEffectiveReady` computation, folded into the main route-gate effect (`:281-368`). When true and onboarding is otherwise already complete (the retrofit path, distinct from the new-signup path inside step 2), redirect to a new route `mobile/app/email-required.tsx` instead of `/(tabs)`, mirroring `ONBOARDING_FLOW_ENTRY` (`:32`).

## Explicitly out of scope

- Email verification/confirmation flow.
- Any actual newsletter/ESP sending infrastructure — none exists in this repo today; this only ensures the *data* exists for whenever that infrastructure is built.
- Formal terms/legal re-acceptance mechanics (checkbox, versioned agreement text) — decided against; a plain explanatory block is enough.

## Open items before implementation

- Exact final copy for the retrofit screen and the new onboarding field (draft language above, not final).
- Migrations (new column + trigger + backfill) need to be written for review per this project's "SQL for review first, no direct apply" rule — same pattern as the already-written migration from the signup-method-tracking work.
- ~~Confirm "Confirm email change" setting~~ — resolved: it's ON, which is exactly why the write path was redesigned above to avoid `supabase.auth.updateUser` altogether.
