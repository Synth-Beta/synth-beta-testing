# Web (`MainApp`) vs Expo (`mobile/app`) parity

High-level map of **Vite + React** views (`src/components/MainApp.tsx` `currentView`) to **Expo Router** routes. Use this to prioritize RN work; many Expo routes are stubs or thinner than web.

| Web `ViewType` / area | Expo route(s) | Notes |
|----------------------|---------------|--------|
| `feed` | `(tabs)/index` | Home feed |
| `search` (Discover) | `(tabs)/search`, `(tabs)/discover` | Discover hub + search |
| `profile` | `(tabs)/profile` | Own / other profile depth may differ |
| `profile-edit` | `profile-edit` | Placeholder / partial vs web `ProfileEdit` |
| `settings` | `settings` | Placeholder / partial vs web `SettingsModal` page |
| `notifications` | `notifications` | Compare to `NotificationsPage` |
| `chat` | `(tabs)/chat`, `chat/[id]` | Thread list + thread |
| `streaming-stats` | `stats` | Streaming / stats |
| `analytics` | — | Creator/business/admin dashboards; no dedicated Expo parity yet |
| `events` (My events) | `my-events` | Compare to web panel |
| `onboarding` | `(onboarding)/*` | welcome, artists, venues, scene, connect |
| `auth` | `(auth)/sign-in` | Auth flow |

**Event detail:** web uses modals / global detail; Expo: `event/[id]`.

**Post / review CTA:** web `MainNav` opens review modal; Expo: `(tabs)/post`.

Update this table when you add or flesh out screens.
