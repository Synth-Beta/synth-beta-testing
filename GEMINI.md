# SYNTH APP — ANTIGRAVITY AGENT RULES
# Source of truth for all UI/UX work. Read this before touching anything.

---

## WHAT THIS APP IS
Synth is a live music discovery app — Letterboxd meets Spotify for 
concert-goers. Users discover events, follow artists/venues, write 
reviews, and build a concert passport (timestamped show history).

Target feel: Spotify (dark, bold, immersive) + Instagram (fluid, 
content-first, native gestures).

Current reality: ~95% React in a Capacitor WebView. Only the event 
detail header and share card are truly native Swift. The goal is to 
progressively migrate toward native SwiftUI — starting with the 
highest-impact surfaces.

---

## TECH STACK
- iOS shell: Swift + Capacitor (WebView bridge in ContentView.swift)
- App logic: React (TypeScript) in src/
- Styling: CSS tokens (tokens.css) + Tailwind + shadcn/ui components
- Native Swift components: Theme.swift, SynthButton.swift, 
  SynthSearchBar.swift, SynthTextStyle.swift, BottomNav.swift (unwired),
  NativeEventHeaderView.swift, SynthShareCardRenderer.swift
- Min deployment: iOS 17

---

## ⛔ NEVER TOUCH THESE — EVER
These are the structural foundation. Breaking them breaks everything.

- src/styles/tokens.css — CSS token source of truth
- ios/App/App/SwiftUI/Theme.swift — Swift token mirror (must stay 
  in sync with tokens.css)
- SynthColor.* and SynthTypography.* Swift enums
- NativeEventHeaderView + SynthDeepLinkRouter wiring in AppDelegate.swift
- ContentView.swift Capacitor WebView bridge
- CSS variable names like var(--brand-pink-500) (100s of components use these)

---

## COLOR PALETTE — SOURCE OF TRUTH
Use ONLY these values. Do not invent new colors.

### Base
- Background:     var(--neutral-50) (neutral-50) — light mode app bg
- Surface/Card:   var(--neutral-100) (neutral-100)
- Dividers:       var(--neutral-200) (neutral-200)
- Disabled:       var(--neutral-400) (neutral-400)
- Secondary text: var(--neutral-600) (neutral-600)
- Primary text:   var(--neutral-900) (neutral-900)
- Pure white:     var(--neutral-0) (neutral-0)

### Brand
- Primary pink:   var(var(--brand-pink-500)) (brand-pink-500) ← THE real brand pink
- Hover state:    var(--brand-pink-600) (brand-pink-600)
- Pressed state:  #7B1559 (brand-pink-700)
- Subtle surface: var(--brand-pink-050) (brand-pink-050)
- Purple accent:  #8D1FF4 (gradient end only)

### Gradients
- Brand gradient: 135deg, var(var(--brand-pink-500)) → #8D1FF4
- Soft gradient:  180deg, var(--neutral-0) → var(--brand-pink-050)

### Status
- Success: #2E8B63
- Error:   #C62828
- Warning: var(--status-warning-500)
- Stars:   #FCDC5F

### ⚠️ KNOWN BUG TO FIX
tailwind.config.ts has synth.pink: #FF3399 — this is WRONG.
It should be var(var(--brand-pink-500)). Fix this when you see it. Do not use #FF3399 
anywhere.

---

## TYPOGRAPHY — SOURCE OF TRUTH
Font: Inter (with -apple-system fallback on iOS)
Use .synth() modifier in Swift. Use .synth() CSS class on web.

| Style  | Size | Weight | Line Height | Used For                    |
|--------|------|--------|-------------|----------------------------|
| h1     | 35px | Bold   | 1.2         | Main headings               |
| h2     | 24px | Bold   | 1.3         | Section headings            |
| body   | 20px | Medium | 1.5         | Default content             |
| accent | 20px | Bold   | 1.5         | Emphasized text             |
| meta   | 16px | Medium | 1.5         | Labels, captions, buttons   |
| steps  | 16px | Medium | 1.5         | Onboarding (0.2em tracking) |

### ⚠️ KNOWN ISSUES TO FIX
- H1 at 35px is too large for 375px iPhone screens. When touching 
  onboarding or feed headers, scale to 28px on small screens.
- Some components use .text-meta CSS class, others use inline 
  style={{fontSize: 'var(--typography-meta-size)'}} for identical 
  results. Always use the CSS class — never inline style for typography.

---

## ANIMATION RULES

