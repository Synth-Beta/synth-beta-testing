# Review Feed Fix - Exclude ATTENDANCE_ONLY Records

## Problem
The review feed was showing events with "ATTENDANCE_ONLY" text and 1.0 star ratings. These are events where users marked attendance but haven't written actual reviews yet. They shouldn't appear in the main review feed.

## Root Cause
The `UnifiedFeedService.getUserReviews()` and `getPublicReviews()` functions were fetching ALL records from `user_reviews` table, including:
- ✅ Real reviews with actual content
- ❌ Attendance-only records with `review_text = 'ATTENDANCE_ONLY'`

## Solution Applied

### 1. Fixed User Reviews Query
**File:** `src/services/unifiedFeedService.ts`

**Before:**
```typescript
const { data: reviews, error } = await (supabase as any)
  .from('user_reviews')
  .select(`*, jambase_events: jambase_events (id, title, artist_name, venue_name, event_date)`)
  .eq('user_id', userId)
  .order('created_at', { ascending: false })
  .limit(20);
```

**After:**
```typescript
const { data: reviews, error } = await (supabase as any)
  .from('user_reviews')
  .select(`*, jambase_events: jambase_events (id, title, artist_name, venue_name, event_date)`)
  .eq('user_id', userId)
  .neq('review_text', 'ATTENDANCE_ONLY') // Exclude attendance-only records from review feed
  .not('review_text', 'is', null) // Exclude null review_text
  .order('created_at', { ascending: false })
  .limit(20);
```

### 2. Fixed Public Reviews Query
**File:** `src/services/unifiedFeedService.ts`

**Before:**
```typescript
const { data: reviews, error } = await supabase
  .from('public_reviews_with_profiles')
  .select('*')
  .neq('user_id', userId) // Exclude user's own reviews
  .order('created_at', { ascending: false })
  .limit(limit);
```

**After:**
```typescript
const { data: reviews, error } = await supabase
  .from('public_reviews_with_profiles')
  .select('*')
  .neq('user_id', userId) // Exclude user's own reviews
  .neq('review_text', 'ATTENDANCE_ONLY') // Exclude attendance-only records from public feed
  .not('review_text', 'is', null) // Exclude null review_text
  .order('created_at', { ascending: false })
  .limit(limit);
```

## What This Fixes

### Before Fix:
- ❌ Review feed showed "ATTENDANCE_ONLY" entries
- ❌ 1.0 star ratings for attendance-only events
- ❌ Confusing user experience

### After Fix:
- ✅ Review feed only shows actual reviews
- ✅ Attendance-only events stay in "Unreviewed" section
- ✅ Clean, focused review feed

## Data Flow Now

### When User Marks Attendance:
1. Creates record: `review_text = 'ATTENDANCE_ONLY'`, `was_there = true`
2. **Does NOT appear in review feed** ✅
3. Appears in "Unreviewed" section of profile ✅

### When User Writes Review:
1. Updates record: `review_text = "actual review content"`, `was_there = true`
2. **Appears in review feed** ✅
3. Moves to "Posts" section of profile ✅

## Testing

1. ✅ Mark attendance on an event → Should NOT appear in review feed
2. ✅ Write a review for that event → Should appear in review feed
3. ✅ Check "Unreviewed" section → Should show attendance-only events
4. ✅ Check "Posts" section → Should show actual reviews

## Files Modified

- ✅ `src/services/unifiedFeedService.ts` - Added filters to exclude ATTENDANCE_ONLY records

## No Breaking Changes
- All existing functionality preserved
- Attendance tracking still works
- Profile sections still work correctly
- Only affects what appears in the main review feed

---

**Status: ✅ COMPLETE - Review feed now only shows actual reviews**
