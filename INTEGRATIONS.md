# Integrations Guide

This guide covers all external API integrations and third-party services used in the PlusOne Event Crew application.

## Overview

The application integrates with several external services to provide comprehensive functionality:

- **Supabase**: Database and authentication
- **JamBase API**: Concert and artist data
- **Spotify API**: Music streaming integration
- **Apple Music API**: Music streaming integration
- **Cities API**: Location and geocoding services
- **Vercel**: Deployment and hosting

## 1. Supabase Integration

### Overview
Supabase serves as the primary backend service, providing:
- PostgreSQL database
- Real-time subscriptions
- Authentication and user management
- Row Level Security (RLS)
- Storage for files and media

### Configuration
```env
VITE_SUPABASE_URL=https://glpiolbrafqikqhnseto.supabase.co
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Key Features
- **Real-time Database**: Live updates across all clients
- **Authentication**: User registration, login, and session management
- **Storage**: File uploads for photos and avatars
- **Edge Functions**: Serverless functions for complex operations

### Database Schema
Core tables include:
- `profiles` - User profile information
- `user_reviews` - Event and venue reviews
- `artist_profile` - Artist information from JamBase
- `venue_profile` - Venue information
- `streaming_profiles` - Music streaming data
- `friends` - User connections

### Services
- `supabaseClient.ts` - Main Supabase client
- `authService.ts` - Authentication operations
- `databaseService.ts` - Database operations
- `storageService.ts` - File upload operations

## 2. JamBase API Integration

### Overview
JamBase provides comprehensive concert and artist data:
- Real-time concert listings
- Artist information and metadata
- Venue data and details
- Event search and filtering

### Configuration
```env
VITE_JAMBASE_API_KEY=e7ed3a9b-e73a-446e-b7c6-a96d1c53a030
```

### API Endpoints Used
- `GET /artists/search` - Search for artists
- `GET /artists/id/{id}` - Get artist details
- `GET /events/search` - Search for events
- `GET /venues/search` - Search for venues

### Key Features
- **Artist Search**: Real-time artist suggestions with fuzzy matching
- **Event Data**: Comprehensive concert information
- **Venue Information**: Detailed venue profiles
- **Database Population**: Automatic artist profile creation

### Services
- `jambaseService.ts` - Main JamBase API client
- `jambaseArtistSearchService.ts` - Artist search functionality
- `jambaseEventService.ts` - Event data operations

### Data Flow
1. User searches for artist/event
2. JamBase API returns results
3. System populates local database
4. Cached data used for subsequent searches

## 3. Spotify API Integration

### Overview
Spotify integration provides music streaming data:
- User's top tracks, artists, and albums
- Recently played music
- Playlist information
- Genre preferences

### Configuration
```env
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
VITE_SPOTIFY_REDIRECT_URI=http://localhost:8080/auth/spotify/callback
```

### OAuth Flow
1. User clicks "Connect Spotify"
2. Redirected to Spotify authorization
3. User grants permissions
4. Authorization code exchanged for access token
5. User's music data synced to profile

### API Endpoints Used
- `GET /me` - User profile information
- `GET /me/top/tracks` - Top tracks
- `GET /me/top/artists` - Top artists
- `GET /me/playlists` - User playlists
- `GET /me/player/recently-played` - Recently played

### Services
- `spotifyService.ts` - Main Spotify API client
- `spotifyAuthService.ts` - Authentication handling
- `spotifyDataService.ts` - Data synchronization

### Data Synchronization
- Automatic sync after authentication
- Manual sync available
- Throttled to respect API limits
- Stores comprehensive profile data

## 4. Apple Music API Integration

### Overview
Apple Music integration provides comprehensive music data:
- Library songs, artists, and albums
- Recently played tracks
- Storefront-specific data
- Enhanced metadata and statistics

### Configuration
```env
VITE_APPLE_MUSIC_DEVELOPER_TOKEN=your_jwt_token_here
```

### JWT Token Generation
Apple Music requires a JWT token signed with your private key:

```javascript
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('path/to/AuthKey_XXXXXXXXXX.p8');
const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d',
  issuer: 'YOUR_TEAM_ID',
  header: {
    alg: 'ES256',
    kid: 'YOUR_KEY_ID'
  }
});
```

### MusicKit JS Integration
- Uses MusicKit JS for Apple Music access
- Handles authentication flow
- Fetches comprehensive library data
- Processes and stores profile data

### Services
- `appleMusicService.ts` - Main Apple Music client
- `musicKitService.ts` - MusicKit JS wrapper
- `appleMusicDataService.ts` - Data processing

### Data Processing
- Library statistics calculation
- Top tracks and artists identification
- Genre analysis and preferences
- Listening time calculations

## 5. Cities API Integration

### Overview
Cities API provides location and geocoding services:
- City and state information
- Zip code lookups
- Geographic coordinates
- Location-based event search

### Configuration
```env
VITE_CITIES_API_KEY=your_cities_api_key
```

### API Endpoints Used
- `GET /cities/search` - Search for cities
- `GET /cities/zip/{zip}` - Zip code lookup
- `GET /cities/coordinates` - Geocoding services

### Services
- `citiesService.ts` - Main Cities API client
- `locationService.ts` - Location operations
- `geocodingService.ts` - Geocoding utilities

### Use Cases
- Location-based event search
- User location detection
- Venue location validation
- Distance calculations

## 6. Vercel Integration

### Overview
Vercel provides deployment and hosting services:
- Automatic deployments from GitHub
- Environment variable management
- Edge functions for serverless operations
- Global CDN for performance

### Configuration
- Connected to GitHub repository
- Environment variables configured
- Build settings optimized for Vite
- Custom domain support

### Deployment Features
- Automatic builds on push
- Preview deployments for PRs
- Environment-specific configurations
- Performance monitoring

## Integration Architecture

### Service Layer Pattern
All integrations follow a consistent service layer pattern:

```typescript
class IntegrationService {
  private apiKey: string;
  private baseUrl: string;
  
