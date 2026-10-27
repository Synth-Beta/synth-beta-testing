# Solid onboarding (web + iOS parity) — design

Date: 2026-10-24
Status: approved in chat 2026-10-24

## Goal

Stop losing new users to onboarding. Aug–Oct: 43 signups, 32 completed (74%). Of the 11
lost: 8 stopped on the profile step (one save bug, one since-fixed "Other" box, the rest
left), 3 saved their profile and stopped at the artist step (no skip). Web and iOS enforce
different rules because they are two separate implementations with no shared rules.

## Decisions (from the user)

- Required on both platforms: **name, username, birthday (13+), how did you hear**.
- Optional on both platforms: **city, gender, bio, photo**. ("Other" detail stays optional.)
- Location fallback everywhere a feature needs a location.
- Artist step: **3 artists pre-selected**, Continue works immediately; user can uncheck/add.
- **Push permission ask at the end of onboarding** (iOS; web has no push).
- Music connect: if the connection didn't work, say so and let them skip.

## Design

### 1. Shared rules (`packages/synth-shared/src/onboardingRules.ts`)
`validateOnboardingProfile(input) -> { ok, errors }` where errors map field -> message for:
name (non-blank), username (3–30, `^[a-z0-9_.]+$`), birthday (YYYY-MM-DD, 13+, <=120),
acquisitionSource (non-null). City/gender/bio/photo never produce errors (bio length cap
120 kept as the only optional-field rule). Web `ProfileSetupStep`/`OnboardingFlow` and iOS
`profile.tsx` both gate Continue on it. Username availability stays a separate async check.

### 2. Location fallback
- `notify_just_announced()` gains a 4th tier: user has no browse location, no lat/long and
  no city → match any new show by their artist (they follow / bucket-listed the artist, a
  tour announcement is relevant). Existing tiers unchanged: browse radius → profile lat/long
  50mi → city.
- Web saves its browse location like iOS: `set_browse_location` RPC from the web home feed
  when a feed location exists (rounded ~1km, only when it changes).

### 3. Artist step with 3 pre-selected
- New RPC `onboarding_suggested_artists(p_limit int default 12)` (security definer,
  `auth.uid()`), returns `id, name, image_url, preselected boolean`, excluding artists the
  user already follows, ordered by source:
  1. the user's streaming top artists (`streaming_profiles.profile_data->'topArtists'`,
     names matched case-insensitively to `artists.name`),
  2. artists with upcoming shows near the user (browse location, else profile lat/long, else
     city), by number of those shows,
  3. national: `artists.num_upcoming_events` desc.
  First 3 rows `preselected = true`. Never errors for a missing location or profile.
- iOS `artists.tsx` and web `FollowArtistsModal` load it, start with the 3 pre-selected, and
  Continue is enabled immediately. Web switches from follow-on-tap to the iOS model
  (select/deselect, save all on Continue) so pre-selection never silently follows anyone.
- If the RPC fails: fall back to the old `getSuggestedArtists` list with its first 3
  pre-selected; if that also fails, Continue is allowed with 0 (existing escape hatch).

### 4. Push ask at the end of onboarding (iOS)
- After the artist step saves and onboarding is marked complete, the push primer sheet shows
  on that screen (only if permission is `undetermined`), then the app navigates to Home.
  "Turn on" → system prompt via `syncExpoPushTokenWithBackend({ prompt: true })`.
- It counts toward the existing primer cap (`recordPrimerShown`), so the 45s session ask is
  only a second chance.
- Telemetry: `push_primer_shown_onboarding`, `push_primer_accepted`, `push_primer_declined`
  via the onboarding telemetry `record()` (interactions table).

### 5. Music connect honesty
- `api/spotify/sync-profile.ts`: when Spotify returns no profile (`/me` failed) and no top
  artists/tracks, write `sync_status = 'failed'` and respond with an error instead of
  `completed` with empty data. (Root cause is very likely Spotify Development Mode; the fix
  there is Extended Quota in the Spotify dashboard — owner action.)
- iOS connect step: if the sync failed / not linked after connecting, show "Spotify didn't
  connect. You can try Apple Music or skip for now." The Skip button is always there.

## Out of scope (follow-ups)
- Emails to users who stop mid-onboarding.
- Making the web flow multi-step like iOS (music connect and scene rooms are iOS-only steps).

## Testing
- Unit (node:test): `validateOnboardingProfile` cases; `onboarding_suggested_artists`
  ordering helper if extracted; Spotify "empty sync → failed" decision helper.
- SQL: run the migration's inline ASSERT block; call the RPC as a test user in the SQL editor.
- Typecheck web + mobile. Manual: web onboarding at 375px/desktop, iOS TestFlight.
