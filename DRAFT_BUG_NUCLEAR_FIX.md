# Draft Bug - NUCLEAR FIX Applied

## Problem
Drafts still appearing in "Unreviewed concerts" even after review submission, despite SQL migrations being applied.

## Root Cause Analysis
The draft deletion wasn't aggressive enough and wasn't being verified. Drafts could:
1. Be recreated by auto-save after deletion
2. Not be fully deleted due to timing issues
3. Remain in the database despite deletion attempts

## NUCLEAR FIX Applied

### 1. **Aggressive Draft Deletion in ReviewService** (`src/services/reviewService.ts`)
   - ✅ When a draft exists: DELETE it completely (don't try to update it)
   - ✅ After creating published review: Delete ALL drafts for the event
   - ✅ VERIFY deletion worked by querying again
   - ✅ If drafts still exist, force delete them again
   - ✅ Added extensive logging for debugging

### 2. **NUCLEAR Deletion in EventReviewForm** (`src/components/reviews/EventReviewForm.tsx`)
   - ✅ Delete ALL drafts immediately after review submission
   - ✅ Wait 200ms for database to catch up
   - ✅ VERIFY deletion worked
   - ✅ If drafts still exist, force delete them
   - ✅ Verify again after force delete

### 3. **NUCLEAR Deletion in ProfileView** (`src/components/profile/ProfileView.tsx`)
   - ✅ Delete ALL drafts for event BEFORE refreshing data
   - ✅ Wait 1 second for database operations to complete
   - ✅ Query database directly for drafts (bypasses RPC)
   - ✅ Filter out drafts with published reviews
   - ✅ Auto-delete any orphaned drafts found during query
   - ✅ Refresh drafts after deletion

### 4. **SQL Migrations** (Already Applied)
   - ✅ `save_review_draft` blocks draft creation if published review exists
   - ✅ `get_user_draft_reviews` excludes drafts when published reviews exist

## How It Works Now

1. **On Review Submission:**
   - Auto-save is disabled immediately
   - Draft is deleted BEFORE creating published review
   - Published review is created
   - ALL drafts for event are deleted again
   - Deletion is VERIFIED
   - If drafts still exist, they're force deleted

2. **After Review Submission:**
   - ProfileView deletes ALL drafts for event
   - Waits 1 second
   - Queries database directly for drafts
   - Filters out drafts with published reviews
   - Auto-deletes any orphaned drafts found
   - Refreshes draft list

3. **When Fetching Drafts:**
   - Queries database directly (bypasses RPC)
   - Also queries via RPC for comparison
   - Checks for published reviews
   - Filters out drafts with published reviews
   - Auto-deletes orphaned drafts

## Testing Steps

1. Delete any existing problematic drafts/reviews from database
2. Start a new review (auto-save creates draft)
3. Submit the review
4. Check browser console for deletion logs:
   - Should see "🧹 NUCLEAR: Deleted X draft(s)"
   - Should see "✅ Verified: All drafts deleted successfully"
5. Check "Unreviewed concerts" - draft should be GONE
6. If draft still appears, check console for error messages

## Expected Console Logs

When submitting a review, you should see:
```
🗑️ EventReviewForm: Starting NUCLEAR draft deletion for event: <event_id>
🧹 EventReviewForm: Deleted X draft(s) in first pass
✅ EventReviewForm: Verified - all drafts successfully deleted
🧹 NUCLEAR: Deleted X draft(s) after review creation
✅ Verified: All drafts deleted successfully
```

If drafts still exist, you'll see:
```
❌ CRITICAL: X draft(s) STILL EXIST after deletion!
```

## If Problem Persists

Check browser console for:
1. Deletion errors
2. Drafts still existing after deletion
3. Event IDs being used

Then manually query database:
```sql
SELECT id, event_id, is_draft, review_text 
FROM reviews 
WHERE user_id = '<your_user_id>' 
  AND event_id = '<event_id>';
```

This will show if drafts are actually being deleted or if something else is wrong.

