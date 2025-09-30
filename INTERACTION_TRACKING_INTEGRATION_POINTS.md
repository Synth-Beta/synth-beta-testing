# Comprehensive Interaction Tracking Integration Points

This document lists every user-facing interactive element in the codebase that needs interaction tracking integration.

## 1. SEARCH INTERACTIONS

### UnifiedSearch.tsx
- **File**: `src/components/UnifiedSearch.tsx`
- **Function**: `handleInputChange` (line 95)
- **Event Type**: `search_typing`
- **Entity Type**: `search`
- **Entity ID**: `unified_search`
- **Metadata**: `{ query: value, queryLength: value.length }`

- **Function**: `performSearch` (line 57)
- **Event Type**: `search_execute`
- **Entity Type**: `search`
- **Entity ID**: `unified_search`
- **Metadata**: `{ query, resultCount: results.length, searchType: 'unified' }`

- **Function**: `handleArtistSelect` (line 242)
- **Event Type**: `search_select`
- **Entity Type**: `artist`
- **Entity ID**: `artist.id`
- **Metadata**: `{ query, rank, searchType: 'artist' }`

- **Function**: `sendFriendRequest` (line 274)
- **Event Type**: `friend_request_send`
- **Entity Type**: `user`
- **Entity ID**: `targetUserId`
- **Metadata**: `{ source: 'search' }`

### ArtistSearchBox.tsx
- **File**: `src/components/search/ArtistSearchBox.tsx`
- **Function**: `performSearch` (line 38)
- **Event Type**: `search_execute`
- **Entity Type**: `artist`
- **Entity ID**: `search_artist`
- **Metadata**: `{ query, resultCount }`

- **Function**: `handleArtistSelect` (line 80)
- **Event Type**: `search_select`
- **Entity Type**: `artist`
- **Entity ID**: `artist.id`
- **Metadata**: `{ query, rank }`

### VenueSearchBox.tsx
- **File**: `src/components/search/VenueSearchBox.tsx`
- **Function**: `performSearch`
- **Event Type**: `search_execute`
- **Entity Type**: `venue`
- **Entity ID**: `search_venue`
- **Metadata**: `{ query, resultCount }`

- **Function**: `handleVenueSelect`
- **Event Type**: `search_select`
- **Entity Type**: `venue`
- **Entity ID**: `venue.id`
- **Metadata**: `{ query, rank }`

## 2. FEED INTERACTIONS

### UnifiedFeed.tsx
- **File**: `src/components/UnifiedFeed.tsx`
- **Function**: `handleLike` (line 167)
- **Event Type**: `like`
- **Entity Type**: `event` or `review`
- **Entity ID**: `itemId`
- **Metadata**: `{ isLiked: !item.is_liked, itemType: item.type }`

- **Function**: `handleShare` (line 190)
- **Event Type**: `share`
- **Entity Type**: `event` or `review`
- **Entity ID**: `item.id`
- **Metadata**: `{ platform: 'clipboard', itemType: item.type }`

- **Function**: Event card click (line 343)
- **Event Type**: `view`
- **Entity Type**: `event`
- **Entity ID**: `item.event_data.id`
- **Metadata**: `{ source: 'feed' }`

- **Function**: Like button click (line 419)
- **Event Type**: `like`
- **Entity Type**: `event`
- **Entity ID**: `item.event_data.id`
- **Metadata**: `{ isLiked: !item.is_liked, source: 'feed' }`

- **Function**: Comments button click (line 448)
- **Event Type**: `comment_view`
- **Entity Type**: `event`
- **Entity ID**: `item.event_data.id`
- **Metadata**: `{ source: 'feed' }`

- **Function**: Share button click (line 465)
- **Event Type**: `share`
- **Entity Type**: `event`
- **Entity ID**: `item.event_data.id`
- **Metadata**: `{ platform: 'clipboard', source: 'feed' }`

## 3. EVENT INTERACTIONS

### EventCard.tsx
- **File**: `src/components/EventCard.tsx`
- **Function**: `handleSwipe` (line 29)
- **Event Type**: `swipe`
- **Entity Type**: `event`
- **Entity ID**: `event.id`
- **Metadata**: `{ direction, category: event.category }`

