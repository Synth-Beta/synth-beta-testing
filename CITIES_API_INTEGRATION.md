# Jambase Cities API Integration

## Overview
This integration uses the new Jambase Cities API endpoint (`/geographies/cities`) to find cities with upcoming events near a user's location, then fetches events for those cities. This provides a more comprehensive and efficient way to discover events in a geographic area.

## New Features

### 1. Cities API Integration
- **Endpoint**: `https://www.jambase.com/jb-api/v1/geographies/cities`
- **Purpose**: Find cities with upcoming events near a location
- **Benefits**: More comprehensive coverage, better event discovery, ordered by event count

### 2. Enhanced Location Search
- **Method**: `searchEventsViaCities()` - finds cities near location, then gets events for top cities
- **Coverage**: Searches within 100-mile radius by default
- **Intelligence**: Prioritizes cities with most upcoming events
- **Efficiency**: Gets events from top 5 cities with most events

### 3. Cities Database Storage
- **Table**: `jambase_cities` - stores city data from JamBase API
- **Fields**: City name, coordinates, upcoming events count, metro area info
- **Indexing**: Optimized for geographic and event count queries

## Technical Implementation

### New Services

#### JamBaseCitiesService (`src/services/jambaseCitiesService.ts`)
- **searchCities()**: Main method to search cities with various parameters
- **searchCitiesByName()**: Search cities by name
- **searchCitiesByCoordinates()**: Search cities by lat/lng coordinates
- **searchCitiesByState()**: Search cities by state
- **getTopCities()**: Get cities with most upcoming events
- **storeCitiesInSupabase()**: Store cities in database

#### Enhanced JamBaseLocationService
- **searchEventsViaCities()**: New method that uses cities API
- **Process**: Find cities → Store cities → Get events for top cities → Return unique events
- **Fallback**: Falls back to original events API if cities API fails

### Database Schema

#### jambase_cities Table
```sql
CREATE TABLE jambase_cities (
  id UUID PRIMARY KEY,
  jambase_city_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  state TEXT,
  country TEXT NOT NULL,
  latitude DECIMAL(10, 8) NOT NULL,
  longitude DECIMAL(11, 8) NOT NULL,
  upcoming_events_count INTEGER DEFAULT 0,
  metro_id TEXT,
  metro_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

### API Parameters Supported

#### Geographic Search
- `geoCityName`: Search by city name
- `geoCountryIso2`: Country code (e.g., "US")
- `geoStateIso`: State code (e.g., "US-NY")
- `geoLatitude` + `geoLongitude`: Coordinate-based search
- `geoRadiusAmount`: Search radius (1-5000)
- `geoRadiusUnits`: "mi" or "km"

#### Filtering
- `cityHasUpcomingEvents`: Only cities with upcoming events
- `page`: Pagination
- `perPage`: Results per page (1-100)

## How It Works

### 1. User Location Detection
```
User visits map → Get coordinates → Search cities API → Find top cities → Get events for each city → Display on map
```

### 2. City Search
```
User enters city → Search cities API → Find nearby cities → Get events for top cities → Display on map
```

### 3. Data Flow
```
Cities API → Store cities in Supabase → Events API for each city → Store events in Supabase → Return to frontend
```

## Benefits Over Previous Implementation

### 1. Better Coverage
- **Before**: Single location search with 25-mile radius
- **After**: Multi-city search with 100-mile radius, covering multiple metropolitan areas

### 2. Smarter Event Discovery
- **Before**: Random events within radius
- **After**: Events from cities with most upcoming events, prioritized by activity

### 3. More Comprehensive Results
- **Before**: Limited to immediate area
- **After**: Covers entire metropolitan regions and nearby cities

### 4. Better Data Quality
- **Before**: Direct events API calls
- **After**: Cities API provides event counts, better geographic data

## Example Results

### New York Search (100-mile radius)
- **Cities Found**: 132 cities
- **Top Cities**: New York (1609 events), Brooklyn (935 events), Philadelphia (777 events)
- **Coverage**: NYC metro area, Philadelphia metro area, New Jersey cities

### Los Angeles Search (100-mile radius)
- **Cities Found**: 89 cities
- **Top Cities**: Los Angeles, San Diego, Las Vegas, Phoenix
- **Coverage**: Southern California, Nevada, Arizona

## Performance Optimizations

### 1. Intelligent City Selection
- Only processes top 5 cities with most events
- Reduces API calls while maximizing event coverage

### 2. Duplicate Removal
- Removes duplicate events across cities
- Ensures unique event list

### 3. Caching
- Cities stored in Supabase for future use
- Reduces API calls for repeated searches

### 4. Error Handling
- Graceful fallback to original events API
- Continues processing even if some cities fail

## Configuration

### Environment Variables
- `VITE_JAMBASE_API_KEY`: Jambase API key
- `SUPABASE_URL`: Supabase project URL
- `SUPABASE_ANON_KEY`: Supabase anonymous key

### Search Parameters
- **Default radius**: 100 miles
- **Max cities processed**: 5
- **Events per city**: 20
- **City radius**: 25 miles around each city

## Testing

### API Testing
```bash
# Test cities API directly
curl "https://www.jambase.com/jb-api/v1/geographies/cities?geoCityName=New%20York&geoCountryIso2=US&cityHasUpcomingEvents=true&perPage=5&apikey=YOUR_KEY"

# Test coordinate search
curl "https://www.jambase.com/jb-api/v1/geographies/cities?geoLatitude=40.7128&geoLongitude=-74.006&geoRadiusAmount=100&geoRadiusUnits=mi&cityHasUpcomingEvents=true&perPage=10&apikey=YOUR_KEY"
```

### Frontend Testing
1. **Location detection**: Allow location access, verify cities and events load
2. **City search**: Search for different cities, verify comprehensive results
3. **Refresh**: Click refresh button, verify new cities and events load

## Future Enhancements

### Potential Improvements
1. **Metro area grouping**: Group cities by metropolitan area
2. **Event genre filtering**: Filter events by genre per city
3. **Date range filtering**: Filter events by date range
4. **City recommendations**: Suggest cities based on user preferences
5. **Real-time updates**: Update city event counts in real-time

### Performance Optimizations
1. **Background sync**: Sync cities and events in background
2. **Predictive loading**: Pre-load cities for common locations
3. **Smart caching**: Cache based on user location patterns
4. **Batch processing**: Process multiple cities in parallel

## Troubleshooting

### Common Issues
1. **No cities found**: Check radius and location parameters
2. **API rate limits**: Monitor JamBase API usage
3. **Database errors**: Check Supabase connection and schema
4. **Empty results**: Verify city has upcoming events

### Debug Information
- Check browser console for detailed logs
- Monitor API response times and success rates
- Verify database table creation and data storage
- Check city and event counts in results

## Migration Notes

### From Events API to Cities API
- **Backward compatible**: Original events API still works as fallback
- **Gradual rollout**: Can be enabled/disabled per user or location
- **Data migration**: Existing events data remains unchanged
- **Performance**: New method is more comprehensive but may be slower

### Database Changes
- **New table**: `jambase_cities` added
- **No breaking changes**: Existing `jambase_events` table unchanged
- **Indexes**: Added for better query performance
- **RLS policies**: Configured for public read access
