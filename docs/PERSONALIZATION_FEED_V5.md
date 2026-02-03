# Personalization Feed V5

## Overview

The V5 feed delivers a personalized, location-aware event feed with weighted genre sampling. It fetches 100 events in a single batch and distributes them across three categories: **Recommended**, **Following**, and **Trending**.

## Distribution

| Category | Total (per 100) | Per Page (of 20) | Description |
|----------|-----------------|------------------|-------------|
| **Recommended** | 50 | 10 | Nearby events weighted by user's genre preferences |
| **Following** | 25 | 5 | Events from followed artists/venues (any location) |
| **Trending** | 25 | 5 | Random nearby events |

## How It Works

### 1. Location Filtering (Required)

All **Recommended** and **Trending** events must be within a 50-mile bounding box of the user's location:

```sql
AND e.latitude BETWEEN (user_lat - 50/69) AND (user_lat + 50/69)
AND e.longitude BETWEEN (user_lng - 50/69*cos(lat)) AND (user_lng + 50/69*cos(lat))
```

**Following** events have no location filter - users see events they follow anywhere.

### 2. Genre Weighting (Recommended Only)

Events are weighted based on the user's `genre_preference_scores` from `user_preferences`:

```json
{
  "Rock": 159.3,
  "Jam Band": 158.5,
  "Pop": 59.4,
  "Indie": 43.8,
  "EDM": 0.5
}
```

**Weight calculation:**
```
total_weight = 1.0 + SUM(matching_genre_scores)
```

- All nearby events get a base weight of **1.0**
- Events matching user's preferred genres get **bonus weight**
- Higher weight = more likely to appear in feed

**Example:**
| Event Genres | Weight | Relative Probability |
|--------------|--------|---------------------|
| Rock, Blues | 179.2 | Very high |
| Jam Band | 159.5 | Very high |
| Country | 2.5 | Low |
| Unknown genre | 1.0 | Baseline |

### 3. Weighted Random Sampling

Recommended events use **weighted random sampling** to select 50 events:

```sql
ORDER BY -LN(RANDOM() + 0.0001) / (total_weight + 1)
```

This formula ensures:
- Higher weight = exponentially more likely to be selected
- Randomness preserved (not purely sorted by weight)
- Variety maintained across multiple page loads

### 4. Page Interleaving

Events are distributed across pages to ensure variety:

```
Page 1 (events 1-20):  [10 recommended] + [5 following] + [5 trending] → shuffled
Page 2 (events 21-40): [10 recommended] + [5 following] + [5 trending] → shuffled
Page 3 (events 41-60): [10 recommended] + [5 following] + [5 trending] → shuffled
...
```

Within each page, events are **randomly shuffled** so users don't see a predictable pattern.

## Client-Side Implementation

### Batch Fetching

```typescript
const BATCH_SIZE = 100;  // Fetch 100 events at once
const PAGE_SIZE = 20;    // Display 20 at a time
```

1. **Initial load**: Fetch 100 events, display first 20
2. **Load more**: Display next 20 from local buffer (instant)
3. **Background prefetch**: At 60 displayed, prefetch next 100 in background
4. **Seamless pagination**: User never waits after initial load

### Location Requirement

The feed waits for user location before loading:

```typescript
const initFeed = async () => {
  // 1. Get location first
  const location = await LocationService.getCurrentLocation();
  
  // 2. Then fetch feed with location
  const result = await PersonalizationEngineV5.getUnifiedFeed(
    userId, 
    100, 
    0, 
    { latitude: location.lat, longitude: location.lng }
  );
};
```

### Pull-to-Refresh

- Pull down at top of feed → visual indicator appears
- Release at 80px threshold → feed refreshes with new random events
- Uses latest location and preferences

## SQL Function Signature

```sql
get_personalized_feed_v5(
  p_user_id          UUID,
  p_section          TEXT DEFAULT NULL,      -- Unused (unified feed)
  p_limit            INT DEFAULT 100,
  p_offset           INT DEFAULT 0,
  p_city_lat         NUMERIC DEFAULT NULL,   -- Required for rec/trending
  p_city_lng         NUMERIC DEFAULT NULL,   -- Required for rec/trending
  p_radius_miles     NUMERIC DEFAULT 50,
  p_include_past     BOOLEAN DEFAULT FALSE,
  p_city_filter      TEXT DEFAULT NULL,
  p_state_filter     TEXT DEFAULT NULL,
  p_max_days_ahead   INT DEFAULT 90
)
```

## Response Format

```typescript
{
  section: "recommending" | "following" | "trending",
  id: UUID,
  score: number,        // Position in final ordering
  payload: {
    title: string,
    artist_name: string,
    venue_name: string,
    venue_city: string,
    event_date: string,
    genres: string[],
    latitude: number,
    longitude: number,
    // ... other event fields
  },
  context: {
    event_type: string,   // Same as section
    genre_weight: number, // For debugging
    page_num: number      // Which page this event belongs to
  }
}
```

## Fallback Behavior

| Scenario | Behavior |
|----------|----------|
| No location available | Feed shows only Following events (no Rec/Trending) |
| No genre preferences | All nearby events weighted equally (base 1.0) |
| No followed artists | Extra Recommended events fill the Following slots |
| Few nearby events | Feed may have fewer than 100 events |

## Performance

- **Timeout**: 45 seconds
- **Indexes used**: `events(latitude, longitude)`, `events(event_date)`
- **Batch fetch**: 100 events in single query
- **Local pagination**: Instant "Load more" from cached buffer
- **Background prefetch**: Next batch loads before user needs it

## Files

| File | Purpose |
|------|---------|
| `supabase/migrations/20260129100008_get_personalized_feed_v5.sql` | SQL function |
| `src/services/personalizedFeedService.ts` | Client service (`PersonalizationEngineV5`) |
| `src/components/home/UnifiedEventsFeed.tsx` | Feed component |
