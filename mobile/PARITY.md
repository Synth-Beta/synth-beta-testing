# Web (`MainApp`) vs Expo (`mobile/app`) parity

Ship-gate tracker for strict visual + behavior parity. A screen is only considered matched when all acceptance checks pass.

## Acceptance checks per screen

- `Layout`: Same information hierarchy and major block placement as web (mobile uses bottom tabs instead of side rail; that is the only intentional chrome difference).
- `Typography`: Equivalent font sizes, weights, and emphasis (`SynthTokens` ↔ web CSS variables).
- `Spacing`: Equivalent vertical rhythm, paddings, and safe-area handling.
- `Behavior`: Same navigation flow, CTA meaning, disabled/empty/loading/error handling.
- `State`: Same signed-in/signed-out/onboarding transitions and deep-link behavior.

---

## A. `MainApp` `ViewType` → Expo routes

| Web `ViewType` | Web component(s) | Expo route(s) | Status | Notes |
|----------------|------------------|---------------|--------|--------|
| `auth` | [Auth.tsx](../src/pages/Auth.tsx) | `(auth)/sign-in` | In progress | OAuth, email, magic link, reset. |
| `onboarding` | [OnboardingFlow](../src/components/onboarding/OnboardingFlow.tsx) | `(onboarding)/*` | In progress | Steps: welcome, scene, artists, venues, connect. |
| `feed` | [HomeFeed](../src/components/home/HomeFeed.tsx) | `(tabs)/index` | In progress | Web home rail + modals; Expo: unified feed v3, Events/Reviews toggle, friend rail. |
| `search` | [DiscoverView](../src/components/discover/DiscoverView.tsx) | `(tabs)/discover`, `(tabs)/search` | In progress | Web “Search” tab = full Discover. Expo splits Search vs Discover; capabilities aligned (scopes, calendar, scenes rail, scene detail route). |
| `profile` | [ProfileView](../src/components/profile/ProfileView.tsx) | `(tabs)/profile`, `user/[id]` | In progress | Own profile on tab; other users via `user/[id]` (mirrors global profile modal). |
| `profile-edit` | [ProfileEdit](../src/components/profile/ProfileEdit.tsx) | `profile-edit` | In progress | Core fields + extended fields toward web parity (name, social, streaming). |
| `settings` | [SettingsModal](../src/components/SettingsModal.tsx) `variant="page"` | `settings`, `settings/security`, `settings/privacy` | In progress | Menu + Security (sign out / password) + Privacy (public profile). Submenus map to web `SettingsModalView`. |
| `notifications` | [NotificationsPage](../src/components/NotificationsPage.tsx) | `notifications`, `friend-requests` | In progress | Row tap → event / user / chat via shared `resolveNotificationExpoPath`. |
| `chat` | [UnifiedChatView](../src/components/UnifiedChatView.tsx) | `(tabs)/chat`, `chat/[id]` | In progress | DM names/previews; group/crypto parity ongoing. |
| `streaming-stats` | [StreamingStatsPage](../src/pages/StreamingStatsPage.tsx) | `stats` | In progress | Uses `@synth/shared` `fetchUserStreamingStatsSnapshot` (same read path as intended for web). |
| `events` | [MyEventsManagementPanel](../src/components/events/MyEventsManagementPanel.tsx) | `my-events`, `interested-events` | In progress | Reviews / rankings / unreviewed + interested list. |
| `analytics` | Creator / Business / Admin dashboards | `analytics` | Documented | **Product default:** full dashboards are web-first; Expo shows account-aware message and defers to web for heavy analytics UI. Change to “in scope” if native dashboards are required. |
| `post` / create | Nav + modals | `(tabs)/post`, `review-compose` | In progress | Multi-step review flow; Setlist.fm UI still missing in compose. Attendee picker + ranking modal implemented. |

---

## B. Global surfaces (not a `ViewType`)

| Web surface | Mechanism | Expo equivalent | Status |
|-------------|-----------|-----------------|--------|
| Artist detail | [useGlobalDetailModal](../src/hooks/useGlobalDetailModal.ts) + `open-artist-card` event | `artist/[id]` + `router.push` | In progress |
| Venue detail | Same + `open-venue-card` | `venue/[id]` | In progress |
| Event detail | Event modal / feed | `event/[id]` | In progress |
| Profile (other user) | Global modal `type: 'profile'` | `user/[id]` | In progress |
| [GlobalModals](../src/components/GlobalModals.tsx) | Event review, friend-tag invite, celebration | `review-compose`, notifications → review prefill (partial) | In progress |
| [GlobalDetailModals](../src/components/GlobalDetailModals.tsx) | Artist/venue/profile stacks | Stack routes above | In progress |
| Share / deep links | [useShareDeepLink](../src/hooks/useShareDeepLink.ts) | [useShareDeepLink.ts](lib/useShareDeepLink.ts) + `@synth/shared` `parseShareUrl` / `expoPathForShareTarget` | In progress |
| Onboarding tour / banners | `OnboardingReminderBanner`, `ShareWithFriendsBanner` | Partial / roadmap | Pending |
| Side menu (desktop) | `SideMenu` | `app-menu` | In progress |

---

## C. Shared logic (`@synth/shared`)

| Module | Purpose |
|--------|---------|
| `parseShareUrl`, share helpers | Same URL contract for web and Expo. |
| `expoPathForShareTarget` | Maps share type → Expo path (artist/venue/event). |
| `resolveNotificationExpoPath` | Maps notification `type` + `data` → Expo path. |
| Friends / passport / profile stats / review timeline / streaming snapshot | Already centralized; web can import for parity reads where not yet wired. |

---

## Behavioral parity checks (global)

- Auth guard and onboarding guard route users to the same destinations as WebView equivalents.
- Deep links only open when authenticated and onboarding complete (see root `_layout.tsx`).
- Bottom-tab behavior mirrors mobile shell (not desktop left-rail).
- Loading/empty/error states do not strand users.

## Ship gate

Do not ship until every **in-scope** row in section A is marked complete against all five acceptance checks. `analytics` row follows product choice in table notes.

## Manual QA checklist (iOS + Android)

Automated: from `mobile/`, `npx tsc --noEmit`.

**Infra (2026-06-24):** Push webhook hardened on Vercel path; re-sync token on settings toggle; artist/venue UUID filter for external IDs; home feed secondary fallback via `events_with_artist_venue`.

1. Cold start → onboarding vs tabs.
2. Auth flows (email, Apple, Google on supported builds).
3. Home feed: refresh, Events/Reviews, friend rail, event → `event/[id]`.
4. Discover + Search: calendar, scenes rail → `scene/[id]`, entity rows → `artist` / `venue` / `user`.
5. Profile (self + `user/[id]` from notifications/search).
6. Settings → Security / Privacy; Profile edit save.
7. Notifications: tap row navigates correctly.
8. Chat thread open; streaming stats screen.
9. Review compose: multi-step + draft restore after kill (same device).
10. Sign out → guards.

## Splash / launch (Expo vs Capacitor)

- Expo: `app.json` splash `#FDF2F8` aligned with web auth shell.
