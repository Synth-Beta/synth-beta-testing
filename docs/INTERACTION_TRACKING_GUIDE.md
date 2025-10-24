# Synth Interaction Tracking Guide

## Overview

This guide documents the comprehensive interaction tracking system for Synth's personalization engine. All user interactions are captured, validated, and stored for analytics and ML purposes.

## Core Concepts

### Interaction Event Structure

```typescript
interface InteractionEvent {
  sessionId?: string;        // Optional session identifier
  eventType: string;        // What the user did
  entityType: string;       // What they acted on
  entityId: string;         // ID of the entity
  metadata?: Record<string, any>; // Additional context
}
```

### Session Management

- Each user session has a unique ID
- Sessions track duration, interaction count, and engagement score
- Session metrics are calculated in real-time
- New sessions are created on page load or explicit restart

## Event Types

### Core Interaction Types

| Event Type | Description | Use Case |
|------------|-------------|----------|
| `view` | User viewed an entity | Page views, content consumption |
| `click` | User clicked on an entity | Engagement tracking |
| `like` | User liked an entity | Preference learning |
| `share` | User shared an entity | Viral content identification |
| `interest` | User marked interest | Intent tracking |
| `search` | User performed a search | Query analysis |
| `review` | User wrote a review | Content creation |
| `comment` | User added a comment | Social engagement |
| `navigate` | User navigated between pages | User flow analysis |
| `form_submit` | User submitted a form | Conversion tracking |
| `profile_update` | User updated profile | User data changes |
| `swipe` | User swiped (mobile) | Mobile interaction patterns |
| `follow` | User followed an entity | Social connections |
| `unfollow` | User unfollowed an entity | Relationship changes |
| `attendance` | User marked attendance | Event participation |
| `ticket_click` | User clicked ticket link | Revenue attribution |
| `streaming_top` | User's top streaming track | Music preference |
| `streaming_recent` | User's recent streaming | Music discovery |

### Entity Types

| Entity Type | Description | Common Metadata |
|-------------|-------------|-----------------|
| `event` | Concert/event | artist_name, venue_name, event_date, genres |
| `artist` | Musical artist | artist_name, genres, popularity_score |
| `venue` | Concert venue | venue_name, venue_city, venue_state |
| `review` | User review | rating, review_text, likes_count |
| `user` | User profile | user_name, location, preferences |
| `profile` | User profile page | profile_type, verification_status |
| `view` | Page/view | page_name, duration, scroll_depth |
| `form` | Form submission | form_type, success, field_count |
| `ticket_link` | Ticket purchase link | price, currency, vendor |
| `song` | Individual song | song_name, artist_names, duration_ms |
| `album` | Music album | album_name, artist_name, release_date |
| `playlist` | Music playlist | playlist_name, track_count, genres |

## Metadata Schemas

### Event Metadata

```typescript
interface EventMetadata {
  artist_name?: string;      // Name of the performing artist
  venue_name?: string;       // Name of the venue
  event_date?: string;       // ISO date string of the event
  genres?: string[];         // Musical genres
  city?: string;            // Event city
  state?: string;           // Event state
  country?: string;         // Event country
  capacity?: number;        // Venue capacity
  ticket_price?: number;    // Ticket price
  currency?: string;        // Currency code
}
```

### Artist Metadata

```typescript
interface ArtistMetadata {
  artist_name: string;      // Required: Artist name
  genres?: string[];        // Musical genres
  popularity_score?: number; // 0-100 popularity rating
  spotify_id?: string;      // Spotify artist ID
  apple_music_id?: string;  // Apple Music artist ID
  follower_count?: number;  // Number of followers
  verified?: boolean;       // Verification status
}
```

### Venue Metadata

```typescript
interface VenueMetadata {
  venue_name: string;       // Required: Venue name
  venue_city?: string;      // City
  venue_state?: string;     // State/Province
  venue_country?: string;   // Country
  capacity?: number;        // Maximum capacity
  venue_type?: string;      // indoor/outdoor/theater/etc
  coordinates?: {           // GPS coordinates
    lat: number;
    lng: number;
  };
}
```

### Review Metadata

```typescript
interface ReviewMetadata {
  rating: number;           // Required: 1-5 star rating
  review_text?: string;     // Review content
  likes_count?: number;     // Number of likes
  comments_count?: number;  // Number of comments
  is_helpful?: boolean;     // Helpfulness indicator
  sentiment?: string;       // positive/negative/neutral
  language?: string;        // Review language
}
```

### Ticket Link Metadata

```typescript
interface TicketLinkMetadata {
  price?: number;           // Ticket price
  currency?: string;        // Currency code (USD, EUR, etc.)
  vendor?: string;          // Ticket vendor (Ticketmaster, etc.)
  availability?: string;    // available/limited/sold_out
  fees?: number;           // Additional fees
  url?: string;            // Direct purchase URL
}
```

## Data Validation

### Validation Rules

1. **Required Fields**: All interactions must have `eventType`, `entityType`, and `entityId`
2. **Event Type Validation**: Must be one of the predefined valid event types
3. **Entity Type Validation**: Must be one of the predefined valid entity types
4. **Metadata Validation**: Based on entity type, metadata fields are validated
5. **Data Type Validation**: All metadata fields are type-checked

### Validation Examples

