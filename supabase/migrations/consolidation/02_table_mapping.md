# Database Consolidation: Table Mapping Document

## Overview
This document maps existing tables to the new consolidated 15-table schema.

## Consolidation Strategy

### 1. users (from profiles)
**Source Tables:**
- `profiles` → `users` (rename, keep all columns)

**Columns to keep:**
- All existing columns from `profiles`
- No additional columns needed (already complete)

**Migration:**
- Simple rename operation
- Preserve all data

---

### 2. events (from jambase_events)
**Source Tables:**
- `jambase_events` → `events` (rename, add promotion fields)

**Columns to add:**
- `promoted` (BOOLEAN)
- `promotion_start_date` (TIMESTAMPTZ)
- `promotion_end_date` (TIMESTAMPTZ)
- `created_by_user_id` (UUID, FK → users)

**Migration:**
- Rename `jambase_events` → `events`
- Add promotion columns (nullable, default false)
- Migrate promotion data from `event_promotions` table if it exists

---

### 3. artists (merge artists + artist_profile)
**Source Tables:**
- `artists` (base table)
- `artist_profile` (enhanced profile data)

**Strategy:**
- Use `artist_profile` as base (more complete)
- Merge missing columns from `artists` if any
- Add `owner_user_id` from artist ownership tracking
- Add `verified` and `claimed_at` fields

**Columns:**
- All columns from `artist_profile`
- Add `owner_user_id` (UUID, FK → users, nullable)
- Add `verified` (BOOLEAN, default false)
- Add `claimed_at` (TIMESTAMPTZ, nullable)

**Migration:**
- Start with `artist_profile` data
- Merge any unique data from `artists` (deduplicate by jambase_artist_id)
- Set ownership from artist ownership tracking

---

### 4. venues (merge venues + venue_profile)
**Source Tables:**
- `venues` (base table)
- `venue_profile` (enhanced profile data)

**Strategy:**
- Use `venue_profile` as base (more complete)
- Merge missing columns from `venues` if any
- Add `owner_user_id` from venue ownership tracking
- Add `verified` and `claimed_at` fields

**Columns:**
- All columns from `venue_profile`
- Add `owner_user_id` (UUID, FK → users, nullable)
- Add `verified` (BOOLEAN, default false)
- Add `claimed_at` (TIMESTAMPTZ, nullable)

**Migration:**
- Start with `venue_profile` data
- Merge any unique data from `venues` (deduplicate by jambase_venue_id or name)
- Set ownership from venue ownership tracking

---

### 5. relationships (NEW - unified relationship table)
**Source Tables:**
- `artist_follows` → `relationships` (relationship_type='follow', related_entity_type='artist')
- `venue_follows` → `relationships` (relationship_type='follow', related_entity_type='venue')
- `user_jambase_events` → `relationships` (relationship_type='interest', related_entity_type='event')
- `friends` → `relationships` (relationship_type='friend', bidirectional - create 2 rows)
- `friend_requests` → `relationships` (relationship_type='friend', status='pending')
- `matches` → `relationships` (relationship_type='match', metadata with event_id)
- `user_blocks` → `relationships` (relationship_type='block')

**Table Structure:**
```sql
relationships (
  id UUID PK,
  user_id UUID FK → users,
  related_entity_type TEXT, -- 'user', 'artist', 'venue', 'event'
  related_entity_id UUID/TEXT,
  relationship_type TEXT, -- 'follow', 'interest', 'friend', 'match', 'block', 'going', 'maybe'
  status TEXT, -- 'pending', 'accepted', 'declined' (for friend requests)
  metadata JSONB, -- event_id for matches, rsvp_status, etc.
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(user_id, related_entity_type, related_entity_id, relationship_type)
)
```

**Migration Rules:**
- `artist_follows`: user_id, 'artist', artist_id, 'follow'
- `venue_follows`: user_id, 'venue', venue_name+city+state, 'follow' (store in metadata)
- `user_jambase_events`: user_id, 'event', event_id, 'interest' (or 'going', 'maybe' based on rsvp_status)
- `friends`: Create 2 rows - (user1_id, 'user', user2_id, 'friend') and (user2_id, 'user', user1_id, 'friend')
- `friend_requests`: user_id, 'user', receiver_id, 'friend', status='pending'
- `matches`: user1_id, 'user', user2_id, 'match', metadata={event_id}
- `user_blocks`: user_id, 'user', blocked_user_id, 'block'

