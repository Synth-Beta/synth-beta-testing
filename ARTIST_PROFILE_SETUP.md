# Artist Profile Setup

This document describes the new `artist_profile` table and related functionality for storing JamBase Artist API data in Supabase.

## Overview

The `artist_profile` table is designed to store comprehensive artist information from the JamBase API, including:

- Basic artist information (name, identifier, URLs, images)
- Artist classification (band/musician, type)
- Location and founding information
- Genres and musical styles
- Member relationships and group affiliations
- External identifiers from various platforms
- Social media and official site links
- Event statistics and metadata

## Database Schema

### Table: `artist_profile`

| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary key |
| `jambase_artist_id` | TEXT | Unique JamBase artist ID |
| `artist_data_source` | TEXT | Data source (jambase, spotify, etc.) |
| `name` | TEXT | Artist name |
| `identifier` | TEXT | Full identifier (e.g., "jambase:194164") |
| `url` | TEXT | Official website URL |
| `image_url` | TEXT | Artist image URL |
| `date_published` | TIMESTAMPTZ | When artist was first published |
| `date_modified` | TIMESTAMPTZ | When artist data was last modified |
| `artist_type` | TEXT | "MusicGroup" or "Person" |
| `band_or_musician` | TEXT | "band" or "musician" |
| `founding_location` | TEXT | Where the artist was founded |
| `founding_date` | TEXT | When the artist was founded |
| `genres` | TEXT[] | Array of musical genres |
| `members` | JSONB | Array of band members |
| `member_of` | JSONB | Groups this artist is a member of |
| `external_identifiers` | JSONB | External platform IDs |
| `same_as` | JSONB | Social media and official links |
| `num_upcoming_events` | INTEGER | Number of upcoming events |
| `raw_jambase_data` | JSONB | Complete API response |
| `created_at` | TIMESTAMPTZ | Record creation time |
| `updated_at` | TIMESTAMPTZ | Record last update time |
| `last_synced_at` | TIMESTAMPTZ | Last API sync time |

### View: `artist_profile_summary`

A simplified view for common queries that excludes the large JSONB fields.

## Files Created

1. **Migration**: `supabase/migrations/20250116000000_create_artist_profile_table.sql`
   - Creates the `artist_profile` table
   - Sets up indexes for performance
   - Configures Row Level Security (RLS)
   - Creates helper functions and triggers

2. **TypeScript Types**: `src/types/artistProfile.ts`
   - Type definitions for JamBase API responses
   - Database schema types
   - Helper transformation functions

3. **Service Layer**: `src/services/artistProfileService.ts`
   - Complete service class for artist profile operations
   - JamBase API integration
   - Database CRUD operations
   - Search and filtering functionality

4. **Example Script**: `example-artist-profile-usage.js`
   - Demonstrates how to use the new functionality
   - Shows API integration patterns
   - Includes common use cases

## Usage Examples

### 1. Fetch and Store Artist Data

```typescript
import { ArtistProfileService } from './services/artistProfileService';

// Fetch from JamBase API and save to database
const artist = await ArtistProfileService.syncArtistFromJamBase('194164', 'jambase', {
  expandUpcomingEvents: true,
  expandExternalIdentifiers: true
});
```

### 2. Search Artists

```typescript
// Search by name
const results = await ArtistProfileService.searchArtistsByName('Phish', 10);

// Search by genre
const rockArtists = await ArtistProfileService.getArtistsByGenre('rock', 20);

// Search by type
const bands = await ArtistProfileService.getArtistsByType('band', 15);
```

### 3. Get Artist Profile

```typescript
// Get by JamBase ID
const artist = await ArtistProfileService.getArtistProfileByJamBaseId('194164');

// Get by identifier
const artist = await ArtistProfileService.getArtistProfileByIdentifier('jambase:194164');
```

### 4. Pagination

```typescript
// Get paginated results
const { data, total } = await ArtistProfileService.getAllArtistProfiles(0, 20);
console.log(`Showing ${data.length} of ${total} artists`);
```

## API Integration

The service integrates with the JamBase API endpoint:

```
GET https://www.jambase.com/jb-api/v1/artists/id/{artistDataSource}:{artistId}
```

### Query Parameters

- `excludeEventPerformers`: Suppress performer nodes in events
- `expandExternalIdentifiers`: Include external platform IDs
- `expandPastEvents`: Include historical events
- `expandUpcomingEvents`: Include upcoming events
- `expandUpcomingStreams`: Include upcoming streams

### Required Environment Variables

```env
VITE_JAMBASE_API_KEY=your_jambase_api_key
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Database Features

### Indexes

The migration creates several indexes for optimal query performance:

- `jambase_artist_id` - Fast lookups by JamBase ID
- `identifier` - Fast lookups by full identifier
- `name` - Text search on artist names
- `genres` - GIN index for array searches
- `external_identifiers` - GIN index for JSON searches
- `same_as` - GIN index for social media links

### Row Level Security (RLS)

- **Read**: Everyone can view artist profiles (public data)
- **Write**: Only authenticated users can create/update/delete
- **View**: Public access to the summary view

### Triggers

- Automatic `updated_at` timestamp updates on record changes

## Data Sources Supported

The system supports multiple artist data sources:

- `jambase` - JamBase (default)
- `spotify` - Spotify
- `ticketmaster` - Ticketmaster
- `axs` - AXS
- `dice` - Dice
- `etix` - Etix
- `eventbrite` - Eventbrite
- `eventim-de` - Eventim Germany
- `seated` - Seated
- `seatgeek` - SeatGeek
- `viagogo` - Viagogo
- `musicbrainz` - MusicBrainz

## Running the Migration

To apply the migration to your Supabase database:

```bash
# Using Supabase CLI
supabase db push

# Or manually run the SQL file in your Supabase dashboard
```

## Testing

Run the example script to test the functionality:

```bash
# Set environment variables
export VITE_JAMBASE_API_KEY="your_api_key"
export VITE_SUPABASE_URL="your_supabase_url"
export VITE_SUPABASE_ANON_KEY="your_supabase_key"

# Run the example
node example-artist-profile-usage.js
```

## Next Steps

1. Apply the migration to your Supabase database
2. Set up your JamBase API key
3. Test the functionality with the example script
4. Integrate the service into your application
5. Consider adding caching for frequently accessed artists
6. Implement background sync jobs for keeping data fresh

## Performance Considerations

- The `raw_jambase_data` field can be large - consider archiving old data
- Use the `artist_profile_summary` view for list operations
- Implement pagination for large result sets
- Consider adding full-text search indexes for complex queries
- Monitor API rate limits when syncing large numbers of artists
