# Review Modal Event Data Fix

## Problem
The review modal was showing "Invalid Date" and missing artist/venue information. Console logs showed `review.jambase_events: undefined` - the event data wasn't being populated in the modal.

## Root Cause
The issue was in the data transformation in `ProfileView.tsx`. The `ReviewService.getUserReviewHistory()` returns data in this format:

```typescript
{
  review: { id, rating, review_text, ... },
  event: { title, artist_name, venue_name, event_date, ... }  // jambase_events data
}
```

But the transformation was only putting the event data under `event`, while the modal was looking for `jambase_events`.

## The Fix Applied

### **File:** `src/components/profile/ProfileView.tsx`

**Before:**
```typescript
const transformedReviews = result.reviews
  .map((item: any) => ({
    id: item.review.id,
    // ... other review fields
    event: {
      event_name: item.event?.title || 'Concert Review',
      location: item.event?.venue_name || 'Unknown Venue',
      event_date: item.event?.event_date || item.review.created_at,
      event_time: item.event?.event_time || 'TBD'
    }
  }));
```

**After:**
```typescript
const transformedReviews = result.reviews
  .map((item: any) => ({
    id: item.review.id,
    // ... other review fields
    // Add jambase_events data for the modal to access
    jambase_events: item.event,  // ← NEW: Direct access to event data
    event: {
      event_name: item.event?.title || 'Concert Review',
      location: item.event?.venue_name || 'Unknown Venue',
      event_date: item.event?.event_date || item.review.created_at,
      event_time: item.event?.event_time || 'TBD'
    }
  }));
```

## What This Fixes

### **Before:**
- ❌ Review modal showed "Invalid Date"
- ❌ Artist name was missing
- ❌ Venue name was missing
- ❌ Console showed `review.jambase_events: undefined`

### **After:**
- ✅ Review modal shows correct event date
- ✅ Artist name displays properly
- ✅ Venue name displays properly
- ✅ All event data is accessible via `selectedReview.jambase_events`

## Data Flow

### **Review Service Returns:**
```typescript
{
  review: { id: "123", rating: 5, review_text: "Great show!", ... },
  event: { 
    title: "Goose at Ameris Bank Amphitheatre",
    artist_name: "Goose", 
    venue_name: "Ameris Bank Amphitheatre",
    event_date: "2024-09-26T20:00:00Z",
    ...
  }
}
```

### **Transformation Now Creates:**
```typescript
{
  id: "123",
  rating: 5,
  review_text: "Great show!",
  jambase_events: {  // ← Modal can access this
    title: "Goose at Ameris Bank Amphitheatre",
    artist_name: "Goose", 
    venue_name: "Ameris Bank Amphitheatre",
    event_date: "2024-09-26T20:00:00Z"
  },
  event: {  // ← Legacy format for other components
    event_name: "Goose at Ameris Bank Amphitheatre",
    location: "Ameris Bank Amphitheatre",
    event_date: "2024-09-26T20:00:00Z"
  }
}
```

### **Modal Can Now Access:**
```typescript
selectedReview.jambase_events?.title        // ✅ "Goose at Ameris Bank Amphitheatre"
selectedReview.jambase_events?.artist_name  // ✅ "Goose"
selectedReview.jambase_events?.venue_name   // ✅ "Ameris Bank Amphitheatre"
selectedReview.jambase_events?.event_date   // ✅ "2024-09-26T20:00:00Z"
```

## Testing

1. ✅ Open a review from the profile
2. ✅ Verify event title displays correctly
3. ✅ Verify artist name displays correctly  
4. ✅ Verify venue name displays correctly
5. ✅ Verify event date displays correctly (not "Invalid Date")
6. ✅ Verify "View Event" button works

## Files Modified

- ✅ `src/components/profile/ProfileView.tsx` - Added `jambase_events` to transformed review data

## No Breaking Changes
- All existing functionality preserved
- Both `event` and `jambase_events` data available for different components
- Backward compatible with existing code

---

**Status: ✅ COMPLETE - Review modal now shows complete event information**
