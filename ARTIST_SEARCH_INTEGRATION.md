# Artist Search Integration with JamBase API

This document describes the integration of JamBase API for artist search functionality that automatically populates the `artist_profile` table and provides fuzzy-matched artist suggestions.

## Overview

The artist search integration provides:

- **Real-time artist search** using JamBase API
- **Automatic database population** of artist profiles
- **Fuzzy matching** for better search results
- **Rich UI suggestions** with images, genres, and metadata
- **Caching** to avoid redundant API calls

## How It Works

### 1. User Types in Search Box
When a user types an artist name in the events search bar:

```typescript
// In ConcertSearchForm.tsx
const searchArtists = async (query: string) => {
  if (query.length < 2) return;
  
  const suggestions = await JamBaseArtistSearchService.getArtistSuggestions(query, 10);
  setArtistSuggestions(suggestions);
};
```

### 2. JamBase API Search
The system searches JamBase API for matching artists:

```typescript
// In jambaseArtistSearchService.ts
const jamBaseResults = await this.searchArtists(query, limit);
```

### 3. Database Population
For each found artist, the system:
- Checks if artist already exists in database
- If not, fetches full artist details from JamBase API
- Saves complete artist profile to `artist_profile` table

### 4. Fuzzy Matching
Results are scored using fuzzy matching algorithm:
- Exact match: 100%
- Starts with query: 90%
- Contains query: 80%
- Word boundary match: 70-90%
- Levenshtein distance: 0-60%

### 5. UI Display
Rich suggestions are displayed with:
- Artist images
- Genres
- Band/musician type
- Upcoming events count
- Match score

## Files Created/Modified

### New Files

1. **`src/services/jambaseArtistSearchService.ts`**
   - Main service for JamBase artist search
   - Handles API calls and database population
   - Implements fuzzy matching algorithm

2. **`src/components/ArtistSearchDemo.tsx`**
   - Demo component to test artist search functionality
   - Shows search results with rich metadata

### Modified Files

1. **`src/components/ConcertSearchForm.tsx`**
   - Updated to use JamBase API for artist suggestions
   - Enhanced UI to show artist images and metadata
   - Improved suggestion selection handling

## API Integration

### JamBase Artist Search Endpoint

```
GET https://www.jambase.com/jb-api/v1/artists/search
```

**Query Parameters:**
- `q`: Search query
- `limit`: Number of results (default: 20)
- `apikey`: Your JamBase API key

**Response Format:**
```json
{
  "success": true,
  "artists": [
    {
      "name": "Phish",
      "identifier": "jambase:194164",
      "image": "https://...",
      "genre": ["rock", "jam band"],
      "x-bandOrMusician": "band",
      "x-numUpcomingEvents": 12
    }
  ]
}
```

### JamBase Artist Details Endpoint

```
GET https://www.jambase.com/jb-api/v1/artists/id/{dataSource}:{artistId}
```

**Query Parameters:**
- `expandUpcomingEvents`: Include upcoming events
- `expandExternalIdentifiers`: Include external platform IDs
- `excludeEventPerformers`: Exclude performer details

## Database Schema

The `artist_profile` table stores comprehensive artist data:

```sql
CREATE TABLE artist_profile (
  id UUID PRIMARY KEY,
  jambase_artist_id TEXT UNIQUE NOT NULL,
  artist_data_source TEXT NOT NULL DEFAULT 'jambase',
  name TEXT NOT NULL,
  identifier TEXT UNIQUE NOT NULL,
  url TEXT,
  image_url TEXT,
  artist_type TEXT,
  band_or_musician TEXT,
  founding_location TEXT,
  founding_date TEXT,
  genres TEXT[],
  members JSONB,
  member_of JSONB,
  external_identifiers JSONB,
  same_as JSONB,
  num_upcoming_events INTEGER DEFAULT 0,
  raw_jambase_data JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at TIMESTAMPTZ
);
```

## Usage Examples

### Basic Artist Search

```typescript
import { JamBaseArtistSearchService } from '@/services/jambaseArtistSearchService';

// Search for artists
const results = await JamBaseArtistSearchService.searchAndPopulateArtists('Phish', 10);

// Get suggestions for autocomplete
const suggestions = await JamBaseArtistSearchService.getArtistSuggestions('Dead', 5);
```

### Using in React Component

```typescript
const [artistSuggestions, setArtistSuggestions] = useState([]);

const searchArtists = async (query: string) => {
  const suggestions = await JamBaseArtistSearchService.getArtistSuggestions(query, 10);
  setArtistSuggestions(suggestions);
};
```

## Configuration

### Environment Variables

Add to your `.env` file:

```env
VITE_JAMBASE_API_KEY=your_jambase_api_key_here
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### JamBase API Key

1. Sign up for JamBase API access
2. Get your API key from the JamBase developer portal
3. Add it to your environment variables

## Performance Considerations

### Caching Strategy
- Database queries are cached by Supabase
- JamBase API results are stored in database
- Subsequent searches use cached data when possible

### Rate Limiting
- JamBase API has rate limits
- System implements debouncing for search input
- Database population happens asynchronously

### Optimization Tips
1. Use the `artist_profile_summary` view for list operations
2. Implement pagination for large result sets
3. Consider background sync jobs for popular artists
4. Monitor API usage and implement caching layers

## Error Handling

The system handles various error scenarios:

- **API Key Missing**: Clear error message
- **Network Errors**: Graceful fallback to cached data
- **Invalid Responses**: Skip problematic artists
- **Database Errors**: Continue with other artists

## Testing

### Demo Component

Use the `ArtistSearchDemo` component to test functionality:

```typescript
import { ArtistSearchDemo } from '@/components/ArtistSearchDemo';

// In your app
<ArtistSearchDemo />
```

### Manual Testing

1. Start typing in the artist search box
2. Verify suggestions appear with images and metadata
3. Check database for populated artist profiles
4. Test with various search terms

## Troubleshooting

### Common Issues

1. **No suggestions appearing**
   - Check JamBase API key configuration
   - Verify network connectivity
   - Check browser console for errors

2. **Images not loading**
   - JamBase images may be blocked by CORS
   - Fallback to default music icon is implemented

3. **Database not populating**
   - Check Supabase connection
   - Verify RLS policies
   - Check console for database errors

### Debug Mode

Enable debug logging:

```typescript
// In jambaseArtistSearchService.ts
console.log('Searching for:', query);
console.log('JamBase results:', jamBaseResults);
console.log('Database results:', existingArtists);
```

## Future Enhancements

### Planned Features

1. **Advanced Filtering**
   - Filter by genre, location, event count
   - Sort by popularity, relevance, date

2. **Caching Improvements**
   - Redis cache for frequent searches
   - Background refresh of popular artists

3. **Analytics**
   - Track search patterns
   - Monitor API usage
   - User behavior analytics

4. **Social Features**
   - Artist following
   - User preferences
   - Collaborative filtering

### API Enhancements

1. **Batch Operations**
   - Bulk artist import
   - Batch API calls

2. **Real-time Updates**
   - WebSocket for live data
   - Push notifications for new events

## Support

For issues or questions:

1. Check the console for error messages
2. Verify environment variables
3. Test with the demo component
4. Check JamBase API status
5. Review Supabase logs

## Related Documentation

- [Artist Profile Setup](./ARTIST_PROFILE_SETUP.md)
- [JamBase API Documentation](https://www.jambase.com/jb-api/v1/docs)
- [Supabase Documentation](https://supabase.com/docs)
