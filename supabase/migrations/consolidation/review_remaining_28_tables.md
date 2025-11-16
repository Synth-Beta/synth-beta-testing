# Review of Remaining 28 Tables

This document lists each of the 28 remaining tables (outside the 18 consolidated tables) with their purpose, structure, and recommended action.

## Table Categories

### 1. Event Supporting Features (Keep - Complex Features)

#### `event_groups`
- **Purpose**: User-created event groups for social planning (e.g., "Coachella 2024 Crew")
- **Structure**: id, event_id, name, description, created_by_user_id, is_public, max_members, member_count, cover_image_url, chat_id, created_at, updated_at
- **Recommendation**: ✅ **KEEP** - Complex social feature, separate table makes sense

#### `event_group_members`
- **Purpose**: Members of event groups with roles
- **Structure**: id, group_id, user_id, role, joined_at, last_active_at
- **Recommendation**: ✅ **KEEP** - Supporting table for event_groups

#### `event_photos`
- **Purpose**: User-uploaded photos from events
- **Structure**: id, event_id, user_id, photo_url, caption, likes_count, comments_count, is_featured, created_at, updated_at
- **Recommendation**: ✅ **KEEP** - Complex feature with likes/comments, separate table makes sense

#### `event_photo_likes`
- **Purpose**: Likes on event photos
- **Structure**: id, photo_id, user_id, created_at
- **Recommendation**: ⚠️ **CONSOLIDATE** - Could merge into `engagements` table (entity_type='event_photo', engagement_type='like')

#### `event_photo_comments`
- **Purpose**: Comments on event photos
- **Structure**: id, photo_id, user_id, comment, created_at, updated_at
- **Recommendation**: ⚠️ **CONSOLIDATE** - Could merge into `comments` table (entity_type='event_photo')

#### `event_tickets`
- **Purpose**: Detailed ticket information (provider, price range, availability windows)
- **Structure**: id, event_id, ticket_provider, ticket_url, ticket_type, price_min, price_max, currency, available_from, available_until, is_primary, created_at, updated_at
- **Recommendation**: ✅ **KEEP** - Complex ticket management feature

#### `event_ticket_urls`
- **Purpose**: Multiple ticket URLs per event
- **Structure**: (Need to check structure)
- **Recommendation**: ⚠️ **REVIEW** - May overlap with `event_tickets` or `events.ticket_urls` JSONB column

#### `event_claims`
- **Purpose**: Event claiming by creators (pending, approved, rejected)
- **Structure**: id, event_id, claimer_user_id, claim_status, claim_reason, verification_proof, reviewed_by_admin_id, reviewed_at, admin_notes, created_at, updated_at
- **Recommendation**: ✅ **KEEP** - Complex workflow, separate table makes sense

#### `event_shares`
- **Purpose**: Track event shares (for analytics)
- **Structure**: id, event_id, shared_by_user_id, shared_with_user_id, chat_id, created_at
- **Recommendation**: ⚠️ **CONSOLIDATE** - Could merge into `interactions` table (interaction_type='share', entity_type='event')

#### `event_interests`
- **Purpose**: User event interests
- **Structure**: (Need to check structure)
- **Recommendation**: 🗑️ **DROP** - Already consolidated into `relationships` table

#### `event_genres`
- **Purpose**: Genre mappings for events
- **Structure**: (Need to check structure)
- **Recommendation**: ⚠️ **REVIEW** - May be redundant if `events.genres` TEXT[] column exists

#### `event_promotions`
- **Purpose**: Event promotion/payment tracking
- **Structure**: (Need to check structure)
- **Recommendation**: ⚠️ **REVIEW** - Already consolidated into `monetization_tracking`? Check if table still exists

---

### 2. Review Supporting Features (May Consolidate)

#### `review_photos`
- **Purpose**: Photos for reviews
- **Structure**: (Need to check structure)
- **Recommendation**: ⚠️ **REVIEW** - `reviews` table already has `photos TEXT[]` column. Check if separate table is needed.

#### `review_videos`
- **Purpose**: Videos for reviews
- **Structure**: (Need to check structure)
- **Recommendation**: ⚠️ **REVIEW** - `reviews` table already has `videos TEXT[]` column. Check if separate table is needed.

#### `review_tags`
- **Purpose**: Tags for reviews
- **Structure**: (Need to check structure)
- **Recommendation**: ⚠️ **REVIEW** - `reviews` table already has various tag columns (`mood_tags`, `genre_tags`, `context_tags`). Check if separate table is needed.

---

### 3. Moderation/Admin (Keep - Complex Features)

#### `moderation_flags`
- **Purpose**: Content moderation flags (spam, inappropriate, harassment, etc.)
- **Structure**: id, flagged_by_user_id, content_type, content_id, flag_reason, flag_details, flag_status, reviewed_by_admin_id, reviewed_at, review_notes, action_taken, created_at, updated_at
- **Recommendation**: ✅ **KEEP** - Complex moderation workflow

#### `admin_actions`
- **Purpose**: Admin action log (content_removed, user_warned, user_banned, etc.)
- **Structure**: id, action_type, target_type, target_id, admin_user_id, details (JSONB), created_at
- **Recommendation**: ✅ **KEEP** - Audit log, separate table makes sense

---

### 4. Reference/Lookup Tables (Review)

#### `artist_genre_mapping`
- **Purpose**: Map artists to genres
- **Structure**: (Need to check structure)
- **Recommendation**: ⚠️ **REVIEW** - May be redundant if `artists.genres` TEXT[] column exists. Genre data should be denormalized on artists table.

#### `artist_genres`
- **Purpose**: Genre reference data
- **Structure**: (Need to check structure)
- **Recommendation**: ⚠️ **REVIEW** - If it's just a lookup table, may keep. If it's mapping, consolidate.

#### `city_centers`
- **Purpose**: City center coordinates for location search
- **Structure**: (Need to check structure)
- **Recommendation**: ✅ **KEEP** - Reference data for location features

---

### 5. Email/Communication (Review)

#### `email_preferences`
- **Purpose**: User email notification preferences
- **Structure**: (Need to check structure)
- **Recommendation**: ⚠️ **REVIEW** - Already consolidated into `user_preferences.email_preferences` JSONB? Check if table still exists.

#### `email_gate_entries`
- **Purpose**: Track email gating (e.g., "enter email to see content")
- **Structure**: (Need to check structure)
- **Recommendation**: ⚠️ **REVIEW** - Could merge into `interactions` or keep as separate feature table.

---

### 6. User Preferences (Review)

#### `user_music_tags`
- **Purpose**: Manual and Spotify-synced music preference tags
- **Structure**: id, user_id, tag_type (genre/artist), tag_value, tag_source (manual/spotify), weight, created_at, updated_at
- **Recommendation**: ⚠️ **REVIEW** - May overlap with `user_genre_preferences`. Check if consolidation makes sense.

---

## Next Steps

1. **Run the analysis script** to get actual table structures and row counts
2. **Review each table** one by one with the user
3. **Decide consolidation strategy** for each:
   - Keep as-is (complex feature)
   - Consolidate into existing table (simple data)
   - Drop (redundant/consolidated)
4. **Create migration scripts** to consolidate/drop as needed