```typescript
// ✅ Valid event interaction
{
  eventType: 'view',
  entityType: 'event',
  entityId: 'event-123',
  metadata: {
    artist_name: 'Taylor Swift',
    venue_name: 'Madison Square Garden',
    event_date: '2024-06-15T20:00:00Z'
  }
}

// ❌ Invalid - missing required fields
{
  eventType: 'view'
  // Missing entityType and entityId
}

// ❌ Invalid - wrong event type
{
  eventType: 'invalid_type',
  entityType: 'event',
  entityId: 'event-123'
}

// ❌ Invalid - wrong metadata type
{
  eventType: 'review',
  entityType: 'review',
  entityId: 'review-123',
  metadata: {
    rating: 'five' // Should be number, not string
  }
}
```

## Session Analytics

### Session Metrics

```typescript
interface SessionMetrics {
  duration: number;         // Session duration in milliseconds
  interactionCount: number; // Total interactions in session
  engagementScore: number;  // 0-100 engagement score
  pageViews: number;        // Number of page views
  bounceRate: number;       // Bounce rate percentage
}
```

### Engagement Score Calculation

The engagement score is calculated based on:

1. **Interaction Count**: Base score from number of interactions (max 50 points)
2. **Session Duration**: Bonus points for longer sessions
   - 5+ minutes: +20 points
   - 15+ minutes: +20 points  
   - 30+ minutes: +10 points
3. **Session Quality**: Penalty for very short sessions (< 1 minute: 50% penalty)

## Error Handling

### Error Categories

1. **Validation Errors**: Invalid data format or missing required fields
2. **Network Errors**: Failed API calls or timeouts
3. **Database Errors**: Failed database operations
4. **Authentication Errors**: User not authenticated

### Error Logging

All errors are logged to the `system_errors` table with:

```typescript
interface SystemError {
  context: string;          // Error context
  error_message: string;     // Error message
  error_stack?: string;      // Stack trace
  metadata: object;          // Additional context
  user_id?: string;         // User ID if available
  timestamp: string;         // ISO timestamp
}
```

## Best Practices

### Adding New Interaction Types

1. **Define the Event Type**: Add to `VALID_EVENT_TYPES` array
2. **Create Metadata Schema**: Define expected metadata structure
3. **Add Validation Logic**: Implement validation in `validateMetadata()`
4. **Update Documentation**: Add to this guide
5. **Test Thoroughly**: Ensure validation works correctly

### Performance Considerations

1. **Batch Processing**: Interactions are queued and processed in batches
2. **Async Logging**: All logging is asynchronous to avoid blocking UI
3. **Error Resilience**: Logging failures don't break the application
4. **Session Management**: Efficient session tracking with minimal overhead

### Privacy and Security

1. **Data Minimization**: Only collect necessary data
2. **User Consent**: Respect user privacy preferences
3. **Data Retention**: Follow data retention policies
4. **Secure Storage**: All data stored securely in Supabase

## Usage Examples

### Basic Interaction Tracking

```typescript
import { trackInteraction } from '@/services/interactionTrackingService';

// Track a page view
trackInteraction.view('event', 'event-123', {
  artist_name: 'Taylor Swift',
  venue_name: 'Madison Square Garden'
});

// Track a like
trackInteraction.like('artist', 'artist-456', true, {
  artist_name: 'The Weeknd'
});

// Track a search
trackInteraction.search('Taylor Swift concerts', 'event', 'search-results', {
  query: 'Taylor Swift concerts',
  results_count: 15,
  filters: ['upcoming', 'nearby']
});
```

### Session Management

```typescript
import { interactionTracker } from '@/services/interactionTrackingService';

// Get current session metrics
const metrics = interactionTracker.getSessionMetrics();
console.log(`Session duration: ${metrics.duration}ms`);
console.log(`Engagement score: ${metrics.engagementScore}`);

// Start a new session
const newSessionId = interactionTracker.startNewSession();
```

### Error Handling

```typescript
// Errors are automatically logged and handled
// No need for manual error handling in most cases
trackInteraction.view('event', 'event-123', {
  artist_name: 'Taylor Swift'
}); // Will validate and log automatically
```

## Integration with Personalization Engine

### Data Flow

1. **User Interaction** → Interaction Tracking Service
2. **Validation** → Data Quality Check
3. **Storage** → Supabase `user_interactions` table
4. **Aggregation** → Analytics services
5. **ML Processing** → Personalization algorithms
6. **Recommendations** → User interface

### Key Metrics for ML

- **Engagement Patterns**: How users interact with content
- **Preference Signals**: Likes, follows, reviews
- **Behavioral Sequences**: User journey mapping
- **Session Quality**: Engagement depth and duration
- **Conversion Funnels**: Path from discovery to action

## Troubleshooting

### Common Issues

1. **Validation Errors**: Check event type and metadata format
2. **Missing Data**: Ensure all required fields are provided
3. **Performance Issues**: Check batch processing configuration
4. **Authentication**: Ensure user is logged in for user-specific tracking

### Debug Mode

Enable debug logging by setting:

```typescript
// In development
localStorage.setItem('synth_debug_interactions', 'true');
```

This will log all interaction attempts and validation results to the console.

## Future Enhancements

### Planned Features

1. **Real-time Analytics**: Live interaction streaming
2. **Advanced Segmentation**: Behavioral user segments
3. **Predictive Analytics**: ML-powered insights
4. **A/B Testing**: Built-in experimentation framework
5. **Cross-Platform Tracking**: Mobile app integration

### API Extensions

1. **Bulk Operations**: Batch interaction logging
2. **Custom Metrics**: User-defined interaction types
3. **Advanced Filtering**: Complex query capabilities
4. **Export Functions**: Data export for analysis

---

*This guide is maintained by the Synth development team. For questions or updates, please contact the analytics team.*