### EventDetailsModal.tsx
- **File**: `src/components/events/EventDetailsModal.tsx`
- **Function**: Interest toggle button (line ~200)
- **Event Type**: `interest`
- **Entity Type**: `event`
- **Entity ID**: `event.id`
- **Metadata**: `{ isInterested: !isInterested, source: 'modal' }`

- **Function**: Review button click
- **Event Type**: `review_start`
- **Entity Type**: `event`
- **Entity ID**: `event.id`
- **Metadata**: `{ source: 'modal' }`

- **Function**: Share button click
- **Event Type**: `share`
- **Entity Type**: `event`
- **Entity ID**: `event.id`
- **Metadata**: `{ platform: 'clipboard', source: 'modal' }`

### EventCommentsModal.tsx
- **File**: `src/components/events/EventCommentsModal.tsx`
- **Function**: `handleAddComment` (line 48)
- **Event Type**: `comment`
- **Entity Type**: `event`
- **Entity ID**: `eventId`
- **Metadata**: `{ commentLength: newComment.length, source: 'modal' }`

### EventInterestCard.tsx
- **File**: `src/components/events/EventInterestCard.tsx`
- **Function**: `onToggleInterest` (line 15)
- **Event Type**: `interest`
- **Entity Type**: `event`
- **Entity ID**: `event.id`
- **Metadata**: `{ isInterested: !isInterested, source: 'card' }`

## 4. REVIEW INTERACTIONS

### EventReviewForm.tsx
- **File**: `src/components/reviews/EventReviewForm.tsx`
- **Function**: `handleSubmit` (line 92)
- **Event Type**: `review_submit`
- **Entity Type**: `event`
- **Entity ID**: `eventId`
- **Metadata**: `{ 
    reviewType: formData.reviewType,
    rating: formData.rating,
    performanceRating: formData.performanceRating,
    venueRating: formData.venueRating,
    overallExperienceRating: formData.overallExperienceRating,
    hasText: !!formData.reviewText,
    textLength: formData.reviewText?.length || 0,
    isPublic: formData.isPublic
  }`

### ReviewCard.tsx
- **File**: `src/components/reviews/ReviewCard.tsx`
- **Function**: `handleLike` (line 45)
- **Event Type**: `like`
- **Entity Type**: `review`
- **Entity ID**: `review.id`
- **Metadata**: `{ isLiked: !isLiked }`

- **Function**: `handleComment` (line 70)
- **Event Type**: `comment_view`
- **Entity Type**: `review`
- **Entity ID**: `review.id`
- **Metadata**: `{ action: showComments ? 'close' : 'open' }`

- **Function**: `handleAddComment` (line 87)
- **Event Type**: `comment`
- **Entity Type**: `review`
- **Entity ID**: `review.id`
- **Metadata**: `{ commentLength: newComment.length }`

- **Function**: `handleShare` (line 120)
- **Event Type**: `share`
- **Entity Type**: `review`
- **Entity ID**: `review.id`
- **Metadata**: `{ platform: 'clipboard' }`

### ReviewFormSteps/EventDetailsStep.tsx
- **File**: `src/components/reviews/ReviewFormSteps/EventDetailsStep.tsx`
- **Function**: `handleArtistSelect` (line 19)
- **Event Type**: `review_artist_select`
- **Entity Type**: `artist`
- **Entity ID**: `artist.id`
- **Metadata**: `{ source: 'review_form' }`

- **Function**: `handleVenueSelect` (line 23)
- **Event Type**: `review_venue_select`
- **Entity Type**: `venue`
- **Entity ID**: `venue.id`
- **Metadata**: `{ source: 'review_form' }`

- **Function**: `handleDateChange` (line 28)
- **Event Type**: `review_date_select`
- **Entity Type**: `event`
- **Entity ID**: `formData.selectedArtist?.id + formData.selectedVenue?.id`
- **Metadata**: `{ eventDate: e.target.value }`

### ReviewFormSteps/RatingStep.tsx
- **File**: `src/components/reviews/ReviewFormSteps/RatingStep.tsx`
- **Function**: Rating change handlers
- **Event Type**: `review_rating_change`
- **Entity Type**: `event`
- **Entity ID**: `eventId`
- **Metadata**: `{ 
    ratingType: 'performance' | 'venue' | 'overall_experience',
    rating: newRating,
    previousRating: oldRating
  }`

