# Event Card and Artist Profile Integration

This document explains how to use the new event card and artist profile functionality that integrates with the Jambase API.

## Overview

The new system provides:
- **JamBaseEventCard**: Displays individual events with interest tracking and review functionality
- **ArtistProfile**: Shows an artist's complete profile with their upcoming and past events
- **EventReviewModal**: Allows users to review past events they attended
- **UserEventService**: Manages user interests and reviews in Supabase

## Components

### JamBaseEventCard

A card component that displays event information with interactive features.

```tsx
import { JamBaseEventCard } from '@/components/JamBaseEventCard';

<JamBaseEventCard
  event={jambaseEvent}
  onInterestToggle={(eventId, interested) => {
    // Handle interest toggle
  }}
  onReview={(eventId) => {
    // Handle review action
  }}
  isInterested={false}
  hasReviewed={false}
  showInterestButton={true}
  showReviewButton={true}
/>
```

**Props:**
- `event`: JamBaseEvent object
- `onInterestToggle`: Callback for interest toggle (upcoming events)
- `onReview`: Callback for review action (past events)
- `isInterested`: Whether user is interested in the event
- `hasReviewed`: Whether user has reviewed the event
- `showInterestButton`: Show interest button for upcoming events
- `showReviewButton`: Show review button for past events

### ArtistProfile

A comprehensive profile view showing an artist's information and events.

```tsx
import { ArtistProfile } from '@/components/ArtistProfile';

<ArtistProfile
  artist={artist}
  onBack={() => setShowProfile(false)}
  onInterestToggle={(eventId, interested) => {
    // Handle interest toggle
  }}
  onReview={(eventId) => {
    // Handle review action
  }}
  userId={userId}
/>
```

**Props:**
- `artist`: Artist object
- `onBack`: Callback when user wants to go back
- `onInterestToggle`: Callback for interest toggle
- `onReview`: Callback for review action
- `userId`: Current user ID for tracking interests/reviews

### EventReviewModal

A modal for users to review past events they attended.

```tsx
import { EventReviewModal } from '@/components/EventReviewModal';

<EventReviewModal
  event={selectedEvent}
  userId={userId}
  isOpen={isModalOpen}
  onClose={() => setIsModalOpen(false)}
  onReviewSubmitted={(review) => {
    // Handle review submission
  }}
/>
```

## Services

### JamBaseEventsService

Service for fetching events from Jambase API and managing them in Supabase.

```tsx
import { JamBaseEventsService } from '@/services/jambaseEventsService';

// Get events for an artist
const events = await JamBaseEventsService.getOrFetchArtistEvents('Taylor Swift', {
  page: 1,
  perPage: 20,
  eventType: 'upcoming'
});

// Search events with parameters
const searchResults = await JamBaseEventsService.searchEvents({
  artistName: 'The Beatles',
  eventDateFrom: '2024-01-01',
  eventDateTo: '2024-12-31',
  page: 1,
  perPage: 40
});
```

### UserEventService

Service for managing user interests and reviews.

```tsx
import { UserEventService } from '@/services/userEventService';

// Set user interest in an event
await UserEventService.setEventInterest(userId, eventId, true);

// Check if user is interested
const isInterested = await UserEventService.isUserInterested(userId, eventId);

// Add a review
await UserEventService.setEventReview(userId, eventId, {
  rating: 5,
  review_text: 'Amazing concert!',
  was_there: true
});

// Get user's interested events
const interestedEvents = await UserEventService.getUserInterestedEvents(userId);
```

## Database Schema

The system uses the following Supabase tables:

### jambase_events
Stores event data from Jambase API:
- `jambase_event_id`: Unique Jambase event ID
- `title`: Event title
- `artist_name`: Artist name
- `venue_name`: Venue name
- `event_date`: Event date
- `description`: Event description
- `genres`: Array of genres
- `ticket_available`: Whether tickets are available
- And more...

### user_jambase_events
Tracks user interests in events:
- `user_id`: User ID
- `jambase_event_id`: Event ID
- `interested`: Boolean interest flag

### user_event_reviews
Stores user reviews of events:
- `user_id`: User ID
- `jambase_event_id`: Event ID
- `rating`: 1-5 star rating
- `review_text`: Optional review text
- `was_there`: Whether user attended the event

## Integration Examples

### Basic Artist Profile Integration

```tsx
import React, { useState } from 'react';
import { ArtistProfile } from '@/components/ArtistProfile';
import { Artist } from '@/types/concertSearch';

function MyComponent() {
  const [selectedArtist, setSelectedArtist] = useState<Artist | null>(null);
  const [showProfile, setShowProfile] = useState(false);

  const handleViewProfile = (artist: Artist) => {
    setSelectedArtist(artist);
    setShowProfile(true);
  };

  const handleBack = () => {
    setShowProfile(false);
    setSelectedArtist(null);
  };

  if (showProfile && selectedArtist) {
    return (
      <ArtistProfile
        artist={selectedArtist}
        onBack={handleBack}
        onInterestToggle={(eventId, interested) => {
          console.log(`User interested in ${eventId}: ${interested}`);
        }}
        onReview={(eventId) => {
          console.log(`User wants to review ${eventId}`);
        }}
        userId="user-123"
      />
    );
  }

  return (
    <div>
      {/* Your artist selection UI */}
    </div>
  );
}
```

### Using with ArtistSelector

```tsx
import { ArtistSelector } from '@/components/ArtistSelector';

<ArtistSelector
  artist={artist}
  onViewEvents={(artist) => {
    // Open ArtistProfile for this artist
    setViewingArtist(artist);
  }}
  onRemove={() => {
    // Remove artist from selection
  }}
  onToggleFavorite={(artistId) => {
    // Toggle favorite status
  }}
  isFavorite={false}
/>
```

## Features

### Upcoming Events
- View upcoming concerts and festivals
- Express interest in events
- See event details, venue info, and ticket availability
- Track events you're interested in

### Past Events
- Browse past concerts and festivals
- Review events you attended
- Rate events with 1-5 stars
- Write detailed reviews
- Mark "I was there" status

### Artist Information
- View artist profile with bio and genres
- See total event count
- Browse all events (past and upcoming)
- JamBase verification status

## Error Handling

The components include comprehensive error handling:
- API failures fall back to cached data
- Loading states for better UX
- Error messages for failed operations
- Graceful degradation when services are unavailable

## Performance Considerations

- Events are cached in Supabase after first fetch
- Pagination for large event lists
- Debounced search for artist queries
- Lazy loading of user data
- Optimistic updates for better UX

## Future Enhancements

- Real-time updates for event changes
- Social features (see friends' interests)
- Event recommendations
- Calendar integration
- Push notifications for interested events
