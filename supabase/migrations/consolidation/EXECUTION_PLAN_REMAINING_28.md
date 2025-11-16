# Execution Plan: Consolidating Remaining 28 Tables

This document outlines the step-by-step plan to consolidate or drop the remaining 28 tables.

## Overview

After consolidating the core 18 tables, we have 28 remaining tables that need to be:
1. **Consolidated** into existing tables (simple relationship/engagement data)
2. **Reviewed** for redundancy (may already be consolidated via columns)
3. **Kept** as complex feature tables (legitimate separate tables)

## Execution Steps

### ✅ Step 1: Analyze All Remaining Tables
**File:** `step1_analyze_all_remaining_tables.sql`

**Purpose:** Get comprehensive overview of all 28 remaining tables:
- Table existence and row counts
- Column structures
- Foreign key relationships
- Initial recommendations

**Action:** Run this script first to see what we're working with.

---

### ✅ Step 2: Consolidate Simple Tables
**File:** `step2_consolidate_simple_tables.sql`

**Purpose:** Migrate simple relationship/engagement tables into consolidated tables:
- `event_photo_likes` → `engagements` (entity_type='event_photo', engagement_type='like')
- `event_photo_comments` → `comments` (entity_type='event_photo')
- `event_shares` → `interactions` (interaction_type='share', entity_type='event')

**Action:** Run this script to consolidate the data, then verify the results.

---

### ✅ Step 3: Drop Consolidated Simple Tables
**File:** `step3_drop_consolidated_simple_tables.sql`

**Purpose:** Drop tables that were consolidated in Step 2:
- `event_photo_likes`
- `event_photo_comments`
- `event_shares`

**Action:** Run this script AFTER verifying Step 2 was successful.

---

### ✅ Step 4: Check Redundant Tables
**File:** `step4_check_redundant_tables.sql`

**Purpose:** Check for tables that may have already been consolidated or are redundant:
- `event_interests` (should be in `relationships` table)
- `event_promotions` (should be in `monetization_tracking` table)
- `review_photos`, `review_videos`, `review_tags` (may be redundant with `reviews` table arrays)

**Action:** Run this script to see which tables are redundant. Then create migration scripts for any that need data migration before dropping.

---

### ✅ Step 5: Review Genre Tables
**File:** `step5_review_genre_tables.sql`

**Purpose:** Check genre-related tables:
- `event_genres` (may be redundant with `events.genres` column)
- `artist_genre_mapping` (may be redundant with `artists.genres` column)
- `artist_genres` (check if reference table or mapping table)

**Action:** Run this script to understand genre table structure. Decide which to consolidate vs. keep as reference data.

---

### ✅ Step 6: Review Preference Tables
**File:** `step6_review_preference_tables.sql`

**Purpose:** Check preference-related tables:
- `email_preferences` (may be redundant with `user_preferences.email_preferences` JSONB)
- `user_music_tags` (may overlap with `user_genre_preferences` or `user_preferences.music_preference_signals`)

**Action:** Run this script to see preference table overlap. Consolidate if needed.

---

### ✅ Step 7: Final Audit
**File:** `step7_final_audit.sql`

**Purpose:** Comprehensive final audit:
- List all remaining tables
- Verify consolidations are complete
- Check for tables that should be dropped
- Summary statistics

**Action:** Run this script to verify all consolidations are complete and get final table count.

---

## Complex Feature Tables (Should Keep)

These tables are legitimate separate tables for complex features:

- ✅ `event_groups` - User-created event groups
- ✅ `event_group_members` - Members of event groups
- ✅ `event_photos` - User-uploaded event photos
- ✅ `event_tickets` - Detailed ticket information
- ✅ `event_claims` - Event claiming workflow
- ✅ `moderation_flags` - Content moderation
- ✅ `admin_actions` - Admin action log
- ✅ `city_centers` - Location reference data

## Tables to Review Structure

- ⚠️ `event_ticket_urls` - May overlap with `event_tickets` or `events.ticket_urls`
- ⚠️ `email_gate_entries` - Check if should be in `interactions` or kept separate

---

## Execution Order

1. **Run Step 1** - Understand what we have
2. **Run Step 2** - Consolidate simple tables
3. **Verify Step 2** - Check migration was successful
4. **Run Step 3** - Drop consolidated tables
5. **Run Step 4** - Check redundant tables
6. **Run Step 5** - Review genre tables
7. **Run Step 6** - Review preference tables
8. **Run Step 7** - Final audit
9. **Create additional migration scripts** as needed based on audit results
10. **Final cleanup** - Drop all redundant tables

---

## Expected Final Table Count

- **18 consolidated core tables**
- **~8-10 complex feature tables** (event_groups, event_photos, event_tickets, moderation_flags, etc.)
- **Total: ~26-28 tables** (down from 46+)

---

## Notes

- Always verify data migration before dropping tables
- Check for foreign key dependencies before dropping
- Keep reference/lookup tables if they serve a purpose
- Complex features may need separate tables even if they seem similar

