# Concert Search Feature

## Overview
A comprehensive search feature has been added to your concert management app that allows users to search through their concert database.

## Features Added

### 1. ConcertSearch Component (`src/components/ConcertSearch.tsx`)
- **General Search**: Search across artist names, venues, tours, and locations
- **Advanced Filters**: Filter by specific artist, venue, date, or tour
- **Recent Concerts**: Shows recently added concerts when no search is performed
- **Real-time Search**: Instant search with loading states
- **Responsive Design**: Works on mobile and desktop

### 2. API Service (`src/services/concertApi.ts`)
- **Search API**: `/api/concerts/search` with query parameters
- **Get Concert**: `/api/concerts/:id` for individual concert details
- **Recent Concerts**: `/api/concerts/recent` for recently added concerts
- **Statistics**: `/api/concerts/stats` for database statistics
- **Mock Data Fallback**: Works with mock data when backend is not available

### 3. Backend Integration (`backend/search-routes.js`)
- **Search Endpoints**: Complete REST API for concert searching
- **Fuzzy Matching**: Uses normalized strings for better search results
- **Pagination**: Supports limit/offset for large result sets
- **Filtering**: Multiple filter options (artist, venue, date, tour)
- **Statistics**: Database statistics and analytics

## How to Use

### For Users
1. **Access Search**: Click the "Search Concerts" button on the Concert Rankings page
2. **General Search**: Type in the search box to search across all fields
3. **Advanced Filters**: Click "Filters" to use specific search criteria
4. **Select Concert**: Click on any concert result to select it
5. **Clear Search**: Use "Clear Search" to return to recent concerts view

### For Developers

#### Frontend Integration
```typescript
import { ConcertSearch } from '@/components/ConcertSearch';

<ConcertSearch
  currentUserId={user.id}
  onBack={() => setCurrentView('concerts')}
  onSelectConcert={(concert) => {
    // Handle concert selection
    console.log('Selected:', concert);
  }}
/>
```

#### API Usage
```typescript
import { concertApiService } from '@/services/concertApi';

// Search concerts
const results = await concertApiService.searchConcerts({
  query: 'Taylor Swift',
  artist: 'Taylor Swift',
  venue: 'Madison Square Garden',
  date: '2024-06-15',
  limit: 20
});

// Get recent concerts
const recent = await concertApiService.getRecentConcerts(10);

// Get concert by ID
const concert = await concertApiService.getConcertById('123');
```

#### Backend Setup
1. Add the search routes to your Express server:
```javascript
const searchRoutes = require('./backend/search-routes');
app.use('/', searchRoutes);
```

2. Set environment variables:
```env
VITE_API_BASE_URL=http://localhost:3001
```

## Search Capabilities

### General Search
- Searches across artist names, venue names, tour names, and locations
- Case-insensitive matching
- Partial string matching

### Advanced Filters
- **Artist Filter**: Search by specific artist name
- **Venue Filter**: Search by specific venue name
- **Date Filter**: Search by exact concert date
- **Tour Filter**: Search by tour name

### Search Results
- **Concert Cards**: Rich display with artist photos, venue info, and setlists
- **Source Indicators**: Shows data source (JamBase API, manual entry)
- **Confidence Levels**: Indicates data quality (high, medium, low)
- **Setlist Preview**: Shows first few songs from the setlist

## Database Schema Requirements

The search feature expects a `shows` table with the following structure:
```sql
CREATE TABLE shows (
    id UUID PRIMARY KEY,
    artist TEXT NOT NULL,
    artist_normalized TEXT NOT NULL,
    date DATE NOT NULL,
    venue TEXT NOT NULL,
    venue_normalized TEXT NOT NULL,
    profile_pic TEXT,
    tour TEXT,
    setlist JSONB,
    venue_location TEXT,
    source TEXT NOT NULL,
    confidence TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Mock Data
The feature includes mock data for development and testing:
- 5 sample concerts with realistic data
- Various artists, venues, and tour information
- Different data sources and confidence levels
- Sample setlists and venue locations

## Future Enhancements
- **Pagination**: Load more results as user scrolls
- **Sorting**: Sort by date, artist, venue, or relevance
- **Saved Searches**: Save frequently used search queries
- **Export Results**: Export search results to CSV/PDF
- **Search History**: Track and display recent searches
- **Autocomplete**: Suggest artists, venues, and tours as user types

## Troubleshooting

### Common Issues
1. **No Results Found**: Check if search terms are too specific
2. **API Errors**: Ensure backend is running and accessible
3. **Mock Data**: If API fails, the app falls back to mock data
4. **TypeScript Errors**: Ensure all dependencies are properly installed

### Development Mode
- The app works with mock data when the backend is not available
- Check browser console for API connection status
- Use the network tab to debug API calls

## Integration with Existing Features
- **Concert Rankings**: Search results can be selected and added to rankings
- **User Profiles**: Search is tied to user authentication
- **Navigation**: Seamlessly integrated with existing app navigation
- **Responsive Design**: Matches the existing app's design system
