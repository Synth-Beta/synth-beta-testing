# 🚀 APPLY THE DATABASE FIX - Step by Step Guide

## ⚠️ IMPORTANT: You MUST run the SQL script in your database first!

The code is now updated, but the database functions don't exist yet. Follow these steps:

---

## Step 1: Open Supabase Dashboard

1. Go to https://supabase.com/dashboard
2. Select your project: `glpiolbrafqikqhnseto`
3. Click on **SQL Editor** in the left sidebar

---

## Step 2: Run the Complete Fix Script

1. Click **New Query** in the SQL Editor
2. Copy the **ENTIRE contents** of `COMPLETE_ON_CONFLICT_FIX.sql`
3. Paste it into the SQL Editor
4. Click **Run** or press `Cmd+Enter`

---

## Step 3: Verify the Fix

After running the script, you should see success messages at the bottom:

```
✅ ON CONFLICT constraint error fix applied successfully!
✅ All trigger functions updated with proper conflict handling
✅ Safe upsert function created for jambase_events
✅ Constraint names verified and fixed
✅ Ready to test event creation in EventReviewForm
```

You should also see two result tables showing:
1. **Unique constraints** on your tables
2. **Functions** that were created/updated

---

## Step 4: Test the Fix

1. Refresh your application
2. Try creating an event through the review form
3. Check the console for debug messages:
   - `🔍 DEBUG: Checking for existing event before insert`
   - `✅ Event created for draft: [event-id]`

---

## What This Fix Does

### 🔧 **Fixes Applied:**

1. **`auto_claim_creator_events()` trigger**
   - Now handles conflicts when inserting into `event_claims` table
   - Uses `ON CONFLICT (event_id, claimer_user_id) DO UPDATE`

2. **`trigger_event_creation_analytics()` trigger**
   - Now handles conflicts when inserting into `analytics_event_daily` table
   - Uses `ON CONFLICT (event_id, date) DO NOTHING`

3. **`safe_upsert_jambase_event()` function** (NEW)
   - Safe way to insert/update events without ON CONFLICT errors
   - Can be used in future updates

4. **`set_user_interest()` function**
   - More robust with exception handling
   - Prevents unique constraint violations

5. **Constraint verification**
   - Ensures `jambase_events_jambase_event_id_key` constraint exists
   - Verifies all unique constraints are properly named

---

## Current Code Behavior (Until You Apply the Fix)

The code now uses a **check-then-insert** pattern:

1. ✅ **Check** if an event with the same artist, venue, and date exists
2. ✅ **Reuse** existing event if found
3. ✅ **Create** new event only if it doesn't exist
4. ✅ **Unique ID** generated for each new user-created event

This prevents the ON CONFLICT error even before the database fix is applied, but the database fix is still needed to prevent trigger-related errors.

---

## Alternative: Quick Manual Fix

If you can't access the SQL Editor, you can also:

1. Use any PostgreSQL client (pgAdmin, DBeaver, etc.)
2. Connect to your Supabase database
3. Run the `COMPLETE_ON_CONFLICT_FIX.sql` script

Your connection string is available in:
**Supabase Dashboard → Settings → Database → Connection String**

---

## Need Help?

If you encounter any issues:

1. Check the error message in the console
2. Verify the SQL script ran successfully
3. Check that all functions were created (see Step 3)
4. Try refreshing your application

---

## Summary

- ✅ **Code is updated** - EventReviewForm now uses safe insert logic
- ⚠️ **Database needs update** - Run `COMPLETE_ON_CONFLICT_FIX.sql`
- ✅ **Temporary workaround** - Code checks for existing events first
- ✅ **Full fix** - Database triggers will handle all conflicts properly

**Run the SQL script now to complete the fix!**
