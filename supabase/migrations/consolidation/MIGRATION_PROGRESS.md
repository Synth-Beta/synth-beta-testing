# Database Consolidation Migration Progress

## Overview
This document tracks the progress of the database consolidation migration, which involves:
1. Creating consolidated tables with `_new` suffix
2. Migrating data from old tables to new tables
3. Updating database functions, views, and triggers
4. Updating TypeScript service files
5. Renaming tables from `_new` to final names
6. Dropping old tables

## Completed Steps

### 1. Database Schema Creation ✅
- [x] `03_create_consolidated_tables.sql` - Created all consolidated tables with `_new` suffix
- [x] All tables created with proper columns, indexes, and RLS policies

### 2. Data Migration ✅
- [x] `04_migrate_core_entities.sql` - Migrated profiles → users_new, jambase_events → events_new, artists/artist_profile → artists_new, venues/venue_profile → venues_new
- [x] `05_migrate_relationships.sql` - Migrated all relationship tables to relationships_new
- [x] `06_migrate_content.sql` - Migrated user_reviews → reviews_new, event_comments/review_comments → comments_new, engagement tables → engagements_new
- [x] `07_migrate_analytics.sql` - Migrated all analytics tables to analytics_daily_new
- [x] `08_migrate_preferences.sql` - Migrated all preference tables to user_preferences_new

### 3. Database Functions, Views, Triggers ✅
- [x] `09_identify_functions_views_triggers.sql` - Identified all functions, views, and triggers that need updates
- [x] `14_update_functions.sql` - Updated all database functions to reference `_new` tables
- [x] `15_update_views.sql` - Updated all database views to reference `_new` tables
- [x] `16_update_triggers.sql` - Updated all database triggers to reference `_new` tables
- [x] `10_update_rls_policies.sql` - Updated RLS policies for new consolidated tables

### 4. TypeScript Service Updates (In Progress)
- [x] `supabaseService.ts` - ✅ Completed (updated to use final table names: users, events, relationships, engagements, etc.)
- [x] `adminService.ts` - ✅ Completed (updated profiles → users)
- [x] `reviewService.ts` - ✅ Completed (updated user_reviews → reviews, review_likes → engagements, review_comments → comments, review_shares → engagements)
- [x] `userEventService.ts` - ✅ Partially completed (updated user_jambase_events → relationships, user_reviews → reviews, but queries need fixes for column names)

### Remaining TypeScript Service Updates
- [ ] `adminAnalyticsService.ts` (42 references) - High priority
- [ ] `jambaseService.ts` (20 references) - High priority
- [ ] `matchingService.ts` (16 references) - High priority
- [ ] `userAnalyticsService.ts` (18 references) - High priority
- [ ] `friendsReviewService.ts` (7 references) - Medium priority
- [ ] `unifiedFeedService.ts` (6 references) - Medium priority
- [ ] `networkAnalyticsService.ts` (6 references) - Medium priority
- [ ] `verificationService.ts` (12 references) - Medium priority
- [ ] `eventManagementService.ts` (8 references) - Medium priority
- [ ] `creatorAnalyticsService.ts` (8 references) - Medium priority
- [ ] `analyticsDataService.ts` (4 references) - Medium priority
- [ ] 31 more files with fewer references - Low priority

**Total: 42 files, ~290 references remaining**

### 5. Type Definitions (Pending)
- [ ] Update `src/types/database.ts` to match new consolidated tables
- [ ] Update type exports in service files
- [ ] Regenerate types from Supabase after migration

### 6. Table Renaming (Pending)
- [ ] `11_rename_tables_final.sql` - Rename all `_new` tables to final names
  - **NOTE:** This should be run AFTER all TypeScript services are updated
  - This script also updates functions, views, and triggers to use final names

### 7. Cleanup (Pending)
- [ ] `12_drop_old_tables.sql` - Drop all old, unconsolidated tables
  - **NOTE:** This should be run AFTER verification that all data is migrated correctly

### 8. Verification (Pending)
- [ ] `13_verification_queries.sql` - Run verification queries to ensure all data migrated correctly
- [ ] Test all TypeScript services
- [ ] Test all database functions
- [ ] Test all database views
- [ ] Test all database triggers
- [ ] End-to-end testing of all features

## Migration Patterns

### Table Name Mappings
- `profiles` → `users`
- `jambase_events` → `events`
- `user_reviews` → `reviews`
- `user_jambase_events` → `relationships` (related_entity_type='event', relationship_type='interest'|'going'|'maybe')
- `friends` → `relationships` (related_entity_type='user', relationship_type='friend')
- `matches` → `relationships` (related_entity_type='user', relationship_type='match')
- `user_swipes` → `engagements` (entity_type='user', engagement_type='swipe')
- `review_likes` → `engagements` (entity_type='review', engagement_type='like')
- `review_comments` → `comments` (entity_type='review')
- `event_comments` → `comments` (entity_type='event')
- `user_interactions` → `interactions`
- `artist_follows` → `relationships` (related_entity_type='artist', relationship_type='follow')
- `venue_follows` → `relationships` (related_entity_type='venue', relationship_type='follow')

