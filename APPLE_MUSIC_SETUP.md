# Apple Music Integration Setup

This app now supports both Spotify and Apple Music streaming stats! Here's how to set up Apple Music integration.

## Prerequisites

1. **Apple Developer Account**: You need an Apple Developer account to access the Apple Music API.
2. **MusicKit Identifier**: Create a MusicKit identifier in your Apple Developer account.
3. **Private Key**: Generate a private key for MusicKit authentication.

## Setup Steps

### 1. Apple Developer Account Setup

1. Go to [Apple Developer Portal](https://developer.apple.com)
2. Sign in with your Apple ID (you'll need to enroll in the Apple Developer Program if you haven't already)
3. Navigate to "Certificates, Identifiers & Profiles"

### 2. Create MusicKit Identifier

1. In the Developer Portal, go to "Identifiers"
2. Click the "+" button to create a new identifier
3. Select "MusicKit Identifier" and click "Continue"
4. Enter a description (e.g., "PlusOne Event Crew MusicKit")
5. Enter an identifier (e.g., `com.yourcompany.plusone-event-crew`)
6. Click "Continue" and then "Register"

### 3. Generate Private Key

1. In the Developer Portal, go to "Keys"
2. Click the "+" button to create a new key
3. Enter a key name (e.g., "PlusOne MusicKit Key")
4. Check the "MusicKit" checkbox
5. Click "Continue" and then "Register"
6. **Important**: Download the private key file (.p8) - you can only download it once!

### 4. Generate Developer Token

Apple Music API requires a JWT (JSON Web Token) as a developer token. You can generate this using the private key:

#### Option A: Use Online JWT Generator
1. Go to [jwt.io](https://jwt.io)
2. Use the following payload structure:
```json
{
  "iss": "YOUR_TEAM_ID",
  "iat": 1234567890,
  "exp": 1234567890,
  "aud": "appstoreconnect-v1"
}
```

#### Option B: Generate Programmatically (Node.js)
```javascript
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('path/to/your/AuthKey_XXXXXXXXXX.p8');
const teamId = 'YOUR_TEAM_ID';
const keyId = 'YOUR_KEY_ID';

const token = jwt.sign({}, privateKey, {
  algorithm: 'ES256',
  expiresIn: '180d',
  issuer: teamId,
  header: {
    alg: 'ES256',
    kid: keyId
  }
});

console.log(token);
```

### 5. Environment Variable

Add the generated developer token to your environment variables:

```bash
VITE_APPLE_MUSIC_DEVELOPER_TOKEN=your_generated_jwt_token_here
```

## How It Works

### Automatic Detection

The app automatically detects whether a user has Spotify or Apple Music based on their streaming profile:

- **Spotify Detection**: 
  - URLs containing `spotify.com` or `open.spotify`
  - Spotify URIs starting with `spotify:`
  - Alphanumeric user IDs (common Spotify format)

- **Apple Music Detection**:
  - URLs containing `music.apple.com`
  - Text containing "apple music" or "applemusic"

### Features

#### Apple Music Stats Include:
- **Library Overview**: Total songs, artists, albums in user's library
- **Time-based Filtering**: Last week, last month, last 6 months
- **Top Content**: Most played songs, artists, and albums
- **Recently Played**: Recent listening activity
- **Genre Analysis**: Top genres from user's library
- **Detailed Stats**: Total listening time, average song duration

#### Unified Experience:
- Same UI components for both services
- Consistent data formatting
- Seamless switching between services
- Smart service detection

## Limitations

### Apple Music API Limitations:
1. **No Play Counts**: Apple Music API doesn't provide actual play counts for library items
2. **Library-Based**: Stats are based on library content, not actual listening behavior
3. **Recent Tracks**: Limited recent playback history compared to Spotify
4. **Developer Token**: Requires server-side token generation (more complex than Spotify's client-side flow)

### Current Implementation:
- Uses library data to simulate "top" content
- Time periods filter library content rather than actual play history
- Recent tracks may have limited data

## Testing

1. Add an Apple Music profile URL to your user profile
2. Go to the "Streaming Stats" tab
3. Click "Connect to Apple Music"
4. Authorize the app to access your Apple Music library
5. View your stats!

## Troubleshooting

### Common Issues:

1. **"Developer token not configured"**
   - Make sure `VITE_APPLE_MUSIC_DEVELOPER_TOKEN` is set in your environment
   - Verify the token is valid and not expired

2. **"Failed to configure Apple Music"**
   - Check that the MusicKit JS library is loading correctly
   - Verify your network connection

3. **"Authentication failed"**
   - Ensure the user has an active Apple Music subscription
   - Check that the MusicKit identifier is correctly configured

4. **"No data available"**
   - User may not have music in their library
   - Apple Music API may have rate limits or temporary issues

## Security Notes

- Developer tokens should be kept secure and rotated regularly
- Consider implementing server-side token generation for production
- Monitor API usage to stay within Apple's rate limits

## Future Enhancements

Potential improvements for the Apple Music integration:

1. **Server-side Token Generation**: Move token generation to backend for better security
2. **Playlist Integration**: Add support for user playlists
3. **Social Features**: Allow users to share Apple Music playlists
4. **Enhanced Analytics**: Combine library data with additional metrics
5. **Cross-Platform**: Compare stats between Spotify and Apple Music users
