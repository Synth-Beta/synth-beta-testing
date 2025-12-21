# 3NF Migration Checklist

## ✅ Completed Steps

### 1. Code Updates (All Done)
- ✅ All TypeScript services updated to use 3NF tables
- ✅ All React components updated
- ✅ All queries migrated from `relationships` to:
  - `artist_follows` (artist follows)
  - `user_venue_relationships` (venue follows)
  - `user_event_relationships` (event RSVPs)
  - `user_relationships` (friendships & matches)

### 2. Database Function Updates (All Done)
- ✅ `check_user_follows_artist_or_venue` - Updated
- ✅ `get_personalized_feed_v3` - Updated (4 references)
- ✅ `is_event_relevant_to_user` - Updated
- ✅ `friends` view - Updated (if exists)
- ✅ Profile RLS policy - Updated (if profiles table exists)

### 3. Migration Files Updated
- ✅ `20250325000000_create_personalized_feed_v3.sql` - Updated
- ✅ `20250316000000_create_connection_degree_reviews_system.sql` - Updated
- ✅ `20250327000000_update_functions_for_3nf_compliance.sql` - Created & Run

## 📋 Pre-Drop Verification Steps

### Step 1: Re-run Updated Migrations
Run these in Supabase SQL Editor (in order):
1. `20250325000000_create_personalized_feed_v3.sql` - Recreates function with 3NF tables
2. `20250316000000_create_connection_degree_reviews_system.sql` - Updates `is_event_relevant_to_user`

### Step 2: Run Verification Script
Run: `20250327000002_final_3nf_verification.sql`
- Checks for any remaining `relationships` references
- Verifies data migration counts
- Should show all ✅ green checkmarks

### Step 3: Test Your Application
Test these features thoroughly:
- [ ] **Home/Unified Feed** - Does personalized feed load?
- [ ] **Discover Page** - Do events show correctly?
- [ ] **Connect Page** - Do friend suggestions work?
- [ ] **Event Interest** - Can you mark events as "going" or "interested"?
- [ ] **Artist Follow** - Can you follow/unfollow artists?
- [ ] **Venue Follow** - Can you follow/unfollow venues?
- [ ] **Friend Requests** - Can you send/accept friend requests?
- [ ] **Matches** - Do user matches work?
- [ ] **Notifications** - Do notifications load correctly?

### Step 4: Check Console for Errors
- [ ] No 404 errors for `notifications_with_details`
- [ ] No errors about missing `relationships` table
- [ ] No errors about missing `venue_follows` table

## 🗑️ Final Step: Drop Old Tables

### Only After All Tests Pass!

Run: `20250327000003_drop_old_relationships_tables.sql`

This will:
1. Verify all data is migrated
2. Drop `relationships` table
3. Drop `venue_follows` table
4. Confirm successful drop

**⚠️ WARNING: This is irreversible! Make sure everything works first!**

## 📊 Expected Results

After dropping old tables:
- ✅ All features should work exactly the same
- ✅ No errors in console
- ✅ All data preserved in new 3NF tables
- ✅ Better performance (proper foreign keys, indexes)
- ✅ 3NF compliance achieved

## 🔍 Troubleshooting

If something breaks after dropping tables:
1. Check console errors
2. Run verification script again
3. Check if any functions/views still reference old tables
4. Restore from backup if needed (Supabase dashboard → Database → Backups)

## 📝 Files Summary

**Updated Migration Files:**
- `20250325000000_create_personalized_feed_v3.sql` - Main feed function
- `20250316000000_create_connection_degree_reviews_system.sql` - Review relevance function

**New Migration Files:**
- `20250327000000_update_functions_for_3nf_compliance.sql` - Function updates
- `20250327000002_final_3nf_verification.sql` - Verification script
- `20250327000003_drop_old_relationships_tables.sql` - Drop old tables

**Code Files Updated:**
- All services in `src/services/` (23+ files)
- All components in `src/components/` (10+ files)