### Query Pattern Updates

#### Simple Table References
```typescript
// Before
.from('profiles')
.from('jambase_events')
.from('user_reviews')

// After
.from('users')
.from('events')
.from('reviews')
```

#### Relationship Queries
```typescript
// Before (user_jambase_events)
.from('user_jambase_events')
  .eq('user_id', userId)
  .eq('jambase_event_id', eventId)

// After
.from('relationships')
  .eq('user_id', userId)
  .eq('related_entity_type', 'event')
  .eq('related_entity_id', eventId)
  .in('relationship_type', ['interest', 'going', 'maybe'])
```

#### Engagement Queries
```typescript
// Before (review_likes)
.from('review_likes')
  .eq('user_id', userId)
  .eq('review_id', reviewId)

// After
.from('engagements')
  .eq('user_id', userId)
  .eq('entity_type', 'review')
  .eq('entity_id', reviewId)
  .eq('engagement_type', 'like')
```

#### Insert Patterns
```typescript
// Before (user_jambase_events insert)
.insert({
  user_id: userId,
  jambase_event_id: eventId
})

// After
.insert({
  user_id: userId,
  related_entity_type: 'event',
  related_entity_id: eventId,
  relationship_type: 'interest',
  status: 'accepted',
  metadata: { event_id: eventId }
})
```

## Important Notes

1. **Column Name Changes**: Some queries may need additional fixes beyond table name changes:
   - `jambase_event_id` → `related_entity_id` (for relationships table)
   - `review_id` → `entity_id` (for engagements/comments tables)
   - `artist_id` → `related_entity_id` (for relationships table)
   - `venue_name` + `venue_city` + `venue_state` → `related_entity_id` (for relationships table, stored in metadata)

2. **Foreign Key References**: Foreign key references in SELECT queries need to be updated:
   - `profiles:profiles(...)` → `users:users(...)`
   - `jambase_events:jambase_events(...)` → `events:events(...)`

3. **Query Filters**: Some queries need additional filters:
   - Relationships table: Always filter by `related_entity_type` and `relationship_type`
   - Engagements table: Always filter by `entity_type` and `engagement_type`
   - Comments table: Always filter by `entity_type`

4. **Metadata Fields**: Some information is now stored in metadata JSONB fields:
   - Event ID in matches: `metadata.event_id`
   - Venue information in venue follows: `metadata.venue_name`, `metadata.venue_city`, `metadata.venue_state`
   - RSVP status in event interests: `metadata.rsvp_status`

## Next Steps

1. **Continue Updating TypeScript Services**
   - Focus on high-priority services first (adminAnalyticsService.ts, jambaseService.ts, matchingService.ts, userAnalyticsService.ts)
   - Use the migration patterns documented above
   - Fix queries to use correct column names and filters

2. **Update Type Definitions**
   - Update `src/types/database.ts` to match new consolidated tables
   - Regenerate types from Supabase after migration

3. **Run Table Rename Script**
   - Run `11_rename_tables_final.sql` after all TypeScript services are updated
   - This will rename all `_new` tables to final names
   - This will also update functions, views, and triggers to use final names

4. **Run Verification Queries**
   - Run `13_verification_queries.sql` to verify all data migrated correctly
   - Test all services end-to-end
   - Fix any remaining issues

5. **Drop Old Tables**
   - Run `12_drop_old_tables.sql` after verification is complete
   - This will drop all old, unconsolidated tables

## Testing Checklist

- [ ] All TypeScript services compile without errors
- [ ] All database queries work correctly
- [ ] Foreign key relationships resolve properly
- [ ] Insert operations work with new schema
- [ ] Update operations work with new schema
- [ ] Delete operations work with new schema
- [ ] Complex queries (joins, filters) work correctly
- [ ] RLS policies work correctly
- [ ] All features tested end-to-end
- [ ] Performance is acceptable
- [ ] No data loss during migration

## Migration Scripts Order

1. `03_create_consolidated_tables.sql` ✅
2. `04_migrate_core_entities.sql` ✅
3. `05_migrate_relationships.sql` ✅
4. `06_migrate_content.sql` ✅
5. `07_migrate_analytics.sql` ✅
6. `08_migrate_preferences.sql` ✅
7. `14_update_functions.sql` ✅
8. `15_update_views.sql` ✅
9. `16_update_triggers.sql` ✅
10. `10_update_rls_policies.sql` ✅
11. Update TypeScript services (In Progress)
12. Update type definitions (Pending)
13. `11_rename_tables_final.sql` (Pending)
14. `13_verification_queries.sql` (Pending)
15. `12_drop_old_tables.sql` (Pending)

## Estimated Remaining Work

- **TypeScript Services**: ~38 files remaining, ~250 references
- **Type Definitions**: 1 file
- **Database Rename**: 1 script
- **Verification**: 1 script + testing
- **Cleanup**: 1 script

**Estimated Time**: 4-6 hours for remaining TypeScript service updates + 2-3 hours for testing and verification

