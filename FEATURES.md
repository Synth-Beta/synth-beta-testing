# Features Guide

This comprehensive guide covers all the core features and functionality of the PlusOne Event Crew application.

## Core Features Overview

### 🎵 Event Discovery
- **Concert Search**: Find concerts by artist, venue, or location
- **JamBase Integration**: Real-time concert data from JamBase API
- **Location-based Search**: Find events near you with radius search
- **Event Filtering**: Filter by date, genre, venue type, and more

### 👥 Social Features
- **User Profiles**: Create and manage your profile
- **Friends System**: Connect with other music lovers
- **Event Matching**: Find people interested in the same events
- **Chat System**: Message potential event buddies

### ⭐ Review System
- **Event Reviews**: Rate and review concerts you've attended
- **Venue Reviews**: Separate ratings for venue experience
- **Artist Reviews**: Rate artist performances
- **Post-Submit Ranking**: Rank reviews with the same rating
- **Social Engagement**: Like, comment, and share reviews

### 🎧 Music Integration
- **Streaming Profiles**: Connect Spotify and Apple Music
- **Music Preferences**: Sync your listening history
- **Recommendation Engine**: Get personalized event suggestions
- **Artist Profiles**: Rich artist information and upcoming shows

## Detailed Feature Documentation

## 1. Event Discovery & Search

### Concert Search
The application provides comprehensive concert search functionality:

**Search Methods:**
- **Artist Search**: Find concerts by specific artists
- **Venue Search**: Search by venue name or location
- **Location Search**: Find events within a radius of your location
- **Date Range**: Filter events by date range

**Search Components:**
- `ConcertSearchForm.tsx` - Main search interface
- `EventCard.tsx` - Individual event display
- `EventList.tsx` - List of search results
- `LocationSearch.tsx` - Location-based search

**API Integration:**
- JamBase API for concert data
- Supabase for local event storage
- Geocoding for location-based searches

### Event Display
Events are displayed with rich information:
- Artist name and image
- Venue name and location
- Event date and time
- Ticket availability
- User interest indicators

## 2. Review System

### Review Types
The system supports three types of reviews:

#### Event Reviews (Default)
Rate both artist performance and venue experience:
```typescript
{
  review_type: 'event',
  artist_rating: 5,      // Performance rating
  venue_rating: 4,       // Venue experience rating
  rating: 4.5,           // Overall rating (calculated)
  review_text: 'Amazing show...',
  artist_tags: ['high-energy', 'great-vocals'],
  venue_tags: ['excellent-sound', 'friendly-staff']
}
```

#### Venue Reviews
Rate only the venue experience:
```typescript
{
  review_type: 'venue',
  venue_rating: 4,
  rating: 4,
  review_text: 'Great sound system...',
  venue_tags: ['excellent-sound', 'great-staff']
}
```

#### Artist Reviews
Rate only the artist performance:
```typescript
{
  review_type: 'artist',
  artist_rating: 5,
  rating: 5,
  review_text: 'Incredible performance...',
  artist_tags: ['amazing-performance', 'high-energy']
}
```

### Post-Submit Ranking Feature

When users submit reviews with ratings that match existing reviews, they can rank them:

**How It Works:**
1. User submits a 4.5★ review
2. System checks for other 4.5★ reviews
3. If found, shows ranking modal
4. User drags to reorder from favorite to least favorite
5. Rankings saved to database

**Benefits:**
- Captures nuanced preferences within same rating
- Improves recommendation accuracy
- Optional feature (can skip)

**Components:**
- `PostSubmitRankingModal.tsx` - Ranking interface
- `EventReviewForm.tsx` - Triggers ranking modal
- `ReviewService.ts` - Handles ranking logic

### Review Components

#### Review Form Steps
1. **Event Details Step**: Select artist and venue
2. **Rating Step**: Rate performance and venue separately
3. **Content Step**: Write review text and select tags
4. **Privacy Step**: Choose public/private and submit

#### Review Display
- `ReviewCard.tsx` - Individual review display
- `ReviewList.tsx` - List of reviews for an event
- `PublicReviewList.tsx` - Filterable public reviews
- `EventReviewsSection.tsx` - Complete reviews section

### Social Engagement
Reviews support social features:
- **Likes**: Heart/like functionality
- **Comments**: Threaded comment system
- **Shares**: Share reviews with friends
- **Reactions**: Emoji reactions (🔥, 😍, 🤘, etc.)

## 3. User Profiles & Social Features

### User Profiles
Comprehensive user profiles include:
- Basic information (name, bio, location)
- Profile photos and avatars
- Music streaming preferences
- Event history and reviews
- Friends and connections

### Friends System
Connect with other users:
- Send friend requests
- Accept/decline requests
- View friends' event activity
- Share events with friends
- Chat with friends

### Profile Components
- `ProfilePage.tsx` - Main profile view
- `ProfileEdit.tsx` - Edit profile information
- `ProfileStats.tsx` - User statistics
- `FriendsList.tsx` - Friends management

## 4. Music Integration

### Streaming Service Integration
Connect your music streaming accounts:

#### Spotify Integration
- OAuth authentication
- Sync top tracks, artists, albums
- Recent listening history
- Genre preferences
- Playlist integration

