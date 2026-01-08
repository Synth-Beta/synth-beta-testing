# Interaction Logging Guide

Complete guide for logging user interactions in the `interactions` table.

## Overview

The interaction logging system automatically tracks:
- ✅ Feed interactions (all feed types)
- ✅ Discover page (all sections)
- ✅ Passport page
- ✅ Profile views/clicks
- ✅ Search bar usage
- ✅ Review posts (automatic via trigger)
- ✅ Likes (automatic via trigger)
- ✅ Comments (automatic via trigger)

## Functions Created

### 1. Generic Logging Function
```sql
SELECT log_interaction(
  'click',           -- event_type: 'click', 'view', 'search', 'like', 'comment', 'post_review'
  'feed',            -- entity_type: 'feed', 'discover', 'profile', 'passport', 'search_bar', etc.
  'home:event123',   -- entity_id: optional identifier
  'uuid-here'        -- entity_uuid: optional UUID reference
);
```

### 2. Feed Interactions
```sql
-- Log feed click
SELECT log_feed_interaction('home', 'click', 'event123', event_uuid);

-- Log feed view
SELECT log_feed_interaction('discover', 'view');

-- Feed types: 'home', 'discover', 'events', 'friends', 'trending', 'nearby', 'for_you', 'following'
```

### 3. Discover Page
```sql
-- Log discover section view
SELECT log_discover_interaction('trending', 'view');

-- Log discover section click
SELECT log_discover_interaction('nearby', 'click', 'event456', event_uuid);

-- Sections: 'trending', 'nearby', 'genres', 'artists', 'venues', 'scenes', 'map', 'filters', 'search'
```

### 4. Search Bar
```sql
-- Log search
SELECT log_search_interaction(
  'events',              -- search_type
  'dead and company',    -- query
  15,                    -- result_count
  event_uuid             -- entity_uuid (optional)
);

-- Search types: 'events', 'artists', 'venues', 'users', 'global', 'discover', 'home'
```

### 5. Profile Interactions
```sql
-- Log profile view
SELECT log_profile_interaction(profile_user_uuid, 'view');

-- Log profile click
SELECT log_profile_interaction(profile_user_uuid, 'click', 'follow_button');

-- Actions: 'view', 'click', 'follow', 'message', 'share'
```

### 6. Passport Page
```sql
-- Log passport view
SELECT log_passport_interaction('view');

-- Log passport action
SELECT log_passport_interaction('add_event', 'events', event_uuid);

-- Actions: 'view', 'click', 'edit', 'add_event', 'add_venue', 'view_stats'
```

## Automatic Logging (Triggers)

These interactions are logged automatically - no code needed!

### ✅ Review Posts
- **Trigger**: `trigger_log_review_posted`
- **Fires**: When a review is inserted into `reviews` table
- **Logged as**: `event_type='post_review'`, `entity_type='review'`

### ✅ Likes
- **Trigger**: `trigger_log_like_interaction`
- **Fires**: When a like is inserted into `engagements` table
- **Logged as**: `event_type='like'`, `entity_type=<entity_type>`

### ✅ Comments
- **Trigger**: `trigger_log_comment_interaction`
- **Fires**: When a comment is inserted into `comments` table
- **Logged as**: `event_type='comment'`, `entity_type=<entity_type>`

## Frontend Usage (TypeScript)

### Setup
```typescript
import { supabase } from '@/integrations/supabase/client';

// Helper function
async function logInteraction(
  eventType: string,
  entityType: string,
  entityId?: string,
  entityUuid?: string
) {
  try {
    await supabase.rpc('log_interaction', {
      p_event_type: eventType,
      p_entity_type: entityType,
      p_entity_id: entityId || null,
      p_entity_uuid: entityUuid || null,
      p_session_id: null // Can use session ID from auth
    });
  } catch (error) {
    console.error('Error logging interaction:', error);
    // Don't fail app if logging fails
  }
}
```

### Feed Interactions
```typescript
// When user clicks on home feed
await supabase.rpc('log_feed_interaction', {
  p_feed_type: 'home',
  p_event_type: 'click',
  p_entity_id: 'event123',
  p_entity_uuid: eventId
});

// When user views discover feed
await supabase.rpc('log_feed_interaction', {
  p_feed_type: 'discover',
  p_event_type: 'view'
});
```

### Discover Page
```typescript
// When user views trending section
await supabase.rpc('log_discover_interaction', {
  p_section: 'trending',
  p_action: 'view'
});

// When user clicks on nearby event
await supabase.rpc('log_discover_interaction', {
  p_section: 'nearby',
  p_action: 'click',
  p_entity_id: 'event456',
  p_entity_uuid: eventId
});
```

