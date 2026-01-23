# Pages and Features (Current)

Last updated: 2026-01-15

This document summarizes the current user-facing pages and key features. If a feature is not listed here, it is not guaranteed to be part of the current product surface.

## Pages and Views

### Core app views (mobile-first)
- Home Feed (`HomeFeed`)
  - Feed types: Recommended, Trending, Friends Interested, Reviews, Group Chats (placeholder)
  - Event details modal and interest toggle
- Discover (`DiscoverView`)
  - Unified search and filters
  - Map and list discovery
- Profile (`ProfileView`)
  - Own profile and other users
  - Profile tabs and navigation to followers/events
- Profile Edit (`ProfileEdit`)
- Notifications (`NotificationsPage`)
- Chat (`UnifiedChatView`)
  - Direct chats and group chats
- Analytics (`CreatorAnalyticsDashboard`, `BusinessAnalyticsDashboard`, `AdminAnalyticsDashboard`)
- Events Management (`MyEventsManagementPanel`)
- Onboarding (`OnboardingFlow`, `OnboardingTour`)

### Standalone routes
- Auth (`/auth`, `Auth`)
- Streaming Stats (`/streaming-stats`, `StreamingStatsPage`)
- Spotify Callback (`/spotify/callback`, `SpotifyCallback`)
- Artist Events (`/artist/:artistId`, `ArtistEvents`)
- Venue Events (`/venue/:venueName`, `VenueEvents`)
- Artist/Venue Following (`/artist-following/:userId?`, `ArtistFollowingPage`)
- Admin (`/admin`, `Admin`)

### Global UI surfaces
- Bottom navigation (`BottomNavAdapter`, `MobileNavigation`)
- Side menu (`SideMenu`) with verification section
- Settings modal (`SettingsModal`)
- Event review modal (`EventReviewModal`)

## Core Features

### Event discovery and search
- JamBase-backed event data and local event storage
- Unified search across events, artists, venues, and users
- Location-based discovery (radius + coordinates)
- Date range and genre filters

### Home feed
- Personalized recommendations (preferences v4)
- Trending events
- Friends interested feed
- Reviews feed
- Group chat discovery: placeholder state in the feed toggle

### Event details and interest tracking
- Event details modal with media, venue, and ticket info
- Mark interested / not interested
- Interested counts and social proof where available

### Reviews
- Create reviews via event review modal
- Ratings and review text
- Review details modal and review cards in feed

### Social and community
- User profiles with avatars and bios
- Friends system and friend suggestions
- Direct and group messaging
- Follow artists and venues

### Music integrations
- Spotify and Apple Music connection
- Streaming stats page
- Preference-based recommendations

### Onboarding and guidance
- Onboarding flow with reminders
- In-app tour for first-time users

### Analytics and admin
- Creator, business, and admin analytics dashboards
- Admin panel entry point

## Known Placeholder or In-Progress Areas

- Group chat discovery in Home Feed is currently a placeholder view (coming soon).

## SwiftUI Translation Guidance (Additions for Future Agent)

These items are intended to help a future Cursor agent recreate the app in SwiftUI, using the design guide as the primary source of visual rules. This section focuses on structure, data flow, and integration details that are not obvious from UI screens alone.

### Navigation and routing model
- **Primary tabs:** Feed, Discover, Create/Review (plus button), Chat, Profile.
- **Modal flows:** Event Details modal, Event Review modal, Settings modal, Review Detail modal.
- **Deep links:** Artist events, Venue events, Notifications, Profile (with optional tab), Streaming stats.
- **Back behavior:** Use navigation stack for most views; preserve “return to prior view” behavior (not always “back to feed”).

### Data sources and services
- **Supabase** is the backend for auth, database, and storage. Use it as the system of record.
- **JamBase** provides event data for discovery/trending. Keep a clear boundary between JamBase-provided event IDs and internal event IDs.
- **Streaming** integrations: Spotify + Apple Music for preferences and stats.
- **Recommended feeds:** Preferences v4 feed, trending feed, friends interested feed, reviews feed.

### State and session handling
- **Auth state:** All primary views require auth; fallback to Auth view when session expires.
- **Session expiry:** On expiration, show blocking message and return to Auth.
- **Local persistence:** Uses localStorage/sessionStorage to pass intent (e.g., open event details, profile tab). SwiftUI should preserve similar intent with local persistence (UserDefaults or equivalent).

### Events and interest logic
- **Event details:** Show details, allow interest toggle, and update counts.
- **Interest storage:** Event interest uses a relationships table with fallback compatibility to older tables.
- **Social proof:** Surface friend interest counts where available.

### Messaging and social
- **Chat types:** Direct and group chat.
- **Friends:** Requests, recommendations, and friend suggestion rails.
- **Profile navigation:** Supports visiting other users’ profiles; use a shared profile view with userId input.

### Onboarding and guidance
- **Onboarding flow** is a dedicated view.
- **Onboarding tour** triggers on first complete.
- **Reminder banner** shows if onboarding is skipped but incomplete.

### Analytics and admin
- **Dashboards:** Separate creator/business/admin dashboards.
- **Access control:** Use account type to gate analytics views.

### Design system alignment
- **Tokens:** Colors, typography, spacing, and radius should map to design tokens from the design guide.
- **Icons:** Use Lucide-style icons, plus four selected-state SVGs for bottom nav.
- **Typography:** Always use the design guide’s type scale and weights.
- **Safe areas:** Respect top/bottom safe areas, especially for bottom navigation.

### UI components to prioritize in SwiftUI
- Mobile header with dropdown feed type selector.
- Bottom nav with selected SVGs.
- Event cards: compact, list, and modal presentation.
- Review cards and review detail modal.
- Filters (date, genre, radius) and map/list toggle for discovery.

### Error handling and loading
- **Loading states:** Use spinners and “loading” placeholders for each feed section.
- **Error states:** Show non-blocking error messages; avoid hard crashes.
- **Timeouts:** Recommended feed uses a timeout to avoid infinite loading.

### Assets and content
- **Fallback images:** Provide defaults for events without images.
- **Image URLs:** Replace JamBase placeholders with fallbacks.
- **Verification section:** Keep the verification status block in the side menu if present.

### Suggested SwiftUI file organization
- `App/` (entry, app state, auth, navigation)
- `Features/Feed/`, `Features/Discover/`, `Features/Profile/`, `Features/Chat/`
- `Components/` (cards, headers, buttons, modals)
- `Services/` (Supabase, JamBase, streaming, friends, events)
- `Models/` (Event, Review, User, Chat, FeedItem)
- `Resources/` (icons, images, design tokens)

### Open questions to resolve before translation
- Confirm the single source of truth for event IDs across feeds.
- Confirm which group chat discovery experience will replace the placeholder.
- Confirm any offline requirements (not currently defined).
