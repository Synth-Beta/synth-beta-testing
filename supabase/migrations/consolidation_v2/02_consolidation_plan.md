# Consolidation V2 Plan: 27 Tables → 15 Tables

## Target: Merge 12 supporting tables into 15 core tables

### Current State
- **15 Core Tables**: users, events, artists, venues, relationships, follows, user_relationships, reviews, comments, engagements, interactions, chats, messages, notifications, analytics_daily, user_preferences
- **12 Supporting Tables**: account_permissions, waitlist, admin_actions, event_claims, event_group_members, event_groups, event_photo_comments, event_photos, event_promotions, event_tickets, moderation_flags, monetization_tracking, user_genre_preferences, city_centers

---

## Consolidation Strategy

### 1. **users** table consolidations
**Merge into `users` table (add JSONB metadata columns):**

| Supporting Table | Merge Strategy | Target Column |
|-----------------|----------------|---------------|
| `account_permissions` | Convert to JSONB array in `users.permissions_metadata` | `users.permissions_metadata JSONB` |
| `waitlist` | Add `users.waitlist_signup_at TIMESTAMPTZ` + `users.waitlist_metadata JSONB` | `users.waitlist_metadata JSONB` |
| `admin_actions` | Convert to JSONB array in `users.admin_actions_log JSONB` | `users.admin_actions_log JSONB` |

**New columns needed on `users`:**
- `permissions_metadata JSONB DEFAULT '{}'` - Account permissions data
- `waitlist_signup_at TIMESTAMPTZ` - Waitlist signup timestamp
- `waitlist_metadata JSONB DEFAULT '{}'` - Waitlist data
- `admin_actions_log JSONB DEFAULT '[]'` - Admin action history

---

### 2. **events** table consolidations
**Merge into `events` table (add columns/JSONB metadata):**

| Supporting Table | Merge Strategy | Target Column |
|-----------------|----------------|---------------|
| `event_claims` | Add `events.claimed_by_user_id UUID` + `events.claim_metadata JSONB` | `events.claim_metadata JSONB` |
| `event_groups` | Convert to JSONB in `events.group_metadata JSONB` | `events.group_metadata JSONB` |
| `event_photos` | Merge into existing `events.media_urls TEXT[]` if exists, else add | `events.media_urls TEXT[]` |
| `event_promotions` | Merge into `events.promotion_metadata JSONB` | `events.promotion_metadata JSONB` |
| `event_tickets` | Merge into existing ticket columns or `events.ticket_metadata JSONB` | `events.ticket_metadata JSONB` |

**New columns needed on `events`:**
- `claim_metadata JSONB DEFAULT '{}'` - Event claim data
- `group_metadata JSONB DEFAULT '{}'` - Event group data
- `promotion_metadata JSONB DEFAULT '{}'` - Promotion data
- `ticket_metadata JSONB DEFAULT '{}'` - Enhanced ticket data

---

### 3. **relationships** table consolidations
**Merge into `relationships` table:**

| Supporting Table | Merge Strategy |
|-----------------|----------------|
| `event_group_members` | Convert to `relationships` with `relationship_type = 'event_group_member'` and `related_entity_type = 'event_group'` |

**Strategy:** Add rows to `relationships` table with appropriate type/entity mapping.

---

### 4. **comments** table consolidations
**Already handled:**
- `event_photo_comments` - Should already be in `comments` table with `entity_type = 'event_photo'`

---

### 5. **user_preferences** table consolidations
**Merge into `user_preferences` table:**

| Supporting Table | Merge Strategy | Target Column |
|-----------------|----------------|---------------|
| `user_genre_preferences` | Merge into `user_preferences.genre_preferences JSONB` | `user_preferences.genre_preferences JSONB` |

**New column needed on `user_preferences`:**
- Ensure `genre_preferences JSONB DEFAULT '{}'` exists (may already exist)

---

### 6. **reviews** and **comments** tables consolidation
**Merge into `reviews` and `comments` metadata:**

| Supporting Table | Merge Strategy | Target Column |
|-----------------|----------------|---------------|
| `moderation_flags` | Add to `reviews.moderation_metadata JSONB` or `comments.moderation_metadata JSONB` | `reviews.moderation_metadata JSONB`, `comments.moderation_metadata JSONB` |

**New columns needed:**
- `reviews.moderation_metadata JSONB DEFAULT '{}'`
- `comments.moderation_metadata JSONB DEFAULT '{}'`

---

### 7. **monetization_tracking** table consolidation
**Options:**
- **Option A**: Merge into `events` as `events.monetization_metadata JSONB`
- **Option B**: Merge into `users` as `users.monetization_metadata JSONB`
- **Option C**: Keep as separate table (if heavily used)

**Recommended: Option A** - Merge into `events` table since most monetization is event-related.

---

### 8. **city_centers** table consolidation
**Options:**
- **Option A**: Merge into `venues` table as `venues.city_metadata JSONB`
- **Option B**: Keep as separate table (if referenced frequently by multiple tables)

**Recommended: Option B** - Keep separate if used for location search features, but can merge into `venues` if only venue-related.

---

## Execution Order

1. **Phase 1: Add metadata columns** to core tables
2. **Phase 2: Migrate data** from supporting tables to core tables
3. **Phase 3: Verify migrations** - ensure no data loss
4. **Phase 4: Drop supporting tables**
5. **Phase 5: Final verification** - confirm exactly 15 tables remain

---

## Files to Create

1. `02_add_metadata_columns.sql` - Add all JSONB metadata columns to core tables
2. `03_migrate_users_tables.sql` - Migrate account_permissions, waitlist, admin_actions → users
3. `04_migrate_events_tables.sql` - Migrate event_claims, event_groups, event_photos, event_promotions, event_tickets → events
4. `05_migrate_relationships_tables.sql` - Migrate event_group_members → relationships
5. `06_migrate_preferences_tables.sql` - Migrate user_genre_preferences → user_preferences
6. `07_migrate_moderation_tables.sql` - Migrate moderation_flags → reviews/comments
7. `08_migrate_monetization_tables.sql` - Migrate monetization_tracking → events
9. `09_migrate_venues_tables.sql` - Optionally migrate city_centers → venues (or keep separate)
10. `10_verify_migrations.sql` - Verify all data migrated
11. `11_drop_supporting_tables.sql` - Drop all supporting tables
12. `12_final_verification.sql` - Confirm exactly 15 tables remain

