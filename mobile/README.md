# Synth mobile app (Expo / React Native)

**This is the primary iOS and Android client** for store distribution. Builds use **EAS** (Expo Application Services). Same Supabase backend and APIs as the web app in the repo root.

The root **`ios/`** and **`android/`** folders (at repo root, next to `mobile/`) are **legacy Capacitor** shells that load the Vite web bundle in a WebView. Do not add new product features there; see [../ios/README.md](../ios/README.md) and [../android/README.md](../android/README.md).

## Prerequisites

- Node.js (match repo root)
- [Expo CLI](https://docs.expo.dev/get-started/installation/) / EAS CLI for cloud builds: `npm i -g eas-cli`
- Xcode (macOS) for iOS simulator or device builds
- Android Studio for Android emulator or device builds

## Environment

1. Copy env template:

   ```bash
   cd mobile
   cp .env.example .env
   ```

2. Set **the same Supabase project** as web (`VITE_*` in root → `EXPO_PUBLIC_*` here):

   - `EXPO_PUBLIC_SUPABASE_URL`
   - `EXPO_PUBLIC_SUPABASE_ANON_KEY`

3. Optional (e.g. auth redirects): `EXPO_PUBLIC_SITE_URL` — see [app/(auth)/sign-in.tsx](app/(auth)/sign-in.tsx).

4. **Android — Google sign-in** (same screen slot as iOS “Continue with Apple”): set both in EAS secrets or `.env`, and enable the Google provider in the Supabase dashboard with the same OAuth client IDs.

   - `EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID` — OAuth **Android** client from [Google Cloud Console](https://console.cloud.google.com/) (package name + SHA-1 from your release/debug keystore as Expo/Android requires).
   - `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` — OAuth **Web application** client (used by Expo’s token exchange). If omitted, the Android client ID is reused as a fallback (works for some setups; prefer setting both explicitly).

## Local development

From **repo root** (shortcut):

```bash
npm run mobile:start
```

Or from `mobile/`:

```bash
npx expo start
```

Run on a simulator/device:

```bash
npx expo run:ios
npx expo run:android
```

## Production builds (App Store / Play Store)

Profiles live in [eas.json](eas.json):

- **development** — dev client, internal, iOS simulator / Android APK
- **preview** — internal distribution
- **production** — store submission (iOS medium resource class, Android app bundle)

Typical flow (logged into Expo):

```bash
cd mobile
eas build --profile production --platform ios
eas build --profile production --platform android
eas submit --profile production
```

Use your Expo project’s credentials and bundle identifiers from [app.json](app.json).

## Parity with web

The web app (`src/` + `MainApp`) has more screens and depth than Expo in places. A rough mapping lives in [PARITY.md](PARITY.md) for sprint planning.

## Native Swift / Kotlin

**Why you might not see `.swift` / `.kt` in `mobile/`:** This app uses **managed Expo + EAS**. The Android and iOS **native projects are generated** when you run `npx expo prebuild` locally or when **EAS Build** runs in the cloud. That output is usually **gitignored** or not committed, but the **Play Store AAB** and **App Store IPA** still contain Kotlin, Java, C++, Swift, etc. from the React Native template and dependencies—you do not have to author all of it by hand to ship.

Prefer **Expo config plugins** and **local Expo modules** when you need **custom** native code. Avoid duplicating full screens in SwiftUI or Jetpack Compose alongside RN.

**Root `android/`** (Capacitor legacy) uses **Java** (`MainActivity.java`), not Kotlin, in this repo—that tree is the old WebView shell, not the Expo app.
