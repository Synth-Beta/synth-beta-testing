Cursor Audit:
## Currently in Swift

### Shared Features
- `Synth_SwiftUIApp.swift` + `RootView`: native app entry point that gates the Capacitor shell behind authentication/onboarding and wires `AuthService` tokens back to the web bridge.
- `AuthView.swift` + `AuthService.swift`: email/password sign-in, Sign in with Apple, session refresh, and sign-out logic all live in Swift and feed the shared session state used by onboarding and the injected web session.
- `OnboardingCoordinator.swift` + `Page1…Page5…`: the five-step onboarding pipeline gathers birth year/gender, location (via `CitySearchService`), username/avatar/bio, artist picks (`ArtistSearchService`), and genre interests (`GenreCategoriesService`), then persists the data through `OnboardingService` to Supabase.
- `SynthNative` design system utilities (`SynthButton`, `SynthSearchBar`, `SynthColor`, `AppHeaderOverlay`, etc.) provide reusable controls, spacing, modals, and search widgets for all native flows.

### Pages
#### Feed
- None yet – after onboarding `ContentView.swift` jumps directly into `CapacitorWebView`, so the feed appears only inside the React/Capacitor shell.
#### Discover
- None yet – the native view scaffolding is not wired up, and the Discover content is still rendered through the web shell.
#### Create/Review
- None yet – the create CTA opens a placeholder modal, but the actual review experience is kept inside the `CapacitorWebView`.
#### Chat
- None yet – chat flows are routed through the web UI after onboarding; no native chat data/actions exist yet.
#### Profile
- None yet – profile viewing/editing, streaming links, and analytics remain in the web shell rather than in Swift.

## Not yet in Swift

### Shared Features
- `ContentView.swift` hosts `CapacitorWebView.swift`, which loads the full React/Capacitor bundle that currently provides nearly every feature listed in `FEATURES.md` (concert discovery, JamBase sync, venue analytics, review system, streaming integrations, chat, notifications, etc.).
- `CapacitorWebView` also injects native session tokens (via `AuthService.sessionTokensForWebBridge`) and wires UIKit/Capacitor handlers, so the hybrid shell is the only place where the app’s data-rich experiences run today.

### Pages
#### Feed
- `HomeFeedView.swift` (partial native shell): renders headers, dropdowns, and the placeholder `PageBody` messaging, but does not surface real event data yet.
- `CapacitorWebView` (web feed): the React bundle delivers the personalized feed, trending lists, review discovery, and group chat prompts described in `FEATURES.md`.
#### Discover
- `DiscoverView.swift` (partial native shell): search bar and layout exist in Swift, but the filters, JamBase-powered search, and map/list discovery still depend on the web UI.
- `CapacitorWebView` (web discover): the existing music/event search, filtered artist/venue/location flows, and unified discovery stories are all served inside the Capacitor route.
#### Create/Review
- `EventReviewModalView` (native stub): opens from the Create CTA but currently only shows placeholder copy and share CTA without review submission logic.
- `CapacitorWebView` (web review system): event/venue/artist review submission, post-submit ranking, media + interest toggles, and all review-related social interactions remain in the React app.
#### Chat
- `PageScreen` for Chat (native placeholder): `PageBody` notes “Coming soon,” so no real messaging is implemented in Swift yet.
- `CapacitorWebView` (web chat): direct messages, group chats, attachments, and chat discovery all live inside the hybrid shell.
#### Profile
- `PageScreen` for Profile (native placeholder): header/menu chrome is there, but profile editing, streaming connections, follower lists, and analytics aren’t implemented natively.
- `CapacitorWebView` (web profile): the entire profile ecosystem (viewing/editing profile, friends, streaming links, analytics dashboards, notifications, admin flows) is handled by the React/Capacitor portion of the app.


ChatGPT Audit
# Swift Migration Audit

Last updated: 2026-02-19

This doc classifies the current product surface into:
- **Currently in Swift**: real SwiftUI screens with native state/actions (not just WebView chrome)
- **Not yet in Swift**: anything primarily implemented via Capacitor/WebView routes, or only a native stub/shell

Organized by:
1) Shared Features
2) Pages grouped by the 5 bottom tabs
3) Standalone routes and global modals (cross-tab)


## Currently in Swift

### Shared Features
- App entry + gating (native app boot, auth/onboarding gating before shell)
- Authentication (email/password, Apple Sign-In, session refresh, sign-out)
- Session token injection for web bridge (native tokens handed to Capacitor shell)
- Onboarding flow (5 steps)
  - Birth year and gender
  - City search and selection
  - Username, avatar, bio
  - Artist selection (native search)
  - Genre selection (native categories)
- Onboarding persistence to Supabase (native services)
- Native design system primitives (buttons, search, colors, header overlay, layout scaffolds)

### Pages

#### Feed
- None as fully native (Feed content is not native)

#### Discover
- None as fully native (Discover content is not native)

#### Create/Review
- None as fully native (Review creation/submission is not native)

#### Chat
- None as fully native (Messaging is not native)

#### Profile
- None as fully native (Profile viewing/editing/analytics is not native)

### Standalone routes
- None as fully native (standalone routes are web)

### Global UI surfaces
- None as fully native (modals are web or stubs)


## Not yet in Swift

### Shared Features
- Capacitor/WebView shell hosts the React bundle that implements most user-facing features
- Web routes provide discovery, feed logic, interest tracking, reviews, chat, profiles, notifications, analytics, admin, and integrations

### Pages

#### Feed
- Feed content (Recommended, Trending, Friends Interested, Reviews, Group Chats placeholder)
- Event details modal (full data experience)
- Interested toggle + counts + social proof
- Feed-level filtering/switching (real data, not placeholder)

#### Discover
- Unified search across events, artists, venues, users
- Filters (date range, genre, radius) + coordinates-based discovery
- Map and list discovery experiences
- Artist/Venue pages (event lists and following)

#### Create/Review
- Event review modal (ratings, text, submission)
- Review cards + review detail modal
- Post-submit behavior and social interactions around reviews

#### Chat
- Direct messaging
- Group chats
- Attachments and chat discovery

#### Profile
- Own profile + other users’ profiles
- Profile tabs and follower/friends navigation
- Profile edit flow
- Friends system and suggestions
- Artist/Venue following lists

### Standalone routes (web)
- Auth web routes (if any still exist in the bundle)
- Notifications page
- Streaming stats page
- Spotify callback route
- Artist events route
- Venue events route
- Artist/Venue following route
- Admin route
- Analytics dashboards (creator/business/admin)
- Events management panel

### Global UI surfaces (web or native stubs)
- Bottom navigation (if still driven by web UI in the shell)
- Side menu (verification block + navigation)
- Settings modal
- Event details modal
- Event review modal
- Review detail modal

### Native stubs / partial shells (not counted as “Swift complete”)
- HomeFeedView.swift (native chrome only, no real event data)
- DiscoverView.swift (native chrome only, no real search/discovery data)
- Create CTA modal (placeholder)
- Chat placeholder PageBody (“Coming soon”)
- Profile placeholder PageBody (no profile actions)