  constructor(config: IntegrationConfig) {
    this.apiKey = config.apiKey;
    this.baseUrl = config.baseUrl;
  }
  
  async authenticate(): Promise<AuthResult> {
    // Authentication logic
  }
  
  async fetchData(params: FetchParams): Promise<DataResult> {
    // Data fetching logic
  }
  
  async syncProfile(userId: string): Promise<SyncResult> {
    // Profile synchronization
  }
}
```

### Error Handling
Comprehensive error handling for all integrations:
- Network error recovery
- API rate limit handling
- Authentication error management
- Graceful degradation

### Caching Strategy
- Database caching for API responses
- Local storage for user preferences
- Service worker for offline support
- CDN caching for static assets

## Setup Instructions

### 1. Environment Variables
Create a `.env.local` file with all required API keys:

```env
# Supabase
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# JamBase
VITE_JAMBASE_API_KEY=your_jambase_api_key

# Spotify (Optional)
VITE_SPOTIFY_CLIENT_ID=your_spotify_client_id
VITE_SPOTIFY_REDIRECT_URI=http://localhost:8080/auth/spotify/callback

# Apple Music (Optional)
VITE_APPLE_MUSIC_DEVELOPER_TOKEN=your_jwt_token

# Cities API
VITE_CITIES_API_KEY=your_cities_api_key

# Backend
VITE_BACKEND_URL=http://localhost:3001
```

### 2. API Key Setup

#### JamBase API
1. Sign up at [JamBase Developer Portal](https://www.jambase.com/api)
2. Get your API key
3. Add to environment variables

#### Spotify API
1. Create app at [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
2. Set redirect URI
3. Get client ID and secret
4. Add to environment variables

#### Apple Music API
1. Join Apple Developer Program
2. Create Apple Music API key
3. Download private key (.p8 file)
4. Generate JWT token
5. Add to environment variables

#### Cities API
1. Sign up for Cities API service
2. Get API key
3. Add to environment variables

### 3. Database Setup
Run Supabase migrations to create required tables:

```bash
supabase migration up
```

### 4. Testing Integrations
Use the provided demo components to test integrations:

```typescript
// Test JamBase integration
import { ArtistSearchDemo } from '@/components/ArtistSearchDemo';

// Test Spotify integration
import { SpotifyStats } from '@/components/streaming/SpotifyStats';

// Test Apple Music integration
import { AppleMusicStats } from '@/components/streaming/AppleMusicStats';
```

## Troubleshooting

### Common Issues

#### JamBase API
- **No results**: Check API key and network connectivity
- **Rate limiting**: Implement proper throttling
- **CORS issues**: Configure proper headers

#### Spotify API
- **Authentication failed**: Check client ID and redirect URI
- **Token expired**: Implement token refresh logic
- **Scope issues**: Ensure proper permissions requested

#### Apple Music API
- **MusicKit not initialized**: Check developer token
- **User token required**: Ensure user authentication
- **Storefront issues**: Handle different storefronts

#### Supabase
- **Connection failed**: Check URL and keys
- **RLS policies**: Verify row level security
- **Migration issues**: Check migration status

### Debug Steps
1. Check browser console for errors
2. Verify environment variables
3. Test API endpoints directly
4. Check network requests in DevTools
5. Review service logs

## Performance Considerations

### API Rate Limiting
- Implement proper throttling for all APIs
- Cache responses to reduce API calls
- Use batch operations where possible
- Monitor API usage and limits

### Data Synchronization
- Sync data asynchronously
- Implement incremental updates
- Handle large datasets efficiently
- Provide sync status feedback

### Error Recovery
- Implement retry logic with exponential backoff
- Provide fallback data when APIs fail
- Graceful degradation for missing data
- User-friendly error messages

## Security Considerations

### API Key Management
- Never commit API keys to repository
- Use environment variables for all keys
- Rotate keys regularly
- Monitor API usage for anomalies

### Data Privacy
- Implement proper data encryption
- Follow GDPR and privacy regulations
- Secure user data transmission
- Implement proper access controls

### Authentication Security
- Use secure OAuth flows
- Implement proper token management
- Secure session handling
- Regular security audits

## Monitoring & Analytics

### API Monitoring
- Track API response times
- Monitor error rates
- Track usage patterns
- Set up alerts for failures

### User Analytics
- Track integration usage
- Monitor user engagement
- Analyze feature adoption
- Track conversion rates

### Performance Metrics
- API response times
- Data sync success rates
- User satisfaction scores
- System reliability metrics

## Future Enhancements

### Planned Integrations
- **YouTube Music**: Additional streaming service
- **SoundCloud**: Independent music platform
- **Ticketmaster**: Ticket purchasing integration
- **Google Maps**: Enhanced location services

### Technical Improvements
- **GraphQL**: Unified API layer
- **WebSocket**: Real-time updates
- **Edge Functions**: Serverless processing
- **AI Integration**: Smart recommendations

## Support

For integration issues:
1. Check this documentation
2. Review service source code
3. Test with demo components
4. Check API documentation
5. Contact support team

## Related Documentation

- [Features Guide](./FEATURES.md)
- [Development Setup](./DEV_SETUP.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Brand Guide](./BRAND_GUIDE.md)
