# Solid Onboarding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** Same required/optional rules on web + iOS, location fallback, 3 pre-selected artists, push ask at the end of onboarding, honest music connect.
**Architecture:** Pure rules + helpers in `@synth/shared` (tested with node:test); one SQL migration (RPC + notify fallback); thin UI wiring on web and iOS.
**Spec:** `docs/superpowers/specs/2026-10-24-onboarding-solid-design.md`

## Global Constraints
- Never commit/push (user commits). Required: name, username, birthday 13+, how did you hear. Optional: city, gender, bio, photo.
- Continue on the artist step is never blocked by a failed load.
- SQL is idempotent (`CREATE OR REPLACE`), run by the user in the Supabase SQL editor.

## Review Focus
- Apple Sign In users with hidden name: name field starts blank and must be typed (required).
- User with no location at all: still gets just-announced alerts (tier 4) and still gets artist suggestions (national tier).
- Artist RPC error or empty: fallback list, 3 pre-selected, Continue enabled.
- Push permission already granted/denied: no primer, straight to Home.
- Spotify sync returning nothing: marked failed, user told, Skip works.

---

### Task 1: Shared onboarding rules
Files: create `packages/synth-shared/src/onboardingRules.ts` + `.test.ts`; export from `index.ts`.
Produces: `validateOnboardingProfile(i: { name?: string; username?: string; birthday?: string; acquisitionSource?: string | null; bio?: string }, now?: Date): { ok: boolean; errors: Partial<Record<'name'|'username'|'birthday'|'acquisitionSource'|'bio', string>> }`.
- [ ] RED tests: blank name → errors.name; username 'ab' / 'Bad Name!' → errors.username; birthday '' / 'nope' / 10-year-old / 130-year-old → errors.birthday; null source → errors.acquisitionSource; bio 121 chars → errors.bio; valid input with NO city/gender → ok true.
- [ ] Implement, GREEN, `npm test`.

### Task 2: Wire rules into web + iOS profile step
Files: `src/components/onboarding/ProfileSetupStep.tsx` (drop "City is required"; add name required via shared rules), `src/components/onboarding/OnboardingFlow.tsx`, `mobile/app/(onboarding)/profile.tsx` (`canContinue` from shared rules; keep username availability check). City label "(optional)" on both.
- [ ] Typecheck web + mobile.

### Task 3: SQL — suggested artists RPC + just-announced tier 4
File: `supabase/migrations/20261024120000_onboarding_suggested_artists.sql`.
- [ ] `onboarding_suggested_artists(p_limit int default 12)` per spec §3, `GRANT EXECUTE ... TO authenticated`.
- [ ] `notify_just_announced()` = 20261018 version + tier 4 (no browse, no lat/long, blank city → match).
- [ ] Inline `DO $$ ... ASSERT` smoke where possible (function exists, returns ≤ p_limit, ≤3 preselected).

### Task 4: Artist step on both platforms
Files: mobile `src/services/artistService.ts` (+ `getOnboardingSuggestions()`), `mobile/app/(onboarding)/artists.tsx`; web `src/services/onboardingService.ts` (+ `getOnboardingSuggestions()`, `followArtists(userId, ids)`), `src/components/onboarding/FollowArtistsModal.tsx` (select model, save on Continue), `OnboardingFlow.tsx` finish path.
Produces (shared): `pickPreselected<T extends { id: string; preselected?: boolean }>(rows: T[], n = 3): string[]` in `onboardingRules.ts` — server flags first, else first n; tested.
- [ ] RED/GREEN `pickPreselected` test.
- [ ] Wire both UIs; Continue enabled when ≥1 selected or load failed.

### Task 5: Push ask at end of onboarding (iOS)
Files: extract `mobile/src/components/PushPrimerSheet.tsx` (presentational: title, body, onEnable, onDismiss) from `PushPrimer.tsx`; `PushPrimer.tsx` uses it; `artists.tsx` shows it after completion when permission is `undetermined`, records `recordPrimerShown`, telemetry shown/accepted/declined, then `router.replace('/(tabs)')`.
- [ ] Mobile typecheck.

### Task 6: Honest music connect
Files: `api/spotify/sync-profile.ts` (+ pure `isEmptySpotifySync(me, lists)` in `api/_lib/spotifySync.ts` with test), `mobile/app/(onboarding)/connect.tsx` (message + skip when not linked after connect).
- [ ] RED/GREEN `isEmptySpotifySync`; sync writes `failed` + 502 JSON error when empty.

### Task 7: Web saves browse location
File: web home feed (where `feedLocation` is known): call `set_browse_location` once per rounded location.
- [ ] Typecheck; `graphify update .`; final review.
