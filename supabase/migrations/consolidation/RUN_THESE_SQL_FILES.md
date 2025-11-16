# SQL Files to Run - Database Consolidation Cleanup

## Current Situation
You have 48 tables but should only have 15 consolidated tables (plus any supporting tables like event_promotions, admin_actions, etc.)

## Files to Run (In Order)

### 1. LIST_ALL_TABLES.sql
**Purpose:** See all current tables and identify what needs to be dropped

**Location:** `supabase/migrations/consolidation/LIST_ALL_TABLES.sql`

**Run this first to see what you have:**
```bash
# Copy and run this file in your Supabase SQL editor
```

This will show you:
- ✅ Tables to KEEP (the 15 consolidated tables)
- 🗑️ Tables to DROP (old consolidated tables)
- ⚠️ Tables to REVIEW (might be supporting tables)

---

### 2. VERIFY_AGAINST_PLAN.sql
**Purpose:** Verify the 15 consolidated tables exist and match the original plan

**Location:** `supabase/migrations/consolidation/VERIFY_AGAINST_PLAN.sql`

**Run this to verify consolidation:**
```bash
# Copy and run this file in your Supabase SQL editor
```

This verifies:
- All 15 consolidated tables exist
- Each table has the correct structure (columns, constraints)
- Old source tables are properly migrated

---

### 3. 12_drop_old_tables.sql (UPDATED)
**Purpose:** Drop all old/unconsolidated tables

**Location:** `supabase/migrations/consolidation/12_drop_old_tables.sql`

**⚠️ WARNING: This permanently deletes old tables!**
**Only run after verifying Steps 1 & 2**

This will drop:
- Old source tables: `profiles`, `jambase_events`, `user_reviews`, `user_interactions`, etc.
- Backup tables: `profiles_old`, `jambase_events_old`, etc.
- Migration temp tables: `users_new`, `events_new`, etc.
- Old relationship tables: `artist_follows`, `venue_follows`, `friends`, etc.
- Old content tables: `event_comments`, `review_comments`, `event_likes`, etc.
- Old analytics tables: `analytics_user_daily`, `analytics_event_daily`, etc.
- Old preference tables: `streaming_profiles`, `music_preference_signals`, etc.

**After running this, you should have ~15 tables remaining**

---

### 4. FINAL_VERIFICATION.sql
**Purpose:** Comprehensive data integrity verification

**Location:** `supabase/migrations/consolidation/FINAL_VERIFICATION.sql`

**Run this after dropping old tables:**
```bash
# Copy and run this file in your Supabase SQL editor
```

This verifies:
- Table existence and row counts
- Data integrity (orphaned foreign keys)
- Index existence
- RLS policy existence
- Function/view/trigger references

---

## Quick Copy-Paste SQL

### Quick Table Count Check
Run this to see your current table count:
```sql
SELECT 
  COUNT(*) as total_tables,
  COUNT(*) FILTER (WHERE table_name IN ('users', 'events', 'artists', 'venues', 'relationships', 
                                        'reviews', 'comments', 'engagements', 'chats', 'messages',
                                        'notifications', 'interactions', 'analytics_daily', 
                                        'user_preferences', 'account_permissions')) as consolidated_tables
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE';
```

### Quick List of All Tables
```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;
```

---

## Expected Result

After running all scripts:
- **15 consolidated tables** should exist:
  1. users
  2. events
  3. artists
  4. venues
  5. relationships
  6. reviews
  7. comments
  8. engagements
  9. chats
  10. messages
  11. notifications
  12. interactions
  13. analytics_daily
  14. user_preferences
  15. account_permissions

- **Plus any supporting tables** that weren't part of consolidation:
  - event_promotions (if it exists)
  - admin_actions (if it exists)
  - event_claims (if it exists)
  - event_groups (if it exists)
  - event_photos (if it exists)
  - etc.

**Total should be ~15-20 tables** (not 48!)

---

## Troubleshooting

If you see errors about foreign key constraints:
- The `CASCADE` option should handle this automatically
- If issues persist, check what's referencing the table before dropping

If some tables don't drop:
- Check if they're being referenced by views or functions
- You may need to drop dependent objects first

If you're unsure about a table:
- Check the `LIST_ALL_TABLES.sql` output
- Review the original plan in `02_table_mapping.md`