## 5. PROFILE INTERACTIONS

### ProfileEdit.tsx
- **File**: `src/components/ProfileEdit.tsx`
- **Function**: `handleSave` (line 88)
- **Event Type**: `profile_update`
- **Entity Type**: `profile`
- **Entity ID**: `currentUserId`
- **Metadata**: `{ 
    fieldsChanged: Object.keys(formData),
    hasBio: !!formData.bio,
    hasInstagram: !!formData.instagram_handle,
    hasMusicProfile: !!formData.music_streaming_profile
  }`

- **Function**: `handleInputChange` (line 157)
- **Event Type**: `profile_field_edit`
- **Entity Type**: `profile`
- **Entity ID**: `currentUserId`
- **Metadata**: `{ field, valueLength: value.length }`

### ProfileView.tsx
- **File**: `src/components/ProfileView.tsx`
- **Function**: Edit button click
- **Event Type**: `profile_edit_start`
- **Entity Type**: `profile`
- **Entity ID**: `userId`
- **Metadata**: `{ source: 'profile_view' }`

## 6. NAVIGATION INTERACTIONS

### Navigation.tsx
- **File**: `src/components/Navigation.tsx`
- **Function**: `onViewChange` (line 25)
- **Event Type**: `navigate`
- **Entity Type**: `view`
- **Entity ID**: `id`
- **Metadata**: `{ fromView: currentView, toView: id }`

## 7. CHAT INTERACTIONS

### UnifiedChatView.tsx
- **File**: `src/components/chat/UnifiedChatView.tsx`
- **Function**: Message send
- **Event Type**: `message_send`
- **Entity Type**: `chat`
- **Entity ID**: `chatId`
- **Metadata**: `{ messageLength, isGroupChat }`

- **Function**: Chat selection
- **Event Type**: `chat_select`
- **Entity Type**: `chat`
- **Entity ID**: `chatId`
- **Metadata**: `{ isGroupChat }`

## 8. FRIEND INTERACTIONS

### FriendProfileCard.tsx
- **File**: `src/components/FriendProfileCard.tsx`
- **Function**: Friend request send
- **Event Type**: `friend_request_send`
- **Entity Type**: `user`
- **Entity ID**: `userId`
- **Metadata**: `{ source: 'profile_card' }`

- **Function**: Profile view
- **Event Type**: `profile_view`
- **Entity Type**: `user`
- **Entity ID**: `userId`
- **Metadata**: `{ source: 'friend_card' }`

## 9. MODAL INTERACTIONS

### EventReviewModal.tsx
- **File**: `src/components/EventReviewModal.tsx`
- **Function**: Modal open
- **Event Type**: `modal_open`
- **Entity Type**: `event`
- **Entity ID**: `event.id`
- **Metadata**: `{ modalType: 'review' }`

- **Function**: Modal close
- **Event Type**: `modal_close`
- **Entity Type**: `event`
- **Entity ID**: `event.id`
- **Metadata**: `{ modalType: 'review' }`

## 10. FORM INTERACTIONS

### Various form components
- **Event Type**: `form_submit`
- **Entity Type**: `form_type`
- **Entity ID**: `form_id`
- **Metadata**: `{ success, fieldCount, validationErrors }`

- **Event Type**: `form_field_change`
- **Entity Type**: `form_type`
- **Entity ID**: `form_id`
- **Metadata**: `{ field, valueLength }`

## Implementation Notes

1. **Import the tracking service** in each component:
   ```typescript
   import { trackInteraction } from '@/services/interactionTrackingService';
   ```

2. **Add tracking calls** at the beginning of each handler function:
   ```typescript
   const handleLike = async () => {
     trackInteraction.like('event', eventId, !isLiked, { source: 'feed' });
     // ... existing logic
   };
   ```

3. **Use batch tracking** for high-frequency events like search typing:
   ```typescript
   const handleInputChange = (e) => {
     trackInteraction.search(e.target.value, 'search', 'unified_search', { 
       queryLength: e.target.value.length 
     });
     // ... existing logic
   };
   ```

4. **Include relevant metadata** to provide context for ML algorithms:
   - Position in lists
   - Time spent on page
   - Previous actions
   - User context (location, device, etc.)

This comprehensive tracking will provide rich data for building effective recommendation systems and understanding user behavior patterns.
