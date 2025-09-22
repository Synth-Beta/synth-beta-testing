# Apple Music API Integration

This document describes the comprehensive Apple Music API integration implemented in the PlusOne Event Crew application.

## Overview

The Apple Music integration automatically detects user streaming services and syncs profile data including:
- Top tracks, artists, and albums
- Recently played music
- Library statistics
- Genre preferences
- Listening time data

## Architecture

### Frontend Components

1. **UnifiedStreamingStats** (`src/components/streaming/UnifiedStreamingStats.tsx`)
   - Automatically detects streaming service from user profile
   - Provides manual sync controls for Apple Music users
   - Displays sync status and last update time

2. **AppleMusicStats** (`src/components/streaming/AppleMusicStats.tsx`)
   - Displays comprehensive Apple Music statistics
   - Handles authentication flow
   - Shows library stats, top tracks, artists, albums, and recent plays

3. **AppleMusicService** (`src/services/appleMusicService.ts`)
   - Core service for Apple Music API integration
   - Handles authentication, data fetching, and profile sync
   - Manages MusicKit JS initialization

### Backend API

4. **Streaming Profile Routes** (`backend/streaming-profile-routes.js`)
   - RESTful API for managing streaming profile data
   - Supports CRUD operations on profile data
   - Provides aggregated statistics across users

5. **Database Schema** (`supabase/migrations/20250122000000_create_streaming_profiles_table.sql`)
   - `streaming_profiles` table with RLS policies
   - Stores JSON profile data with sync status
   - Indexed for performance

## Key Features

### Automatic Service Detection

The system automatically detects streaming services based on user profile URLs:

```typescript
// Spotify Detection
if (profile.includes('spotify.com') || profile.includes('open.spotify') || profile.startsWith('spotify:')) {
  return 'spotify';
}

// Apple Music Detection  
if (profile.includes('music.apple.com') || profile.includes('applemusic')) {
  return 'apple-music';
}
```

### Comprehensive Data Sync

The Apple Music service fetches and processes:

- **Library Data**: Songs, artists, albums, playlists
- **Recent Activity**: Recently played tracks with timestamps
- **Statistics**: Total listening time, genre breakdown, library size
- **Enhanced Data**: Heavy rotation, recommendations, charts (when available)

### Automatic Profile Upload

After successful authentication, the system:

1. Generates comprehensive profile data
2. Uploads to backend API with user authentication
3. Updates user's streaming profile field
4. Provides sync status feedback

### Intelligent Sync Throttling

- Syncs automatically after authentication
- Manual sync available with status indicators
- Throttles to once per 24 hours to respect API limits
- Stores last sync timestamp locally

## API Endpoints

### POST /api/user/streaming-profile
Upload or update streaming profile data.

**Request Body:**
```json
{
  "service": "apple-music",
  "data": {
    "storefront": "us",
    "libraryStats": {...},
    "topTracks": [...],
    "topArtists": [...],
    "topAlbums": [...],
    "recentlyPlayed": [...],
    "topGenres": [...],
    "listeningTime": 1234.5,
    "lastUpdated": "2025-01-22T10:00:00Z"
  },
  "userId": "user-uuid-here"
}
```

### GET /api/user/streaming-profile/:service
Retrieve streaming profile data for a user.

### DELETE /api/user/streaming-profile/:service  
Delete streaming profile data.

### GET /api/streaming-profiles/stats
Get aggregated statistics across all users.

## Setup Instructions

### 1. Apple Music Developer Setup

1. Join the Apple Developer Program
2. Create an Apple Music API key at [developer.apple.com](https://developer.apple.com)
3. Download the private key file (.p8)
4. Note your Team ID and Key ID

### 2. Environment Configuration

Add to your `.env` file:

```env
VITE_APPLE_MUSIC_DEVELOPER_TOKEN=your_jwt_token_here
VITE_BACKEND_URL=http://localhost:3001
```

### 3. Generate JWT Token

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

console.log(token);
```

### 4. Database Migration

Run the migration to create the streaming_profiles table:

```bash
supabase migration up
```

## Usage Examples

### Basic Integration

```typescript
import { appleMusicService } from '@/services/appleMusicService';

// Authenticate user
await appleMusicService.authenticate();

// Get user's top tracks
const tracks = await appleMusicService.getLibrarySongs(20);

// Sync profile data
const success = await appleMusicService.syncProfileData();
```

### Component Usage

```tsx
import { UnifiedStreamingStats } from '@/components/streaming/UnifiedStreamingStats';

function UserProfile({ user }) {
  return (
    <UnifiedStreamingStats 
      musicStreamingProfile={user.music_streaming_profile}
      className="w-full"
    />
  );
}
```

## Data Flow

1. **User Authentication**: User connects Apple Music account
2. **Service Detection**: System detects Apple Music from profile
3. **Data Fetching**: Service fetches comprehensive library data
4. **Profile Generation**: Creates structured profile data object
5. **Backend Upload**: Uploads data to backend with authentication
6. **Database Storage**: Stores in streaming_profiles table with RLS
7. **UI Updates**: Shows sync status and profile data

## Privacy & Security

- **Row Level Security**: Users can only access their own data
- **JWT Authentication**: Apple Music API requires signed tokens
- **Local Storage**: Only sync timestamps stored locally
- **Anonymous Support**: Supports anonymous users for testing
- **Data Encryption**: Profile data stored as encrypted JSONB

## Limitations & Considerations

### Apple Music API Limitations

- **No Play Counts**: Apple Music doesn't provide actual play counts
- **Library Access Only**: Can only access user's saved library
- **Rate Limiting**: API has usage limits per developer token
- **Storefront Restrictions**: Some data varies by user's storefront

### Workarounds Implemented

- **Simulated Rankings**: Uses library order as proxy for popularity
- **Time-based Processing**: Filters data by time periods
- **Graceful Degradation**: Handles missing data gracefully
- **Error Recovery**: Comprehensive error handling and retry logic

## Troubleshooting

### Common Issues

1. **"MusicKit not initialized"**
   - Ensure developer token is valid
   - Check network connectivity
   - Verify token hasn't expired

2. **"User token required for library access"**
   - User needs to authenticate first
   - Check if authorization was successful

3. **"Upload failed"**
   - Verify backend is running
   - Check CORS configuration
   - Ensure database migration completed

### Debug Steps

1. Check browser console for detailed error messages
2. Verify environment variables are set correctly
3. Test Apple Music API directly in browser
4. Check backend logs for API endpoint errors
5. Verify database table exists and has correct permissions

## Future Enhancements

- **Real-time Sync**: WebSocket-based real-time updates
- **Advanced Analytics**: More detailed listening pattern analysis
- **Social Features**: Compare music tastes with friends
- **Recommendation Engine**: AI-powered event recommendations based on music taste
- **Multi-platform Support**: Support for additional streaming services

## Contributing

When adding new features:

1. Update types in `src/types/appleMusic.ts`
2. Add service methods in `src/services/appleMusicService.ts`
3. Create/update UI components as needed
4. Add backend API endpoints if required
5. Update database schema with migrations
6. Add comprehensive error handling
7. Update this documentation

## References

- [Apple Music API Documentation](https://developer.apple.com/documentation/applemusicapi)
- [MusicKit JS Reference](https://developer.apple.com/documentation/musickitjs)
- [JWT Token Generation](https://developer.apple.com/documentation/applemusicapi/generating_developer_tokens)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