### Search Bar
```typescript
// When user searches
await supabase.rpc('log_search_interaction', {
  p_search_type: 'events',
  p_query: searchQuery,
  p_result_count: results.length,
  p_entity_uuid: null
});
```

### Profile
```typescript
// When user views profile
await supabase.rpc('log_profile_interaction', {
  p_profile_user_id: profileUserId,
  p_action: 'view'
});

// When user clicks follow
await supabase.rpc('log_profile_interaction', {
  p_profile_user_id: profileUserId,
  p_action: 'click',
  p_section: 'follow_button'
});
```

### Passport
```typescript
// When user views passport
await supabase.rpc('log_passport_interaction', {
  p_action: 'view'
});

// When user adds event
await supabase.rpc('log_passport_interaction', {
  p_action: 'add_event',
  p_section: 'events',
  p_entity_uuid: eventId
});
```

## Insight Views (Pre-built Queries)

### Feed Usage Summary
```sql
SELECT * FROM v_feed_interaction_summary
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY interaction_count DESC;
```

### Search Usage
```sql
SELECT * FROM v_search_usage_summary
WHERE date >= CURRENT_DATE - INTERVAL '30 days';
```

### Content Activity (Reviews/Likes/Comments)
```sql
SELECT * FROM v_content_activity_summary
WHERE date >= CURRENT_DATE - INTERVAL '7 days';
```

### Discover Page Usage
```sql
SELECT * FROM v_discover_usage_summary
WHERE date >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY interaction_count DESC;
```

### Profile Interactions
```sql
SELECT * FROM v_profile_interaction_summary
WHERE profile_user_id = 'user-uuid-here'
ORDER BY date DESC;
```

## Custom Queries Examples

### Most Popular Feed Types
```sql
SELECT 
  SPLIT_PART(entity_id, ':', 1) AS feed_type,
  COUNT(*) AS total_clicks,
  COUNT(DISTINCT user_id) AS unique_users
FROM interactions
WHERE entity_type = 'feed' 
  AND event_type = 'click'
  AND occurred_at >= NOW() - INTERVAL '30 days'
GROUP BY SPLIT_PART(entity_id, ':', 1)
ORDER BY total_clicks DESC;
```

### Search Bar Usage by Type
```sql
SELECT 
  SPLIT_PART(entity_id, ':', 1) AS search_type,
  COUNT(*) AS search_count,
  COUNT(DISTINCT user_id) AS unique_searchers,
  AVG(SPLIT_PART(entity_id, ':results=', 2)::INTEGER) AS avg_results
FROM interactions
WHERE entity_type = 'search_bar'
  AND occurred_at >= NOW() - INTERVAL '30 days'
GROUP BY SPLIT_PART(entity_id, ':', 1)
ORDER BY search_count DESC;
```

### Review Posting Activity
```sql
SELECT 
  DATE_TRUNC('day', occurred_at) AS date,
  COUNT(*) AS reviews_posted,
  COUNT(DISTINCT user_id) AS unique_reviewers
FROM interactions
WHERE event_type = 'post_review'
GROUP BY DATE_TRUNC('day', occurred_at)
ORDER BY date DESC
LIMIT 30;
```

### Most Interacted With Profiles
```sql
SELECT 
  entity_uuid AS profile_user_id,
  COUNT(*) AS total_interactions,
  COUNT(DISTINCT user_id) AS unique_visitors,
  COUNT(CASE WHEN event_type = 'view' THEN 1 END) AS views,
  COUNT(CASE WHEN event_type = 'click' THEN 1 END) AS clicks
FROM interactions
WHERE entity_type = 'profile'
  AND occurred_at >= NOW() - INTERVAL '30 days'
GROUP BY entity_uuid
ORDER BY total_interactions DESC
LIMIT 20;
```

## Best Practices

1. **Don't fail on logging errors** - Logging should be non-blocking
2. **Use helper functions** - They validate input and format data correctly
3. **Log important interactions** - Clicks, views, searches are most valuable
4. **Use session IDs** - Track user journeys (optional but recommended)
5. **Don't log sensitive data** - No passwords, tokens, etc. in entity_id
6. **Monitor view performance** - The insight views are pre-aggregated for speed

## Performance Notes

- All functions are `SECURITY DEFINER` for performance
- Triggers use `ON CONFLICT DO NOTHING` to prevent duplicates
- Triggers won't fail parent operations if logging fails
- Views are pre-aggregated for fast queries
- Indexes are optimized for common query patterns

