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
| `auth` | `(auth)/sign-in` | In progress | Unified sign in/sign up + Apple flow restored; visual parity still tuning. |
| `onboarding` | `(onboarding)/welcome`, `scene`, `artists`, `venues`, `connect` | In progress | Welcome/auth routing fixed; step styling and spacing still being tightened. |
| `feed` | `(tabs)/index` | In progress | Data feed is wired; header/filter/card parity still tuning. |
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