### Web (React) — What exists, what to fix
KEEP these (they're good):
- shimmer: 1.5s skeleton loader — keep exactly as-is
- bounce-in: 0.5s cubic-bezier scale+fade — keep for modals
- accordion-down/up: 0.2s ease-out — keep for collapsibles
- view-slide-in-right/left/up: 220ms transitions — keep but add 
  will-change: transform to the elements they animate

REMOVE or FIX these:
- pulse-glow: animates box-shadow → causes GPU repaint every frame.
  Replace with: filter: drop-shadow() on a ::after pseudo-element, 
  or remove entirely.
- elegant-shift: 20s continuous gradient animation → unnecessary 
  battery drain. Remove unless on a static hero screen only.
- Add @media (prefers-reduced-motion: reduce) wrapper around ALL 
  keyframe animations. None exist currently.

### Swift — Standards to implement
- Button press: scaleEffect(isPressed ? 0.96 : 1.0) with 
  .easeOut(duration: 0.12)
- Screen transitions: .spring(response: 0.35, dampingFraction: 0.7)
- Hero transitions: .matchedGeometryEffect for feed → event detail
- Haptics on: likes, RSVP, review submit, friend add, tab switches
  Use UIImpactFeedbackGenerator(style: .medium) for actions
  Use UINotificationFeedbackGenerator for success/error

---

## SCREENS — PRIORITY ORDER
Do NOT work on screens out of this order.

### PHASE 1 — Highest impact, do these first
1. Onboarding Flow (rated 1/3) 
   - Most new users see this and it's the weakest screen
   - Full redesign in SwiftUI (truly native, not WebView)
   - Smooth spring transitions between steps
   - Brand gradient backgrounds
   - Goal: feel like Spotify's onboarding

2. Bottom Navigation — Wire up BottomNav.swift
   - BottomNav.swift already exists but is NOT wired to production
   - The web BottomNav is what users currently see
   - Swap to native Swift BottomNav for haptics + spring tab switching
   - Icon-only (no text labels), like Instagram
   - Add UIImpactFeedbackGenerator on every tab press

3. Event Detail → Full-Screen Immersive View
   - Currently a bottom-sheet modal, should be full-screen hero
   - Large concert photo as background
   - Frosted glass (.ultraThinMaterial) for metadata overlay
   - Smooth hero transition from feed card
   - Feel: Spotify album page

### PHASE 2 — Do after Phase 1 is solid
4. Feed Cards — Standardize the card system
   - One card style for all event cards (standardize aspect ratio)
   - Full-bleed imagery with LinearGradient overlay for text
   - Fix: SceneCard.tsx has 50+ inline style={{}} — replace with 
     CSS utility classes
   - Fix: mixed use of .text-meta class vs inline font styles

5. Connect Screen (rated 1/3, marked WIP)
   - Needs full design pass
   - Social discovery should feel like Instagram's Explore

### PHASE 3 — Polish pass
6. Streaming Stats — Visual hierarchy improvement
7. Chat — Polish messaging bubbles and input bar
8. Profile/Passport — Make the passport visually stunning
9. Review Flow — Make it feel native, not like a web form

---

## COMPONENT RULES

### Web components (React)
- NEVER use inline style={{}} for typography — use CSS classes
- NEVER hardcode z-index values. Use CSS variables:
  --z-modal, --z-overlay, --z-nav (define these in tokens.css)
- NEVER use !important on z-index
- shadcn/ui components are fine to keep — don't replace them
- For new cards: always use CSS token variables, never raw hex values

### Swift components  
- SwiftUI first, UIKit only when SwiftUI cannot do it
- Always use SynthColor.* and SynthTypography.* enums — never raw 
  hex or font sizes
- New views must support both light and dark mode via token system
  (dark mode CSS variables are ready in tokens.css, just unused)
- New views must handle safe area insets (.ignoresSafeArea for 
  full-bleed images only)

---

## DARK MODE — READY BUT NOT ENABLED
The CSS variable system in tokens.css is already structured to support 
dark mode. No toggle exists yet. When implementing dark mode:
- Do NOT invent new color values
- Add @media (prefers-color-scheme: dark) overrides to tokens.css only
- Swift Theme.swift must stay in sync with any new dark values
- Spotify-style dark: background #0A0A0A, cards #1A1A1A, 
  keep brand pink var(var(--brand-pink-500)) as accent

---

## KNOWN BUGS — FIX ON SIGHT
1. tailwind.config.ts synth.pink: #FF3399 → change to var(var(--brand-pink-500))
2. SceneCard.tsx 50+ inline styles → replace with CSS token classes
3. pulse-glow animation on box-shadow → replace with drop-shadow filter
4. No prefers-reduced-motion anywhere → add to all CSS animations
5. ErrorBoundary only on Leaflet map → add to all major page components
6. Z-index values 40/9999/10000 with !important → replace with 
   CSS variable system

---

## DEFINITION OF DONE
A UI task is complete when:
- [ ] No raw hex values (use token variables or Swift enums)
- [ ] No inline typography styles (use CSS classes or .synth() modifier)
- [ ] Animations have prefers-reduced-motion fallback
- [ ] New Swift views use SynthColor.* and SynthTypography.*
- [ ] Scroll performance is 60fps (no layout thrash on scroll)
- [ ] Dark mode tokens applied if touching CSS variables
- [ ] No new !important declarations

---

## MIGRATION PLAN — Capacitor → React Native + Expo

### Goal
Migrate from React-in-Capacitor-WebView to React Native + Expo.
Same TypeScript/React knowledge. True native iOS + Android + Web.

### New Tech Stack (target)
- Framework: React Native + Expo (SDK 52+)
- Navigation: Expo Router (file-based, like Next.js)
- Animations: Reanimated 3 (replaces CSS animations)
- Gestures: React Native Gesture Handler
- Design tokens: Style Dictionary (auto-generates Swift + Kotlin + CSS)
- Web: React Native Web (same components run in browser)
- Images: Expo Image (replaces AsyncImage and web img tags)
- Icons: Expo Vector Icons or Lucide React Native

### Migration Rules
- NEVER migrate a screen until its API/data layer is confirmed working
- Each screen migrated must pass: 60fps scroll, haptics working, 
  dark mode ready
- Keep Capacitor app running in parallel until 100% migrated
- All new components use StyleSheet.create() — never inline styles
- All colors via SynthTokens (generated by Style Dictionary from 
  tokens.json)
- All typography via SynthText component wrapping RN Text

### Component Translation Rules
| Web (current)        | React Native (target)        |
|---------------------|------------------------------|
| div                 | View                         |
| p, span, h1-h6      | Text (with SynthText wrapper)|
| img                 | Expo Image                   |
| CSS className       | StyleSheet.create()          |
| onClick             | onPress                      |
| CSS animations      | Reanimated 3 useAnimatedStyle|
| CSS hover           | Pressable with state         |
| React Router        | Expo Router                  |
| shadcn/ui           | Custom RN components         |
| CSS flexbox         | RN flexbox (same concept)    |
| overflow: scroll    | ScrollView or FlatList       |
| position: fixed     | position: 'absolute'         |

### Migration Order (DO NOT SKIP STEPS)
Phase 1 — Foundation (do this before any screens)
  1. Init Expo project with TypeScript template
  2. Set up Style Dictionary to generate tokens from tokens.json
  3. Build SynthTokens.ts (colors, typography, spacing)
  4. Build SynthText component (replaces all Text usage)
  5. Build SynthButton component (replaces SynthButton.swift for RN)
  6. Set up Expo Router with tab navigation (replaces BottomNav)
  7. Wire up existing backend/API calls (confirm all endpoints work)

Phase 2 — Screens (in this order)
  1. Onboarding flow (currently worst rated, new users see it first)
  2. Feed (most visited, highest DAU impact)
  3. Event Detail (most visited individual screen)
  4. Search/Calendar
  5. Profile + Passport
  6. Chat + Messaging
  7. Connect screen
  8. Streaming Stats
  9. Notifications

Phase 3 — Platform Polish
  iOS:     Add haptics, native share sheet, Apple Music integration
  Android: Material You adaptations, Google Play compliance
  Web:     SEO meta tags, og:image for event sharing, PWA manifest

### Definition of Done Per Screen
- [ ] All div/p/img replaced with View/Text/Image
- [ ] No CSS classes — StyleSheet.create() only
- [ ] Animations use Reanimated 3
- [ ] Colors from SynthTokens only
- [ ] Works on iOS simulator
- [ ] Works on Android emulator  
- [ ] Works in web browser
- [ ] 60fps on all scroll/animation interactions

## ASSET RULES — NEVER VIOLATE
- NEVER create placeholder PNG/icon files
- ALWAYS source brand assets from /public/ or 
  /src/assets/ — they already exist
- The Synth logo and brand assets are already in 
  the project, find them before creating anything new
- mobile/ folder = React Native app for iOS + Android + Web
  It is NOT a separate Android-only folder
- /ios/ and /android/ at root = OLD Capacitor folders, 
  do not touch them