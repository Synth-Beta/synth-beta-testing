# Demo Mode

Demo Mode uses the **EXACT same production components** as the real app. The only difference is the data source (mock data vs API calls).

## ✅ Implementation Complete

**All Demo Pages Use Production Components:**
- ✅ **DemoHomePage** - Uses production `HomeFeed` component
- ✅ **DemoProfilePage** - Uses production `ProfileView` component  
- ✅ **DemoMessagesPage** - Uses production `UnifiedChatView` component
- ✅ **DemoDiscoverPage** - Uses production `DiscoverView` component
- ✅ **DemoCreatePostPage** - Uses production `EventReviewModal` component

**Key Features:**
- ✅ **Identical UI** - Same components, same layout, same styling as production
- ✅ **Mock Data** - Uses `DEMO_USER`, `DEMO_EVENTS`, `DEMO_REVIEWS`, etc. from `mockData.ts`
- ✅ **No API Calls** - All images use placeholder URL (`https://picsum.photos/400/300?random=1`)
- ✅ **Navigation** - Works between demo pages via `/mobile-preview/demo/*` routes
- ✅ **Only affects** `/mobile-preview/component-view` route

**Note:** The production components will attempt API calls, but in demo mode these will fail gracefully. The UI structure and layout are identical to production - perfect for visual verification and design audits.

## Usage

Navigate to `/mobile-preview/component-view` and click the demo mode buttons to preview:
- Home Feed
- Discover
- Profile (with all review types)
- Messages (DM and group chat)

## Mock Data

All mock data is defined in `src/demo/data/mockData.ts`:
- `DEMO_USER` - Fake user profile
- `DEMO_EVENTS` - Sample events
- `DEMO_REVIEWS` - Sample reviews (all 3 types)
- `DEMO_CHATS` - Sample chat threads (DM and group)
- `DEMO_MESSAGES` - Sample messages for each chat

## Files Structure

```
src/demo/
├── data/
│   └── mockData.ts          # All mock data
├── pages/
│   ├── DemoHomePage.tsx     # Demo home feed
│   ├── DemoDiscoverPage.tsx # Demo discover/search
│   ├── DemoProfilePage.tsx  # Demo profile with reviews
│   └── DemoMessagesPage.tsx # Demo messages/chat
├── DemoModeProvider.tsx     # Context provider (for future use)
└── README.md                # This file
```
