# Web (`MainApp`) vs Expo (`mobile/app`) parity

Ship-gate tracker for strict visual + behavior parity. A screen is only considered matched when all acceptance checks pass.

## Acceptance checks per screen

- `Layout`: Same information hierarchy and major block placement as old WebView.
- `Typography`: Equivalent font sizes, weights, and emphasis.
- `Spacing`: Equivalent vertical rhythm, paddings, and safe-area handling.
- `Behavior`: Same navigation flow, CTA meaning, disabled/empty/loading/error handling.
- `State`: Same signed-in/signed-out/onboarding transitions and deep-link behavior.

## Route map and current parity status

| Web `ViewType` / area | Expo route(s) | Status | Notes |
|----------------------|---------------|--------|-------|
| `auth` | `(auth)/sign-in` | In progress | Matched to web `Auth.tsx`: soft pink gradient shell, segmented tabs, black **Continue with Apple** (iOS) / black **Continue with Google** (Android when `EXPO_PUBLIC_GOOGLE_*` set), forgot-password row, trouble footer, magic link link, `#FF3399` primary. **Device QA** (Apple / Google / email / reset). |
| `onboarding` | `(onboarding)/welcome`, `scene`, `artists`, `venues`, `connect` | In progress | Welcome/auth routing fixed; step styling and spacing still being tightened. |
| `feed` | `(tabs)/index` | In progress | Events pill + **Powered by JamBase** (center) + menu/badge; filter pills; **Who You Should Know** horizontal rail (`get_similar_users_to_friend` + fallbacks); network/trending lists. **Device QA** for layout on small widths + empty/skeleton states. |
| `search` (Discover) | `(tabs)/search`, `(tabs)/discover` | In progress | Search exists; discover hub was simplified and needs web-structure parity checks. |
| `post` | `(tabs)/post` | In progress | CTA is present; full web composer parity not complete yet. |
| `chat` | `(tabs)/chat`, `chat/[id]` | In progress | Thread list works; visual + interaction parity pass pending. |
| `profile` | `(tabs)/profile` | In progress | Passport/stats sections exist; alignment with web profile still in progress. |
| `profile-edit` | `profile-edit` | In progress | Route exists; partial implementation being expanded toward web parity. |
| `settings` | `settings` | In progress | Route exists; replacing placeholder structure with web-parity sections. |
| `notifications` | `notifications` | In progress | List is wired; parity polish pending. |
| `streaming-stats` | `stats` | In progress | Core stats rendered; parity polish pending. |
| `events` (My events) | `my-events` | In progress | Route exists; replacing placeholder with parity structure. |
| `analytics` | — | Out of scope | No dedicated Expo analytics surface in this pass. |

## Behavioral parity checks (global)

- Auth guard and onboarding guard route users to the same destinations as WebView equivalents.
- Deep links only open when authenticated and onboarding complete.
- Bottom-tab behavior mirrors old mobile flow (not desktop left-rail behavior).
- Loading/empty/error states do not strand users and always expose primary next action.

## Ship gate

Do not ship until every in-scope route above is marked complete against all five acceptance checks.

## Splash / launch (Expo vs Capacitor)

- Capacitor iOS uses `LaunchScreen.storyboard` with a full-bleed **Splash** image from native assets (not duplicated in this repo snapshot).
- Expo uses `app.json` → `splash.image` (`assets/images/splash-icon.png`) and `backgroundColor` **`#FDF2F8`** to align with the web auth shell pink wash rather than a solid brand-magenta flash.

## Manual QA checklist (run on **iOS + Android** before marking any route “complete”)

Automated: from `mobile/`, `npx tsc --noEmit` (and project lint if configured).

1. Cold start: splash appears, then router lands on expected entry (onboarding vs tabs).
2. **Auth**: Sign In — email/password, forgot password (with email filled), magic link; Sign Up — name/email/password; iOS **Continue with Apple**; Android shows “Apple … iOS” copy.
3. **Home feed**: header shows Events + JamBase + menu badge; pull-to-refresh; filters switch content; friend rail shows skeleton then cards or hides when empty; **Add** sends request without crashing.
4. Tabs: Discover, Create/post, Chat, Profile — navigate and back.
5. **Profile → settings → profile-edit**; **notifications**; **my-events** (signed-in).
6. Sign out and confirm guards return to auth/onboarding as designed.

Tick each route in the table above only after all five acceptance checks pass for that route.
