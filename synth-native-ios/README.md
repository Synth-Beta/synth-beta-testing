# Synth Native iOS - Onboarding Flow

A native SwiftUI onboarding flow (5 pages) that connects to the Supabase backend. Uses Liquid Glass / glassmorphism styling.

## Setup

### 1. Create Xcode Project

1. Open Xcode and create a new project: **File > New > Project**
2. Choose **App** under iOS
3. Product Name: `SynthNative` (or your app name)
4. Interface: **SwiftUI**
5. Language: **Swift**
6. Minimum Deployment: **iOS 15**

### 2. Add Supabase Dependency

1. **File > Add Package Dependencies**
2. Enter URL: `https://github.com/supabase/supabase-swift.git`
3. Version: **2.0.0** or later
4. Add the **Supabase** product to your app target

### 3. Add SynthNative Source Files

Add the entire `SynthNative` folder to your Xcode project (drag and drop, or **File > Add Files**). Ensure all Swift files are included in your app target.

### 4. Configure Supabase

Set your Supabase URL and anon key. Options:

- **Info.plist**: Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` keys
- **Environment**: Set in scheme or build settings
- **Config.swift**: Update `SupabaseService` and `Config` to read from your config.

### 5. Root View

In your `@main` App struct, use `SynthNativeApp` as the root:

```swift
@main
struct YourApp: App {
    var body: some Scene {
        WindowGroup {
            SynthNativeApp(
                userId: "your-auth-user-id",
                userName: "User Name"
            )
        }
    }
}
```

Integrate with Supabase Auth to pass real `userId` and `userName` after sign-in.

## Pages

1. **Birth Year + Gender** – Scroll picker, optional gender
2. **City** – Autocomplete from `city_centers` table
3. **Profile** – Username, photo, bio
4. **3 Artists** – Search and select one by one
5. **Genres** – Bubble grid, min 3 required

## Database

- **Migrations**: Run `supabase/migrations/20260216000000_onboarding_genre_categories.sql` in your Supabase project
- **RPCs**: Uses existing `search_city_centers` and `search_artists_trigram`
- **Tables**: `users`, `user_preference_signals`, `onboarding_genre_categories`

## Styling

Uses `SynthColor`, `SynthSpacing`, `SynthTypography` from `Theme.swift`. Glass effect via `.ultraThinMaterial` (iOS 15+). For iOS 26+, consider native `.liquidGlass` or `.glassEffect()`.
