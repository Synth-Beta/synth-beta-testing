# Preferences V4 Feed - Implementation Guide

## Overview
The Preferences V4 Feed is a new personalized event recommendation system that uses the `user_preferences` BCNF schema to provide highly accurate, real-time recommendations.

## Architecture

### 1. Database Function
**File:** `supabase/migrations/20250126000001_create_preferences_v4_feed.sql`

**Function:** `get_preferences_v4_feed()`

**Features:**
- Uses `user_preferences.genre_preference_scores` for genre matching
- Uses `user_preferences.artist_preference_scores` for artist matching
- Uses `user_preferences.venue_preference_scores` for venue matching
- Uses `user_preferences.top_genres`, `top_artists`, `top_venues` for quick lookups
- Calculates relevance score based on:
  - Artist match (max 40 points)
  - Genre match (max 30 points)
  - Venue match (max 15 points)
  - Social proof (max 10 points)
  - Recency (max 5 points)

### 2. TypeScript Service
**File:** `src/services/preferencesV4FeedService.ts`

**Class:** `PreferencesV4FeedService`

**Methods:**
- `getFeed()` - Get feed with limit/offset
- `getFeedPaginated()` - Get feed with page-based pagination

### 3. React Component
**File:** `src/components/home/PreferencesV4FeedSection.tsx`

**Component:** `PreferencesV4FeedSection`

**Features:**
- Automatic pagination with "Load More" button
- Loading states
- Error handling
- Empty state messaging
- Integrates with existing event card components

## Integration

### In HomeFeed Component
The v4 feed is integrated into the "Your Events" section:

```tsx
<PreferencesV4FeedSection
  userId={currentUserId}
  onEventClick={handleEventClick}
  filters={{
    city: activeCity || undefined,
    includePast: false,
    maxDaysAhead: 90,
  }}
/>
```

## Scoring Algorithm

### Artist Score (40 points max)
1. **Top Artists Match:** If event artist is in `top_artists` array
   - Score = (array_length - position + 1) * 2.0
   - Example: 1st place = 50 * 2 = 100, capped at 40

2. **Artist Preference Score:** If artist has score in `artist_preference_scores`
   - Score = (preference_score * 0.4), capped at 40

3. **Fallback:** Check `user_preference_signals` for artist signals
   - Score = SUM(signal_weight) * 0.4, capped at 40

### Genre Score (30 points max)
1. **Genre Preference Scores:** Sum scores from `genre_preference_scores` JSONB
   - For each event genre, get score from JSONB
   - Sum all genre scores, capped at 30

2. **Top Genres Match:** If genre is in `top_genres` array
   - Score = (array_length - position + 1) * 1.5

### Venue Score (15 points max)
1. **Venue Preference Score:** If venue has score in `venue_preference_scores`
   - Score = (preference_score * 0.15), capped at 15

2. **Fallback:** Check `user_preference_signals` for venue signals
   - Score = SUM(signal_weight) * 0.15, capped at 15

### Social Proof Score (10 points max)
- Count friends interested in event
- Score = COUNT(friends_interested) * 2.0, capped at 10

### Recency Score (5 points max)
- Events in next 30 days: Linear decay from 5 to 0
- Events 31-60 days out: 2 points
- Events beyond 60 days: 0 points

## Performance

### Indexes Used
- `user_preferences.user_id` - Fast user lookup
- `user_preferences.genre_preference_scores` (GIN) - Fast genre JSONB queries
- `user_preferences.artist_preference_scores` (GIN) - Fast artist JSONB queries
- `events.event_date` - Date filtering
- `events.venue_city`, `events.venue_state` - Location filtering

### Query Optimization
- Only processes events with some relevance (filters out 0-score events)
- Limits results with `LIMIT` and `OFFSET` for pagination
- Uses CTEs for efficient scoring

## Usage Examples

### Basic Usage
```typescript
const result = await PreferencesV4FeedService.getFeed(
  userId,
  20,  // limit
  0,   // offset
  {
    city: 'Seattle',
    includePast: false,
    maxDaysAhead: 90,
  }
);
```

### Pagination
```typescript
// Page 0
const page0 = await PreferencesV4FeedService.getFeedPaginated(userId, 0, 20);

// Page 1
const page1 = await PreferencesV4FeedService.getFeedPaginated(userId, 1, 20);
```

## Benefits Over Previous Versions

1. **Real-time Updates:** Uses automatically computed preferences
2. **Accurate Scoring:** Based on aggregated signal weights
3. **Genre Normalization:** Handles multiple genres per event correctly
4. **BCNF Schema:** Clean, normalized data structure
5. **Performance:** Efficient queries with proper indexes

## Migration Path

1. Run SQL migration: `20250126000001_create_preferences_v4_feed.sql`
2. Deploy TypeScript service: `preferencesV4FeedService.ts`
3. Deploy React component: `PreferencesV4FeedSection.tsx`
4. Update HomeFeed to use new component
5. Monitor performance and user engagement

## Future Enhancements

- [ ] Add location-based scoring (distance from user)
- [ ] Add time-of-day preferences
- [ ] Add day-of-week preferences
- [ ] Add price range preferences
- [ ] Add venue type preferences
- [ ] Add collaborative filtering (users with similar tastes)








