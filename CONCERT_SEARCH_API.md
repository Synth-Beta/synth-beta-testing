# Concert Search API Documentation

## Overview

The Concert Search API provides fuzzy search functionality for concert events using JamBase API integration, Fuse.js for fuzzy matching, and Supabase for data persistence. This implementation follows the exact specifications provided.

## API Endpoint

**POST** `/api/search-concerts`

**Content-Type:** `application/json`

## Request Schema

### Required Fields
- `query` (string, 1-100 characters): Search query for artist or venue

### Optional Fields
- `filters` (object):
  - `dateRange` (object):
    - `startDate` (ISO date): Start date for event search
    - `endDate` (ISO date): End date for event search (must be after startDate)
  - `location` (object):
    - `city` (string, max 50 chars): City name
    - `state` (string, 2 chars): Two-letter state code
    - `zipCode` (string, 5 digits): ZIP code
    - `radius` (number, 1-500): Search radius in miles (default: 25)
  - `genres` (array, max 10 items): Array of genre strings (max 20 chars each)

- `options` (object):
  - `limit` (number, 5-20): Number of results to return (default: 15)
  - `fuzzyThreshold` (number, 0.1-1.0): Fuzzy search threshold (default: 0.6)

## Example Requests

### Basic Search
```json
{
  "query": "Taylor Swift",
  "options": {
    "limit": 10,
    "fuzzyThreshold": 0.6
  }
}
```

### Advanced Search with Filters
```json
{
  "query": "Rock Concert",
  "filters": {
    "dateRange": {
      "startDate": "2024-01-01",
      "endDate": "2024-12-31"
    },
    "location": {
      "city": "New York",
      "state": "NY",
      "radius": 50
    },
    "genres": ["Rock", "Alternative"]
  },
  "options": {
    "limit": 15,
    "fuzzyThreshold": 0.7
  }
}
```

### Venue Search
```json
{
  "query": "Madison Square Garden",
  "options": {
    "limit": 5,
    "fuzzyThreshold": 0.5
  }
}
```

## Response Format

### Success Response (200)
```json
{
  "success": true,
  "results": [
    {
      "jambase_event_id": "12345",
      "title": "Taylor Swift - The Eras Tour",
      "artist_name": "Taylor Swift",
      "artist_id": "67890",
      "venue_name": "Madison Square Garden",
      "venue_id": "11111",
      "venue_city": "New York",
      "venue_state": "NY",
      "event_date": "2024-06-15T20:00:00.000Z",
      "doors_time": "2024-06-15T19:00:00.000Z",
      "description": "Live performance by Taylor Swift",
      "genres": ["Pop", "Country"],
      "venue_address": "4 Pennsylvania Plaza",
      "venue_zip": "10001",
      "latitude": 40.7505,
      "longitude": -73.9934,
      "ticket_available": true,
      "price_range": "$75-$500",
      "ticket_urls": ["https://ticketmaster.com/event/12345"],
      "setlist": null,
      "tour_name": "The Eras Tour",
      "created_at": "2024-01-15T10:30:00.000Z",
      "updated_at": "2024-01-15T10:30:00.000Z"
    }
  ],
  "metadata": {
    "total_found": 25,
    "returned": 1,
    "query_used": "Taylor Swift",
    "search_time_ms": 1250
  }
}
```

### Error Responses

#### Validation Error (400)
```json
{
  "success": false,
  "error": "Invalid request parameters",
  "details": [
    {
      "message": "\"query\" is required",
      "path": ["query"],
      "type": "any.required"
    }
  ]
}
```

#### Rate Limit Exceeded (429)
```json
{
  "success": false,
  "error": "Rate limit exceeded, try again later"
}
```

#### Service Unavailable (503)
```json
{
  "success": false,
  "error": "External service unavailable"
}
```

#### Server Error (500)
```json
{
  "success": false,
  "error": "Database operation failed"
}
```

## Implementation Details

### JamBase API Integration
- **Base URL:** `https://www.jambase.com/jb-api/v1/events`
- **Method:** GET with query parameters
- **Timeout:** 10 seconds with 1 retry
- **Parameters:**
  - `apikey`: API key from environment
  - `num`: Always 50 (to get enough results for fuzzy filtering)
  - `page`: Always 0 (first page)
  - `o`: Always 'json'
  - `artist` or `venue`: Based on query content
  - Date and location filters as needed

### Fuzzy Search Configuration
- **Library:** Fuse.js
- **Keys:** Artist name (50%), Venue name (30%), Event name (20%)
- **Threshold:** User-configurable (0.1-1.0, default 0.6)
- **Distance:** 100 characters
- **Min Match Length:** 2 characters
- **Location Ignored:** Yes

### Data Transformation
Events are transformed from JamBase format to match the `jambase_events` table schema:
- Artist and venue information extracted
- Date formatting to ISO strings
- Genre arrays preserved
- Ticket information normalized
- Geographic data included

### Database Operations
- **Table:** `jambase_events`
- **Operation:** Upsert with conflict resolution on `jambase_event_id`
- **Indexes:** Optimized for search performance

### Rate Limiting
- **Limit:** 10 requests per minute per IP
- **Storage:** In-memory (development)
- **Reset:** Every minute

### Performance Targets
- JamBase API call: ≤ 5 seconds
- Fuzzy processing: ≤ 2 seconds
- Database operations: ≤ 3 seconds
- Total response time: ≤ 10 seconds

## Environment Variables

```bash
JAMBASE_API_KEY=your_jambase_api_key
JAMBASE_BASE_URL=https://www.jambase.com/jb-api/v1
SUPABASE_URL=your_supabase_project_url
SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Testing

Use the provided test script:
```bash
cd backend
node test-api.js
```

## Error Handling

The API handles various error scenarios:
- **Validation errors:** Invalid request parameters
- **JamBase API errors:** Timeouts, rate limits, connection issues
- **Database errors:** Connection failures, constraint violations
- **Rate limiting:** Too many requests from same IP

All errors are logged with appropriate detail levels based on environment.

## Logging

The API logs:
- All JamBase API calls (URL, response time, status)
- Fuzzy search performance (events processed, time taken)
- Database operations (insert/update counts)
- Error details with stack traces in development

## Dependencies

- `fuse.js`: Fuzzy search functionality
- `axios`: HTTP client for JamBase API
- `joi`: Request validation
- `@supabase/supabase-js`: Database operations
- `express`: Web framework
