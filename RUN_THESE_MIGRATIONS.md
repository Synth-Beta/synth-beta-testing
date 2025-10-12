# 🗄️ ALL MIGRATIONS TO RUN IN SUPABASE

Run these **4 SQL files** in Supabase SQL Editor in order:

---

## 📋 **Migration 1: Phase 2 - Event Creation System**

**File:** `supabase/migrations/20250213000000_phase2_event_creation_system.sql`

**What it does:**
- Creates `event_claims` table
- Creates `event_tickets` table
- Adds event claiming permissions
- Sets up RLS policies

**To run:** Copy entire contents and paste into Supabase SQL Editor

---

## 📋 **Migration 2: Phase 3 - Admin & Promotion System**

**File:** `supabase/migrations/20250214000000_phase3_admin_promotion_system.sql`

**What it does:**
- Creates `event_promotions` table
- Creates `admin_actions` table
- Creates `moderation_flags` table
- Adds functions: `promote_event()`, `flag_content()`, `moderate_content()`
- Sets up RLS policies

**To run:** Copy entire contents and paste into Supabase SQL Editor

---

## 📋 **Migration 3: Phase 3 - User Blocking System**

**File:** `supabase/migrations/20250214000001_user_blocking_system.sql`

**What it does:**
- Creates `user_blocks` table
- Adds moderation columns to profiles
- Adds functions: `block_user()`, `unblock_user()`, `is_user_blocked()`
- Updates RLS policies to respect blocks

**To run:** Copy entire contents and paste into Supabase SQL Editor

---

## 📋 **Migration 4: Phase 4 - Social & Engagement**

**File:** `supabase/migrations/20250216000000_phase4_social_engagement.sql`

**What it does:**
- Creates `event_groups` table
- Creates `event_group_members` table
- Creates `event_photos` table
- Creates `event_photo_likes` table
- Creates `event_photo_comments` table
- Adds RSVP columns to `user_jambase_events`
- Adds functions: `create_event_group()`, `join_event_group()`, `upload_event_photo()`
- Sets up RLS policies

**To run:** Copy entire contents and paste into Supabase SQL Editor

---

## 🚀 **AUTOMATED METHOD (Easiest)**

Instead of manually copying, just run:

```bash
supabase db push
```

This applies all migrations automatically in the correct order.

---

## 📍 **MANUAL METHOD (If you prefer)**

1. Open Supabase Dashboard
2. Go to SQL Editor
3. Copy contents of migration file 1
4. Paste and click "Run"
5. Verify success message
6. Repeat for files 2, 3, and 4

---

## ✅ **FILE PATHS**

All files are in: `supabase/migrations/`

```
supabase/migrations/
├── 20250213000000_phase2_event_creation_system.sql
├── 20250214000000_phase3_admin_promotion_system.sql
├── 20250214000001_user_blocking_system.sql
└── 20250216000000_phase4_social_engagement.sql
```

---

## 🎯 **RECOMMENDED: Use supabase db push**

It's safer and easier:
```bash
cd /Users/sloiterstein/Desktop/Synth/synth-beta-testing-main
supabase db push
```

This will:
- ✅ Apply migrations in correct order
- ✅ Skip already-applied migrations
- ✅ Handle rollbacks if errors occur
- ✅ Track which migrations have run

---

## 📊 **After Running - Verify**

```sql
-- Check all tables were created
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN (
  'event_claims',
  'event_tickets', 
  'event_promotions',
  'admin_actions',
  'moderation_flags',
  'user_blocks',
  'event_groups',
  'event_group_members',
  'event_photos',
  'event_photo_likes',
  'event_photo_comments'
);
```

Should return 11 tables.

---

## 🔧 **If You Want Individual Files**

I can extract each migration to a standalone .sql file if you prefer to run them individually. Just let me know!

