# Venue Reviews Implementation

This document describes the implementation of venue-specific review functionality that allows users to review both artists and venues in a single, unified review process.

## Overview

The venue review system extends the existing review system to support:
- **Separate ratings** for artist performance and venue experience
- **Combined reviews** that rate both aspects in one flow
- **Venue-specific reviews** for rating venues independently
- **Artist-specific reviews** for rating performances independently
- **Unified review interface** with a single, simple question for users

## Key Features

### 1. Dual Rating System
- **Artist Rating (1-5 stars)**: Rates the performance, energy, vocals, stage presence
- **Venue Rating (1-5 stars)**: Rates sound quality, staff, facilities, accessibility
- **Overall Rating**: Automatically calculated as average of both ratings

### 2. Review Types
- **Event Review**: Rates both artist and venue (default)
- **Venue Review**: Rates only the venue experience
- **Artist Review**: Rates only the artist performance

### 3. Enhanced Review Content
- **General review text**: Overall experience description
- **Artist-specific text**: Performance details (300 chars max)
- **Venue-specific text**: Venue experience details (300 chars max)
- **Tagging system**: Pre-defined tags for consistent categorization

## Database Schema Changes

### New Columns in `user_reviews` table:
```sql
venue_id UUID                    -- Reference to venue_profile table
artist_rating INTEGER           -- Artist performance rating (1-5)
venue_rating INTEGER           -- Venue experience rating (1-5)
review_type TEXT               -- 'event', 'venue', or 'artist'
venue_tags TEXT[]             -- Venue-specific tags
artist_tags TEXT[]            -- Artist-specific tags
```

### New Functions:
- `validate_review_data()`: Ensures proper rating constraints
- `get_venue_stats(venue_uuid)`: Returns venue statistics
- `get_popular_venue_tags(venue_uuid)`: Returns popular tags

### New Views:
- `venue_reviews_with_profiles`: Enhanced view with venue data
- Updated `public_reviews_with_profiles`: Includes new rating fields

## Component Architecture

### 1. Updated Review Form Steps

#### `RatingStep.tsx`
- **Dual rating interface**: Separate star ratings for artist and venue
- **Color-coded stars**: Yellow for artist, green for venue
- **Auto-calculated overall**: Shows combined rating
- **Smart validation**: Requires appropriate ratings based on review type

#### `ReviewContentStep.tsx`
- **Tabbed interface**: General, Artist, Venue tabs
- **Separate text areas**: Dedicated spaces for different aspects
- **Tag selection**: Pre-defined tags for consistent categorization
- **Live preview**: Shows combined review as user types

#### `EventDetailsStep.tsx`
- **Enhanced validation**: Supports different review types
- **Venue integration**: Uses existing venue search functionality

### 2. New Components

#### `VenueReviewCard.tsx`
- **Dual rating display**: Shows both artist and venue ratings
- **Smart layout**: Adapts based on review type
- **Tag display**: Color-coded tags for different aspects
- **Engagement stats**: Likes, comments, shares

#### `VenueReviewsDemo.tsx`
- **Venue statistics**: Average ratings, review count
- **Popular tags**: Trending venue characteristics
- **Review list**: Filtered reviews for specific venue
- **Write review**: Direct venue review creation

### 3. Enhanced Services

#### `reviewService.ts`
- **Venue support**: New methods for venue-specific operations
- **Enhanced queries**: Support for venue filtering
- **Statistics**: Venue performance metrics
- **Tag analytics**: Popular tag tracking

## Usage Examples

### 1. Writing a Complete Event Review
```typescript
const reviewData = {
  review_type: 'event',
  artist_rating: 5,      // Amazing performance
  venue_rating: 3,       // Average venue
  rating: 4,             // Overall (calculated)
  review_text: 'Great show overall...',
  artist_tags: ['amazing-performance', 'high-energy'],
  venue_tags: ['poor-sound', 'cramped'],
  is_public: true
};
```

### 2. Venue-Only Review
```typescript
const reviewData = {
  review_type: 'venue',
  venue_rating: 4,       // Good venue
  rating: 4,             // Same as venue rating
  review_text: 'Great sound system and friendly staff...',
  venue_tags: ['excellent-sound', 'great-staff'],
  is_public: true
};
```

### 3. Getting Venue Statistics
```typescript
const stats = await ReviewService.getVenueStats(venueId);
// Returns: total_reviews, average_venue_rating, average_artist_rating, etc.
```

## User Experience Flow

### 1. Single Review Process
1. **Event Details**: Select artist and venue
2. **Dual Rating**: Rate both artist (⭐) and venue (⭐) 
3. **Review Content**: Write in General/Artist/Venue tabs
4. **Privacy**: Choose public/private and submit

### 2. Simple Question Approach
The system presents one main question: **"How would you rate your concert experience?"**

But breaks it down into:
- **Artist Performance**: How was the show?
- **Venue Experience**: How was the location?

This maintains simplicity while capturing detailed feedback.

## Benefits

### For Users
- **Single flow**: One process covers both aspects
- **Detailed feedback**: Separate ratings provide nuanced reviews
- **Helpful tags**: Quick categorization without typing
- **Better discovery**: Find venues with great sound, artists with high energy

### For Venue Owners
- **Specific feedback**: Know exactly what needs improvement
- **Performance tracking**: Monitor venue experience over time
- **Competitive analysis**: Compare with other venues
- **Staff recognition**: Highlight great service

### For Artists
- **Performance insights**: Understand audience reception
- **Venue feedback**: Learn which venues enhance their shows
- **Fan engagement**: Direct connection with audience experience

## Implementation Status

✅ **Database Schema**: Migration created and ready to deploy
✅ **Type Definitions**: Complete TypeScript interfaces
✅ **Service Layer**: Enhanced ReviewService with venue support
✅ **UI Components**: Updated forms and display components
✅ **Review Process**: Unified dual-rating flow
⏳ **Database Migration**: Needs Docker/Supabase to be running
⏳ **Testing**: Ready for integration testing

## Next Steps

1. **Deploy Migration**: Run the database migration when Supabase is available
2. **Test Integration**: Verify the complete review flow works
3. **UI Polish**: Fine-tune the review interface based on user feedback
4. **Analytics**: Add venue performance dashboards
5. **Mobile Optimization**: Ensure great experience on all devices

## Migration Command

When ready to deploy:
```bash
npx supabase db reset  # Applies all migrations including venue reviews
```

This implementation provides a comprehensive venue review system that's both powerful for data analysis and simple for users, maintaining the "one simple question" approach while capturing detailed, actionable feedback.