#### Apple Music Integration
- MusicKit JS integration
- Library data sync
- Recent plays tracking
- Storefront-specific data
- Enhanced metadata

### Music Profile Components
- `UnifiedStreamingStats.tsx` - Auto-detects streaming service
- `SpotifyStats.tsx` - Spotify-specific data
- `AppleMusicStats.tsx` - Apple Music-specific data
- `MusicPreferences.tsx` - Genre and preference settings

### Recommendation Engine
Uses music data for personalized recommendations:
- Similar music taste matching
- Event recommendations based on listening history
- Artist discovery based on preferences
- Venue recommendations based on music taste

## 5. Location & Venue Features

### Location Search
Find events near you:
- Radius-based search
- City and state filtering
- Zip code lookup
- Map integration
- Distance calculations

### Venue Management
Comprehensive venue system:
- Venue profiles with details
- Venue reviews and ratings
- Venue statistics and analytics
- Venue search and discovery
- Venue-venue relationships

### Location Components
- `LocationSearch.tsx` - Location-based search
- `VenueCard.tsx` - Venue display
- `VenueProfile.tsx` - Detailed venue information
- `MapView.tsx` - Map-based event discovery

## 6. Chat & Communication

### Chat System
Real-time messaging between users:
- Direct messages
- Group chats for events
- Event-specific discussions
- File and image sharing
- Message history

### Chat Components
- `ChatView.tsx` - Main chat interface
- `MessageList.tsx` - Message display
- `MessageInput.tsx` - Message composition
- `ChatList.tsx` - Chat overview

## 7. Event Management

### Event Interest System
Track user interest in events:
- Mark events as interested
- Get notifications for interested events
- Share interested events
- Track event attendance

### Event Components
- `EventCard.tsx` - Event display
- `EventDetails.tsx` - Detailed event view
- `InterestButton.tsx` - Interest toggle
- `EventNotifications.tsx` - Event alerts

## 8. Search & Discovery

### Unified Search
Comprehensive search across all content:
- Artist search with JamBase integration
- Venue search with database lookup
- Event search with filtering
- User search for social features
- Review search for discovery

### Search Components
- `UnifiedSearch.tsx` - Main search interface
- `SearchResults.tsx` - Search results display
- `SearchFilters.tsx` - Advanced filtering
- `SearchSuggestions.tsx` - Autocomplete suggestions

## 9. Analytics & Insights

### User Analytics
Track user behavior and preferences:
- Event attendance patterns
- Review patterns and preferences
- Music taste evolution
- Social interaction metrics
- Engagement statistics

### Venue Analytics
Venue performance metrics:
- Average ratings over time
- Review sentiment analysis
- Popular tags and characteristics
- User demographic insights
- Competitive analysis

## 10. Mobile & Responsive Design

### Mobile-First Design
Optimized for mobile devices:
- Touch-friendly interfaces
- Responsive layouts
- Mobile-specific gestures
- Offline functionality
- Progressive Web App features

### Responsive Components
All components are mobile-responsive:
- Adaptive layouts
- Touch-optimized controls
- Mobile navigation
- Swipe gestures
- Mobile-specific UI patterns

## Technical Implementation

### State Management
- React Context for global state
- Local state for component-specific data
- Supabase real-time subscriptions
- Optimistic updates for better UX

### Data Flow
1. User interaction triggers action
2. Service layer processes request
3. Supabase handles data persistence
4. Real-time updates propagate to UI
5. Optimistic updates provide immediate feedback

### Performance Optimizations
- Lazy loading for large lists
- Image optimization and caching
- Database query optimization
- CDN for static assets
- Service worker for offline support

## Testing & Quality Assurance

### Testing Strategy
- Unit tests for services and utilities
- Integration tests for API endpoints
- Component tests for UI interactions
- End-to-end tests for user flows
- Performance testing for scalability

### Quality Metrics
- Code coverage targets
- Performance benchmarks
- Accessibility compliance
- Cross-browser compatibility
- Mobile device testing

## Future Enhancements

### Planned Features
- **AI Recommendations**: Machine learning-based suggestions
- **Event Planning**: Group event coordination tools
- **Social Features**: Enhanced community features
- **Analytics Dashboard**: User and venue insights
- **Mobile App**: Native iOS and Android apps

### Technical Improvements
- **Real-time Updates**: WebSocket integration
- **Offline Support**: Enhanced offline functionality
- **Performance**: Further optimization
- **Accessibility**: Enhanced accessibility features
- **Internationalization**: Multi-language support

## Getting Started

### For Developers
1. Read [Development Setup](./DEV_SETUP.md)
2. Review [Integrations](./INTEGRATIONS.md)
3. Check [Brand Guide](./BRAND_GUIDE.md)
4. Explore the codebase structure

### For Users
1. Create an account
2. Connect your music streaming service
3. Search for events
4. Write reviews and connect with others

## Support

For questions about features:
1. Check this documentation
2. Review component source code
3. Test with demo components
4. Contact the development team

## Related Documentation

- [Development Setup](./DEV_SETUP.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Integrations](./INTEGRATIONS.md)
- [Brand Guide](./BRAND_GUIDE.md)
- [Photo Integration](./PHOTO_INTEGRATION_GUIDE.md)
