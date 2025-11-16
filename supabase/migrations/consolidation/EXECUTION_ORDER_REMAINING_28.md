# Execution Order: Consolidating Remaining 28 Tables

Run these SQL files in Supabase SQL Editor in this exact order:

---

## 🔍 **STEP 1: Analyze All Remaining Tables**

**File:** `step1_analyze_all_remaining_tables.sql`

**Purpose:** Get overview of all 28 remaining tables

**What it does:**
- Lists all remaining tables with column counts and row counts
- Categorizes tables by purpose
- Shows recommendations for each table

**Action:** Run this to see what we're working with

---

## 🔄 **STEP 2: Consolidate Simple Tables**

**File:** `step2_consolidate_simple_tables.sql`

**Purpose:** Migrate simple relationship/engagement tables into consolidated tables

**What it does:**
- Migrates `event_photo_likes` → `engagements` (entity_type='event_photo', engagement_type='like')
- Migrates `event_photo_comments` → `comments` (entity_type='event_photo')
- Migrates `event_shares` → `interactions` (interaction_type='share', entity_type='event')

**Action:** Run this, then check the verification queries at the end to confirm migration

---

## 🗑️ **STEP 3: Drop Consolidated Simple Tables**

**File:** `step3_drop_consolidated_simple_tables.sql`

**Purpose:** Drop the 3 tables that were consolidated in Step 2

**What it does:**
- Drops `event_photo_likes` (now in `engagements`)
- Drops `event_photo_comments` (now in `comments`)
- Drops `event_shares` (now in `interactions`)

**Action:** Run this AFTER verifying Step 2 was successful

---

## ✅ **STEP 4: Verify Redundant Tables**

**File:** `step4a_verify_redundant_tables.sql`

**Purpose:** Check which redundant tables need to be handled

**What it does:**
- Checks `event_genres`, `artist_genre_mapping`, `artist_genres`
- Checks `review_photos`, `review_videos`, `review_tags`
- Checks `event_interests`, `event_promotions`
- Checks `email_preferences`, `user_music_tags`
- Checks `event_ticket_urls`

**Action:** Run this to see which tables exist, have data, and what action is needed

---

## 🔄 **STEP 5: Consolidate event_ticket_urls**

**File:** `consolidate_event_ticket_urls.sql`

**Purpose:** Migrate `event_ticket_urls` into `event_tickets`

**What it does:**
- Creates helper function to extract provider from URLs
- Migrates all URLs to `event_tickets` with provider information
- Sets primary ticket flag for each event
- Shows verification statistics

**Action:** Run this, then check the verification queries at the end

---

## 🗑️ **STEP 6: Drop event_ticket_urls**

**File:** `drop_event_ticket_urls.sql`

**Purpose:** Drop `event_ticket_urls` after successful migration

**What it does:**
- Verifies all URLs were migrated
- Drops `event_ticket_urls` table
- Confirms drop was successful

**Action:** Run this AFTER verifying Step 5 was successful (check unmigrated_count = 0)

---

## 📋 **STEPS 7-11: Review Remaining Tables** (After Steps 1-6)

Based on results from Step 4, you may need to:

- **Step 7:** Check genre tables (`step5_review_genre_tables.sql`) - if genre tables exist
- **Step 8:** Check preference tables (`step6_review_preference_tables.sql`) - if preference tables exist
- **Step 9:** Handle other redundant tables (create migration scripts as needed)
- **Step 10:** Final audit (`step7_final_audit.sql`) - comprehensive final check
- **Step 11:** Drop any remaining redundant tables

---

## 🎯 **Quick Start: Run These First 3 Steps**

If you want to start consolidating immediately:

1. ✅ **Run:** `step1_analyze_all_remaining_tables.sql` - See what we have
2. ✅ **Run:** `step2_consolidate_simple_tables.sql` - Consolidate simple tables
3. ✅ **Verify:** Check the verification queries show successful migration
4. ✅ **Run:** `step3_drop_consolidated_simple_tables.sql` - Drop consolidated tables

Then continue with Steps 4-6 for `event_ticket_urls`.

---

## 📊 **Expected Progress After Each Step**

After Step 3:
- **3 tables dropped** (event_photo_likes, event_photo_comments, event_shares)
- **~25 tables remaining**

After Step 6:
- **4 tables dropped** (added event_ticket_urls)
- **~24 tables remaining**

Final goal: **~18 consolidated tables + ~8-10 complex feature tables = ~26-28 total tables**

---

## ⚠️ **Important Notes**

1. **Always verify** migration results before dropping tables
2. **Check row counts** to ensure data was migrated correctly
3. **Review recommendations** from Step 1 to understand each table's purpose
4. **Back up data** if needed before running drop scripts (especially in production)

---

## 🔍 **Verification Checklist**

After each consolidation step, verify:
- ✅ Row counts match (source vs. target)
- ✅ All foreign keys are preserved
- ✅ No data loss occurred
- ✅ Verification queries show success
- ✅ Unmigrated count = 0 (if applicable)

