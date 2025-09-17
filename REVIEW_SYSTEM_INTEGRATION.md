# Review System Integration Guide

## Overview

This document outlines the complete review system integration that has been implemented for the PlusOne Event Crew application. The system provides a comprehensive UI-friendly review functionality with social engagement features.

## Database Schema

### Tables Created

1. **`user_reviews`** - Main reviews table with UI-friendly structure
2. **`review_likes`** - Social engagement for likes/hearts
3. **`review_comments`** - Threaded comments system
4. **`review_shares`** - Share tracking
5. **`public_reviews_with_profiles`** - View for public reviews with user data

### Key Features

- **Star ratings** (1-5) with optional emoji reactions
- **Media support** for photos and videos
- **Categorized tags** (mood, genre, context)
- **Social engagement** (likes, comments, shares)
- **Privacy controls** (public/private reviews)
- **Real-time counters** for engagement metrics

## Files Created/Updated

### New Services
- `src/services/reviewService.ts` - Complete review management service
- `create_review_functions.sql` - Database functions for count management

### New Components
- `src/components/ReviewCard.tsx` - Individual review display
- `src/components/ReviewList.tsx` - List of reviews for an event
- `src/components/PublicReviewCard.tsx` - Public review with user profiles
- `src/components/PublicReviewList.tsx` - Public reviews with filtering
- `src/components/EventReviewsSection.tsx` - Complete reviews section

### Updated Components
- `src/components/EventReviewModal.tsx` - Enhanced with new features
- `src/components/ArtistProfile.tsx` - Updated to use new review service
- `src/integrations/supabase/types.ts` - Added new table types

## Usage Examples

### 1. Basic Review Creation

```typescript
import { ReviewService } from '@/services/reviewService';

const reviewData = {
  rating: 5,
  reaction_emoji: '🔥',
  review_text: 'Amazing concert! The energy was incredible.',
  photos: ['https://example.com/photo1.jpg'],
  mood_tags: ['lit', 'energetic'],
  genre_tags: ['rock'],
  context_tags: ['first-time'],
  is_public: true
};

const review = await ReviewService.setEventReview(userId, eventId, reviewData);
```

### 2. Display Reviews for an Event

```tsx
import { ReviewList } from '@/components/ReviewList';

<ReviewList
  eventId={event.id}
  currentUserId={userId}
  onReviewClick={(reviewId) => console.log('Review clicked:', reviewId)}
  showEventInfo={true}
/>
```

### 3. Display Public Reviews with Filtering

```tsx
import { PublicReviewList } from '@/components/PublicReviewList';

<PublicReviewList
  eventId={event.id}
  currentUserId={userId}
  limit={20}
/>
```

### 4. Complete Reviews Section

```tsx
import { EventReviewsSection } from '@/components/EventReviewsSection';

<EventReviewsSection
  event={event}
  userId={userId}
  onReviewSubmitted={(reviewId) => console.log('Review submitted:', reviewId)}
/>
```

## Database Setup

### 1. Run the SQL Scripts

First, run the main table creation script:
```sql
-- Copy and paste the content from create_user_reviews_table.sql
```

Then run the functions script:
```sql
-- Copy and paste the content from create_review_functions.sql
```

### 2. Update Supabase Types

The types have been updated in `src/integrations/supabase/types.ts`. If you regenerate types from Supabase, make sure to include the new tables.

## Integration Steps

### 1. Add Review Button to Event Cards

```tsx
// In your event card component
<Button
  onClick={() => setReviewModalEvent(event)}
  variant="outline"
  size="sm"
>
  <Star className="w-4 h-4 mr-2" />
  Review
</Button>
```

### 2. Add Reviews Section to Event Details

```tsx
// In your event details page
<EventReviewsSection
  event={event}
  userId={currentUser?.id}
  onReviewSubmitted={() => {
    // Refresh reviews or show success message
  }}
/>
```

### 3. Update Navigation

Add a "My Reviews" section to user profiles:
```tsx
import { ReviewService } from '@/services/reviewService';

const [userReviews, setUserReviews] = useState([]);

useEffect(() => {
  const loadUserReviews = async () => {
    const result = await ReviewService.getUserReviewHistory(userId);
    setUserReviews(result.reviews);
  };
  loadUserReviews();
}, [userId]);
```

## Features Implemented

### Core Review Features
- ✅ Star rating system (1-5)
- ✅ Emoji reactions (🔥, 😍, 🤘, etc.)
- ✅ Text reviews (1-3 sentences)
- ✅ Photo/video upload support
- ✅ Categorized tagging system
- ✅ Privacy controls

### Social Engagement
- ✅ Like/heart functionality
- ✅ Comment system (threaded)
- ✅ Share tracking
- ✅ Real-time counters
- ✅ User profile integration

### UI/UX Features
- ✅ Responsive design
- ✅ Filtering and search
- ✅ Loading states
- ✅ Error handling
- ✅ Optimistic updates

## API Endpoints

The service provides these main methods:

### Review Management
- `setEventReview(userId, eventId, reviewData)` - Create/update review
- `getUserEventReview(userId, eventId)` - Get user's review for event
- `getEventReviews(eventId, userId?)` - Get all reviews for event
- `deleteEventReview(userId, eventId)` - Delete review

### Social Engagement
- `likeReview(userId, reviewId)` - Like a review
- `unlikeReview(userId, reviewId)` - Unlike a review
- `addComment(userId, reviewId, commentText, parentId?)` - Add comment
- `getReviewComments(reviewId)` - Get comments for review
- `shareReview(userId, reviewId, platform?)` - Share review

### Public Data
- `getPublicReviewsWithProfiles(eventId?, limit, offset)` - Get public reviews
- `getPopularTags(type)` - Get popular tags for filtering

## Next Steps

1. **Test the integration** with your existing components
2. **Add error handling** and toast notifications
3. **Implement file upload** for photos/videos
4. **Add real-time updates** using Supabase subscriptions
5. **Create admin dashboard** for review management
6. **Add analytics** for review engagement

## Troubleshooting

### Common Issues

1. **Type errors**: Make sure to update imports to use the new `ReviewService`
2. **Database errors**: Ensure all SQL scripts have been run
3. **RLS policies**: Check that Row Level Security policies are correctly set
4. **Missing components**: Import the new review components

### Debug Tips

- Check browser console for service errors
- Verify database permissions in Supabase
- Test with different user roles
- Check network requests in DevTools

## Support

For issues or questions about the review system integration, refer to:
- Service documentation in `src/services/reviewService.ts`
- Component examples in the created components
- Database schema in the SQL files
