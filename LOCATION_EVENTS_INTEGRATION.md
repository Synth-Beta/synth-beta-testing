# Location-Based Event Fetching Integration

## Overview
This integration automatically fetches events from Jambase API whenever a user's location is detected or when they search for a specific location. All events are automatically uploaded to Supabase using the existing event search flow.

## Features Implemented

### 1. Automatic Location Detection
- **When**: User visits the map component
- **What**: Automatically detects user's location using browser geolocation
- **Action**: Fetches events from Jambase API for the user's location
- **Storage**: Events are automatically stored in Supabase `jambase_events` table

### 2. Location Search
- **When**: User enters a city name in the search box
- **What**: Searches for events near the specified location
- **Action**: Fetches events from Jambase API for the searched location
- **Storage**: Events are automatically stored in Supabase `jambase_events` table

### 3. Event Refresh
- **When**: User clicks the refresh button
- **What**: Refreshes events for the current location
- **Action**: Fetches fresh events from Jambase API
- **Storage**: New events are automatically stored in Supabase

## Technical Implementation

### Enhanced Components

#### SearchMap Component (`src/components/SearchMap.tsx`)
- **Auto-detection**: Automatically detects user location on component mount
- **Location search**: Allows users to search for events in specific cities
- **Refresh functionality**: Manual refresh button for current location
- **Error handling**: Comprehensive error handling with user-friendly messages
- **Loading states**: Visual feedback during API calls

#### JamBaseLocationService (`src/services/jambaseLocationService.ts`)
- **Auto-fetch method**: `autoFetchEventsForUserLocation()` - automatically fetches events when location is detected
- **Refresh method**: `refreshEventsForLocation()` - refreshes events for a specific location
- **Supabase integration**: Automatically stores events from Jambase API in Supabase
- **Fallback handling**: Falls back to database search if API fails

### Backend Integration

#### Location Search Routes (`backend/location-search-routes.js`)
- **Jambase API calls**: Fetches events from Jambase API by location
- **Supabase storage**: Automatically stores fetched events in database
- **Error handling**: Comprehensive error handling and fallbacks
- **City support**: Supports major US cities and coordinate-based searches

## API Flow

### 1. User Location Detection
```
User visits map → Browser geolocation → JamBase API call → Supabase storage → Map display
```

### 2. Location Search
```
User enters city → City lookup → JamBase API call → Supabase storage → Map display
```

### 3. Event Refresh
```
User clicks refresh → JamBase API call → Supabase storage → Map display
```

## Database Schema

Events are stored in the `jambase_events` table with the following key fields:
- `jambase_event_id`: Unique identifier from Jambase
- `title`: Event title
- `artist_name`: Artist name
- `venue_name`: Venue name
- `event_date`: Event date
- `latitude`/`longitude`: Event coordinates
- `venue_city`/`venue_state`: Venue location
- `last_synced_at`: Last sync timestamp

## Error Handling

### Location Detection Errors
- **Permission denied**: Falls back to general events
- **Timeout**: Falls back to general events
- **API failure**: Falls back to database search

### Search Errors
- **Invalid city**: Shows error message with suggestions
- **API failure**: Falls back to database search
- **Network error**: Shows retry message

## User Experience

### Visual Feedback
- **Toast notifications**: Success/error messages for all operations
- **Loading states**: Spinner on refresh button during API calls
- **Event count**: Shows number of events found
- **Location indicator**: Shows when events are personalized for user location

### Responsive Design
- **Map integration**: Events displayed on interactive map
- **Event details**: Popup with event information on map markers
- **Mobile friendly**: Responsive design for all screen sizes

## Testing

### Test Script
Run `node test-location-events.js` to test the integration:
- Tests location search for major cities
- Tests coordinate-based search
- Tests auto-fetch functionality
- Tests refresh functionality

### Manual Testing
1. **Location detection**: Allow location access and verify events load
2. **Location search**: Search for different cities and verify events load
3. **Refresh**: Click refresh button and verify new events load
4. **Error handling**: Test with location access denied

## Configuration

### Environment Variables
- `VITE_JAMBASE_API_KEY`: Jambase API key for event fetching
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key

### Backend Configuration
- Backend server runs on port 3001
- Location search API endpoint: `/api/jambase/location-search`
- Supports both POST and GET requests

## Future Enhancements

### Potential Improvements
1. **Periodic refresh**: Automatically refresh events every hour
2. **Push notifications**: Notify users of new events near them
3. **Event filtering**: Filter events by genre, date, or price
4. **Offline support**: Cache events for offline viewing
5. **Analytics**: Track which locations generate the most events

### Performance Optimizations
1. **Caching**: Cache API responses to reduce API calls
2. **Debouncing**: Debounce search input to reduce API calls
3. **Pagination**: Implement pagination for large result sets
4. **Background sync**: Sync events in background

## Troubleshooting

### Common Issues
1. **No events found**: Check if location is supported or try a major city
2. **API errors**: Verify Jambase API key is valid
3. **Database errors**: Check Supabase connection and table schema
4. **Location access**: Ensure user grants location permission

### Debug Information
- Check browser console for detailed logs
- Verify backend server is running
- Check Supabase logs for database errors
- Monitor Jambase API rate limits