---

### 6. reviews (from user_reviews)
**Source Tables:**
- `user_reviews` → `reviews` (rename, add artist_id/venue_id)

**Columns to add:**
- `artist_id` (UUID, FK → artists, nullable)
- `venue_id` (UUID, FK → venues, nullable)

**Migration:**
- Rename `user_reviews` → `reviews`
- Join with events to get artist_id and venue_id
- Populate artist_id and venue_id from event data

---

### 7. comments (NEW - unified comments table)
**Source Tables:**
- `event_comments` → `comments` (entity_type='event')
- `review_comments` → `comments` (entity_type='review')

**Table Structure:**
```sql
comments (
  id UUID PK,
  user_id UUID FK → users,
  entity_type TEXT, -- 'review', 'event', 'artist', 'venue'
  entity_id UUID,
  parent_comment_id UUID FK → comments,
  comment_text TEXT,
  likes_count INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

**Migration:**
- `event_comments`: user_id, 'event', event_id, comment_text, parent_comment_id
- `review_comments`: user_id, 'review', review_id, comment_text, parent_comment_id
- Preserve all parent_comment_id relationships

---

### 8. engagements (NEW - unified engagements table)
**Source Tables:**
- `event_likes` → `engagements` (entity_type='event', engagement_type='like')
- `review_likes` → `engagements` (entity_type='review', engagement_type='like')
- `comment_likes` → `engagements` (entity_type='comment', engagement_type='like')
- `review_shares` → `engagements` (entity_type='review', engagement_type='share')
- `user_swipes` → `engagements` (entity_type='user', engagement_type='swipe', engagement_value='left'/'right')

**Table Structure:**
```sql
engagements (
  id UUID PK,
  user_id UUID FK → users,
  entity_type TEXT, -- 'review', 'event', 'comment', 'user'
  entity_id UUID,
  engagement_type TEXT, -- 'like', 'share', 'swipe'
  engagement_value TEXT, -- 'left', 'right' for swipes; platform for shares
  metadata JSONB,
  created_at TIMESTAMPTZ,
  UNIQUE(user_id, entity_type, entity_id, engagement_type)
)
```

**Migration:**
- `event_likes`: user_id, 'event', event_id, 'like'
- `review_likes`: user_id, 'review', review_id, 'like'
- `comment_likes`: user_id, 'comment', comment_id, 'like'
- `review_shares`: user_id, 'review', review_id, 'share', engagement_value=share_platform
- `user_swipes`: user_id, 'user', swiped_user_id, 'swipe', engagement_value='left'/'right', metadata={event_id}

---

### 9. chats (KEEP - no changes)
**Source Tables:**
- `chats` → `chats` (keep as-is)

**No changes needed**

---

### 10. messages (KEEP - no changes)
**Source Tables:**
- `messages` → `messages` (keep as-is)

**No changes needed**

---

### 11. notifications (KEEP - no changes)
**Source Tables:**
- `notifications` → `notifications` (keep as-is)

**No changes needed**

---

### 12. interactions (KEEP - already unified)
**Source Tables:**
- `user_interactions` → `interactions` (rename only)

**Migration:**
- Simple rename operation
- Already properly normalized

---

### 13. analytics_daily (NEW - unified analytics table)
**Source Tables:**
- `analytics_user_daily` → `analytics_daily` (entity_type='user')
- `analytics_event_daily` → `analytics_daily` (entity_type='event')
- `analytics_artist_daily` → `analytics_daily` (entity_type='artist')
- `analytics_venue_daily` → `analytics_daily` (entity_type='venue')
- `analytics_campaign_daily` → `analytics_daily` (entity_type='campaign')

**Table Structure:**
```sql
analytics_daily (
  id UUID PK,
  entity_type TEXT, -- 'user', 'event', 'artist', 'venue', 'campaign'
  entity_id TEXT, -- UUID or name depending on entity_type
  date DATE,
  metrics JSONB, -- Flexible metrics object
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  UNIQUE(entity_type, entity_id, date)
)
```

**Migration:**
- Convert all columns from each analytics_*_daily table to JSONB metrics object
- Preserve all historical data
- Example: analytics_user_daily.events_viewed → metrics.events_viewed

---

### 14. user_preferences (NEW - unified preferences table)
**Source Tables:**
- `streaming_profiles` → `user_preferences.streaming_stats` (JSONB)
- `user_streaming_stats_summary` → `user_preferences.streaming_stats` (merge)
- `user_music_taste` → `user_preferences.preferred_genres/artists` (extract)
- `music_preference_signals` → `user_preferences.music_preference_signals` (JSONB)
- `user_recommendations_cache` → `user_preferences.recommendation_cache` (JSONB)
- Calculate achievements → `user_preferences.achievements` (JSONB)

**Table Structure:**
```sql
user_preferences (
  id UUID PK,
  user_id UUID FK → users UNIQUE,
  preferred_genres TEXT[],
  preferred_artists UUID[],
  preferred_venues TEXT[],
  notification_preferences JSONB,
  email_preferences JSONB,
  privacy_settings JSONB,
  streaming_stats JSONB, -- {spotify: {...}, apple_music: {...}}
  achievements JSONB, -- {unlocked: [...], in_progress: [...]}
  music_preference_signals JSONB, -- Aggregated preference scores
  recommendation_cache JSONB, -- Cached user recommendations
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
```

**Migration:**
- Create one row per user
- Merge all streaming data into streaming_stats JSONB
- Extract genres/artists from user_music_taste
- Convert music_preference_signals to JSONB array
- Convert user_recommendations_cache to JSONB array
- Calculate achievements from user data

---

### 15. account_permissions (KEEP - no changes)
**Source Tables:**
- `account_permissions` → `account_permissions` (keep as-is)

**No changes needed**

---

## Tables to DROP (after migration verification)

### Consolidated Tables:
- `artist_profile` (merged into `artists`)
- `venue_profile` (merged into `venues`)
- `artist_follows` (migrated to `relationships`)
- `venue_follows` (migrated to `relationships`)
- `user_jambase_events` (migrated to `relationships`)
- `event_likes` (migrated to `engagements`)
- `review_likes` (migrated to `engagements`)
- `comment_likes` (migrated to `engagements`)
- `review_shares` (migrated to `engagements`)
- `event_comments` (migrated to `comments`)
- `review_comments` (migrated to `comments`)
- `analytics_user_daily` (migrated to `analytics_daily`)
- `analytics_event_daily` (migrated to `analytics_daily`)
- `analytics_artist_daily` (migrated to `analytics_daily`)
- `analytics_venue_daily` (migrated to `analytics_daily`)
- `analytics_campaign_daily` (migrated to `analytics_daily`)
- `streaming_profiles` (migrated to `user_preferences`)
- `user_streaming_stats_summary` (migrated to `user_preferences`)
- `user_music_taste` (migrated to `user_preferences`)
- `music_preference_signals` (migrated to `user_preferences`)
- `user_recommendations_cache` (migrated to `user_preferences`)

### Legacy Tables:
- `events` (old table, replaced by `jambase_events` → `events`)
- `user_artists` (legacy, replaced by `artist_follows` → `relationships`)
- `user_venues` (legacy, replaced by `venue_follows` → `relationships`)
- `user_events` (legacy, replaced by `user_jambase_events` → `relationships`)

### Renamed Tables:
- `profiles` → `users` (rename)
- `jambase_events` → `events` (rename)
- `user_reviews` → `reviews` (rename)
- `user_interactions` → `interactions` (rename)

---

## Data Integrity Rules

### 3NF Compliance:
- No transitive dependencies
- All relationships normalized
- No duplicate data sources
- No overlapping collection between tables

### Unique Constraints:
- `relationships`: UNIQUE(user_id, related_entity_type, related_entity_id, relationship_type)
- `engagements`: UNIQUE(user_id, entity_type, entity_id, engagement_type)
- `analytics_daily`: UNIQUE(entity_type, entity_id, date)
- `user_preferences`: UNIQUE(user_id)

### Foreign Key Relationships:
- All foreign keys preserved
- All referential integrity maintained
- Cascade deletes where appropriate

---

## Migration Verification Checklist

- [ ] All row counts match between old and new tables
- [ ] No data loss in migration
- [ ] All foreign keys valid
- [ ] All unique constraints satisfied
- [ ] All indexes created
- [ ] All RLS policies updated
- [ ] All functions updated
- [ ] All views updated
- [ ] All triggers updated
- [ ] 3NF compliance verified
- [ ] No duplicate data sources
- [ ] No overlapping collection between tables

