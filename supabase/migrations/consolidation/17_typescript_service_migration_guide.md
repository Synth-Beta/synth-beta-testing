# TypeScript Service Migration Guide

This document provides a comprehensive guide for updating all TypeScript service files to use the new consolidated table names.

## Table Name Mappings

### Core Tables
- `profiles` → `users`
- `jambase_events` → `events`
- `artist_profile` → `artists` (merged with `artists`)
- `venue_profile` → `venues` (merged with `venues`)

### Relationship Tables (Unified)
- `artist_follows` → `relationships` (relationship_type='follow', related_entity_type='artist')
- `venue_follows` → `relationships` (relationship_type='follow', related_entity_type='venue')
- `user_jambase_events` → `relationships` (relationship_type='interest'|'going'|'maybe', related_entity_type='event')
- `friends` → `relationships` (relationship_type='friend', related_entity_type='user')
- `friend_requests` → `relationships` (relationship_type='friend', status='pending', related_entity_type='user')
- `matches` → `relationships` (relationship_type='match', related_entity_type='user')
- `user_blocks` → `relationships` (relationship_type='block', related_entity_type='user')

### Content Tables
- `user_reviews` → `reviews`
- `event_comments` → `comments` (entity_type='event')
- `review_comments` → `comments` (entity_type='review')

### Engagement Tables (Unified)
- `event_likes` → `engagements` (entity_type='event', engagement_type='like')
- `review_likes` → `engagements` (entity_type='review', engagement_type='like')
- `comment_likes` → `engagements` (entity_type='comment', engagement_type='like')
- `review_shares` → `engagements` (entity_type='review', engagement_type='share')
- `user_swipes` → `engagements` (entity_type='user', engagement_type='swipe', engagement_value='left'|'right')

### Analytics Tables
- `user_interactions` → `interactions`
- `analytics_user_daily` → `analytics_daily` (entity_type='user')
- `analytics_event_daily` → `analytics_daily` (entity_type='event')
- `analytics_artist_daily` → `analytics_daily` (entity_type='artist')
- `analytics_venue_daily` → `analytics_daily` (entity_type='venue')
- `analytics_campaign_daily` → `analytics_daily` (entity_type='campaign')

### Preference Tables (Unified)
- `streaming_profiles` → `user_preferences` (streaming_stats JSONB column)
- `user_streaming_stats_summary` → `user_preferences` (streaming_stats JSONB column)
- `user_music_taste` → `user_preferences` (preferred_genres, preferred_artists arrays)
- `music_preference_signals` → `user_preferences` (music_preference_signals JSONB column)
- `user_recommendations_cache` → `user_preferences` (recommendation_cache JSONB column)

## Query Pattern Updates

### 1. Simple Table References

**Before:**
```typescript
.from('profiles')
.from('jambase_events')
.from('user_reviews')
```

**After:**
```typescript
.from('users')
.from('events')
.from('reviews')
```

### 2. Relationship Queries

**Before (artist_follows):**
```typescript
.from('artist_follows')
  .select('*')
  .eq('user_id', userId)
  .eq('artist_id', artistId)
```

**After:**
```typescript
.from('relationships')
  .select('*')
  .eq('user_id', userId)
  .eq('related_entity_type', 'artist')
  .eq('related_entity_id', artistId)
  .eq('relationship_type', 'follow')
```

**Before (user_jambase_events):**
```typescript
.from('user_jambase_events')
  .select('*')
  .eq('user_id', userId)
  .eq('jambase_event_id', eventId)
```

**After:**
```typescript
.from('relationships')
  .select('*')
  .eq('user_id', userId)
  .eq('related_entity_type', 'event')
  .eq('related_entity_id', eventId)
  .in('relationship_type', ['interest', 'going', 'maybe'])
```

**Before (friends):**
```typescript
.from('friends')
  .select('*')
  .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
```

**After:**
```typescript
.from('relationships')
  .select('*')
  .eq('related_entity_type', 'user')
  .eq('relationship_type', 'friend')
  .eq('status', 'accepted')
  .or(`user_id.eq.${userId},related_entity_id.eq.${userId}`)
```

**Before (matches):**
```typescript
.from('matches')
  .select('*')
  .or(`user1_id.eq.${userId},user2_id.eq.${userId}`)
```

**After:**
```typescript
.from('relationships')
  .select('*')
  .eq('related_entity_type', 'user')
  .eq('relationship_type', 'match')
  .or(`user_id.eq.${userId},related_entity_id.eq.${userId}`)
```

### 3. Engagement Queries

**Before (review_likes):**
```typescript
.from('review_likes')
  .select('*')
  .eq('user_id', userId)
  .eq('review_id', reviewId)
```

