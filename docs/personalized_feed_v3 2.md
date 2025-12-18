# Unified Personalized Feed v3

This document describes the v3 unified personalized feed implementation that combines multiple content types (events, reviews, friend suggestions, group chats) in a single scrollable feed.

## Overview

The v3 feed follows the mental model of **one feed, multiple modules, one scoring + blending layer** - similar to TikTok, Twitter, or Instagram where different content types appear in a single scroll.

## Architecture

### Feed Item Structure

Every feed item resolves to a single canonical shape:

```typescript
interface FeedItem {
  id: UUID
  type: 'event' | 'review' | 'friend_suggestion' | 'group_chat'
  score: NUMERIC  // 0-100 normalized score
  payload: JSONB  // Type-specific data
  context: JSONB  // Why you're seeing this (explanations)
  created_at: TIMESTAMP
}
```

### Supported Content Types

| Type | Description |
|------|-------------|
| `event` | Upcoming event cards (enhanced v2 logic) |
| `review` | Event reviews from friends / 2nd / 3rd connections |
| `friend_suggestion` | Scrollable horizontal rail of suggested friends |
| `group_chat` | Suggested group chats tied to genres, cities, artists |

## Database Function

### Signature

```sql
get_personalized_feed_v3(
  p_user_id        UUID,
  p_limit          INT DEFAULT 50,
  p_offset         INT DEFAULT 0,
  p_city_lat       NUMERIC DEFAULT NULL,
  p_city_lng       NUMERIC DEFAULT NULL,
  p_radius_miles   NUMERIC DEFAULT 50
)
```

**Important**: No `following_only` or content-type flags. Those become scoring inputs, not filters.

## Implementation Details

### Step 1: Social Graph Resolution

Precomputes connection depths once per request:
- **1st degree**: Direct friends
- **2nd degree**: Friends of friends
- **3rd degree**: Friends of friends of friends

Stored as a CTE with `connection_depth`.

### Step 2: Candidate Pool Generation

Each content type gets its own candidate query + score:

#### A. Events (Enhanced v2 Logic)

- Reuses existing event scoring logic
- Enhanced with:
  - Connection depth weights
  - Review count weights
  - Friends attending velocity

#### B. Reviews (NEW)

**Eligibility:**
- Review author ∈ 1st, 2nd, or 3rd degree
- Event is upcoming or recent (last 30 days)

**Base Scoring:**
| Signal | Score |
|--------|-------|
| 1st-degree friend | +30 |
| 2nd-degree | +18 |
| 3rd-degree | +8 |
| Same city | +6 |
| Same genre | +10 |
| Review engagement | + up to 15 |

#### C. Friend Suggestions (Rail)

Structural items injected every ~10 rows.

**Candidate Logic:**
- 2nd/3rd degree connections
- Shared genres ≥ 2 (simplified in current implementation)
- Mutual friends ≥ 1
- Not already requested / blocked

**Returned as:**
```json
{
  "type": "friend_suggestion",
  "payload": {
    "users": [ ... ]
  }
}
```

#### D. Group Chat Suggestions

**Candidate Logic:**
- User not a member
- Tagged with: same city OR same genre OR same artist OR event user saved
- Active in last 14 days

**Scoring:**
| Signal | Weight |
|--------|--------|
| City match | +15 |
| Genre overlap | +20 |
| Friend in chat | +25 |
| Activity velocity | +10 |

### Step 3: Unified Scoring Normalization

Each content type scores on its own scale → normalized to 0–100:

- `event_score_normalized`
- `review_score_normalized` (with 0.9 weight)
- `group_chat_score_normalized` (with 0.7 weight)
- `friend_suggestion` (structural, not ranked)

### Step 4: Feed Blending

**Hard constraints:**
- No more than 2 reviews in a row
- 1 group chat every 8 items (simplified in implementation)
- Friend rail every ~10 items (or top-of-feed)

**Example pattern:**
```
Event
Review
Event
Event
Group Chat
Event
Review
Event
Friend Rail
Event
```

### Step 5: Output Format

```json
{
  "items": [
    {
      "type": "event",
      "score": 87.3,
      "payload": { ... },
      "context": {
        "because": ["2 friends going", "matches indie rock"]
      }
    },
    {
      "type": "review",
      "score": 81.2,
      "payload": { ... },
      "context": {
        "author": "Friend of a friend",
        "event": "Phoebe Bridgers @ Red Rocks"
      }
    }
  ],
  "has_more": true
}
```

## Usage

### TypeScript Service

```typescript
import { PersonalizedFeedService } from '@/services/personalizedFeedService';

// Fetch unified feed
const feed = await PersonalizedFeedService.getPersonalizedFeedV3(
  userId,
  50,  // limit
  0,   // offset
  {
    city: 'Denver',
    radiusMiles: 50,
    // Note: genres, dateRange, etc. are handled via scoring, not filtering
  }
);

// Process feed items
feed.items.forEach(item => {
  switch (item.type) {
    case 'event':
      // Handle event card
      const eventData = item.payload;
      break;
    case 'review':
      // Handle review card
      const reviewData = item.payload;
      break;
    case 'friend_suggestion':
      // Handle friend suggestion rail
      const users = item.payload.users;
      break;
    case 'group_chat':
      // Handle group chat suggestion
      const chatData = item.payload;
      break;
  }
});
```

### Migration

The migration file is located at:
```
supabase/migrations/20250325000000_create_personalized_feed_v3.sql
```

Apply it using your standard migration process.

## Migration Strategy

1. ✅ Keep `get_personalized_feed_v2` live (backwards compatibility)
2. ✅ Build v3 behind a feature flag
3. ✅ Roll out to:
   - Internal team
   - Power users
4. ⏳ Remove Home / Discover split once engagement validates

## Benefits

This architecture aligns with Synth's goals:

- **Letterboxd for live music** → Reviews are first-class content
- **Never go alone again** → Friend + group chat discovery embedded
- **Social-first, not marketplace-first**
- **Scales beyond events** → Can add merch, photos, setlists later

## Performance Considerations

- Social graph is computed once per request (CTE)
- Candidate pools are generated in parallel
- Scoring is normalized for fair blending
- Blending rules prevent content type clustering

## Future Enhancements

- User activity signals (clicks, saves, skips)
- More sophisticated blending algorithms
- A/B testing framework for weights
- Real-time updates for friend suggestions
- Enhanced group chat matching logic