**After:**
```typescript
.from('engagements')
  .select('*')
  .eq('user_id', userId)
  .eq('entity_type', 'review')
  .eq('entity_id', reviewId)
  .eq('engagement_type', 'like')
```

**Before (user_swipes):**
```typescript
.from('user_swipes')
  .select('*')
  .eq('swiper_user_id', userId)
  .eq('swiped_user_id', swipedUserId)
  .eq('event_id', eventId)
```

**After:**
```typescript
.from('engagements')
  .select('*')
  .eq('user_id', userId)
  .eq('entity_type', 'user')
  .eq('entity_id', swipedUserId)
  .eq('engagement_type', 'swipe')
  .contains('metadata', { event_id: eventId })
```

### 4. Comment Queries

**Before (review_comments):**
```typescript
.from('review_comments')
  .select('*')
  .eq('review_id', reviewId)
```

**After:**
```typescript
.from('comments')
  .select('*')
  .eq('entity_type', 'review')
  .eq('entity_id', reviewId)
```

### 5. Insert/Update Patterns

**Before (user_jambase_events insert):**
```typescript
.insert({
  user_id: userId,
  jambase_event_id: eventId
})
```

**After:**
```typescript
.insert({
  user_id: userId,
  related_entity_type: 'event',
  related_entity_id: eventId,
  relationship_type: 'interest',
  status: 'accepted',
  metadata: { event_id: eventId }
})
```

**Before (review_likes insert):**
```typescript
.insert({
  user_id: userId,
  review_id: reviewId
})
```

**After:**
```typescript
.insert({
  user_id: userId,
  entity_type: 'review',
  entity_id: reviewId,
  engagement_type: 'like'
})
```

### 6. Foreign Key References in SELECT

**Before:**
```typescript
.select(`
  *,
  profiles:profiles(
    user_id,
    name,
    avatar_url
  ),
  jambase_events:jambase_events(
    id,
    title,
    event_date
  )
`)
```

**After:**
```typescript
.select(`
  *,
  users:users(
    user_id,
    name,
    avatar_url
  ),
  events:events(
    id,
    title,
    event_date
  )
`)
```

## Files to Update

### High Priority (Critical Services)
1. `src/services/supabaseService.ts` ✅ (Updated)
2. `src/services/adminService.ts` ✅ (Partially updated)
3. `src/services/reviewService.ts` (27 references)
4. `src/services/userEventService.ts` (17 references)
5. `src/services/jambaseService.ts` (20 references)
6. `src/services/adminAnalyticsService.ts` (42 references)
7. `src/services/matchingService.ts` (16 references)
8. `src/services/userAnalyticsService.ts` (18 references)

### Medium Priority
9. `src/services/friendsReviewService.ts` (7 references)
10. `src/services/unifiedFeedService.ts` (6 references)
11. `src/services/networkAnalyticsService.ts` (6 references)
12. `src/services/verificationService.ts` (12 references)
13. `src/services/eventManagementService.ts` (8 references)
14. `src/services/creatorAnalyticsService.ts` (8 references)
15. `src/services/analyticsDataService.ts` (4 references)

### Low Priority (Less Critical)
- Remaining 27 files with fewer references

## Migration Steps

1. **Update Type Definitions** (`src/types/database.ts`)
   - Update table name references
   - Update type exports

2. **Update Core Services**
   - Update `supabaseService.ts` ✅
   - Update `adminService.ts` ✅
   - Update `reviewService.ts`
   - Update other high-priority services

3. **Update Remaining Services**
   - Use find-and-replace patterns
   - Test each service after update

4. **Update Database Functions/Views/Triggers**
   - Already done in SQL migration scripts
   - Update to reference final table names after renaming

5. **Run Database Rename Script**
   - Run `11_rename_tables_final.sql` after TypeScript services are updated

6. **Verify and Test**
   - Run verification queries
   - Test all services
   - Fix any remaining issues

## Notes

- All foreign key relationships need to be updated in SELECT queries
- Some queries may need logic changes due to schema changes (e.g., relationships table structure)
- Metadata fields are used to store additional information (e.g., event_id in matches)
- Status fields are used for relationship state (e.g., 'pending', 'accepted' for friend requests)
- The `related_entity_id` field is TEXT to accommodate both UUIDs and string identifiers (e.g., venue names)

## Testing Checklist

- [ ] All services compile without errors
- [ ] All database queries work correctly
- [ ] Foreign key relationships resolve properly
- [ ] Insert operations work with new schema
- [ ] Update operations work with new schema
- [ ] Delete operations work with new schema
- [ ] Complex queries (joins, filters) work correctly
- [ ] RLS policies work correctly
- [ ] All features tested end-to-end

