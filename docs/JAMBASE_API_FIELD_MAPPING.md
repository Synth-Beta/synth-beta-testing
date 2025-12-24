# Jambase API to Events Table Field Mapping

This document maps every field from the Jambase API Events Search response to the `events` table schema.

## API Response Structure

Based on the Jambase API v1 `/events` endpoint with `expandExternalIdentifiers=true`:

```json
{
  "success": true,
  "pagination": { ... },
  "events": [
    {
      "identifier": "jambase:123456",
      "name": "Event Title",
      "startDate": "2024-01-15T20:00:00Z",
      "endDate": "2024-01-15T23:00:00Z",
      "doorTime": "2024-01-15T19:00:00Z",
      "dateModified": "2024-01-10T12:00:00Z",
      "datePublished": "2024-01-01T00:00:00Z",
      "description": "Event description...",
      "eventStatus": "EventScheduled",
      "performer": [
        {
          "identifier": "jambase:789",
          "name": "Artist Name",
          "genre": ["Rock", "Indie"],
          "x-isHeadliner": true
        }
      ],
      "location": {
        "identifier": "jambase:456",
        "name": "Venue Name",
        "address": {
          "streetAddress": "123 Main St",
          "addressLocality": "City",
          "addressRegion": "State",
          "postalCode": "12345",
          "addressCountry": "US"
        },
        "geo": {
          "latitude": 40.7128,
          "longitude": -74.0060
        }
      },
      "offers": [
        {
          "url": "https://tickets.example.com/event/123",
          "availability": "InStock",
          "priceSpecification": {
            "price": "50.00",
            "minPrice": "25.00",
            "maxPrice": "100.00",
            "priceCurrency": "USD"
          }
        }
      ],
      "image": [
        {
          "url": "https://example.com/image.jpg",
          "caption": "Event image"
        }
      ],
      "sameAs": [
        "https://facebook.com/event/123",
        "https://twitter.com/event/123"
      ]
    }
  ]
}
```

## Complete Field Mapping

### Event Identification

| Jambase API Field | Events Table Column | Type | Notes |
|-------------------|---------------------|------|-------|
| `identifier` | `jambase_event_id` | TEXT | Remove "jambase:" prefix |
| `identifier` | `id` | UUID | Generated UUID (primary key) |

### Event Basic Information

| Jambase API Field | Events Table Column | Type | Notes |
|-------------------|---------------------|------|-------|
| `name` | `title` | TEXT | Required, NOT NULL |
| `description` | `description` | TEXT | Can be null |
| `eventStatus` | `event_status` | TEXT | e.g., "EventScheduled", "EventCancelled" |
| `source` | `source` | TEXT | Default: 'jambase' |

### Dates & Times

| Jambase API Field | Events Table Column | Type | Notes |
|-------------------|---------------------|------|-------|
| `startDate` | `event_date` | TIMESTAMPTZ | Required, NOT NULL |
| `endDate` | *(not stored)* | - | Can be calculated if needed |
| `doorTime` | `doors_time` | TIMESTAMPTZ | Can be null |
| `dateModified` | `last_modified_at` | TIMESTAMPTZ | **NEW COLUMN** - Used for incremental sync |
| `datePublished` | *(not stored)* | - | Not needed for sync |

### Artist Information

| Jambase API Field | Events Table Column | Type | Notes |
|-------------------|---------------------|------|-------|
| `performer[0].name` (headliner) | `artist_name` | TEXT | Required, NOT NULL |
| `performer[0].identifier` | Lookup → `artists.jambase_artist_id` → `artists.id` | UUID | FK to `artists.id` stored in `artist_jambase_id` |
| `performer[].genre` | `genres` | TEXT[] | Array of genre strings |

**Note**: The sync process should:
1. Extract `performer[0]` (headliner) or find performer with `x-isHeadliner: true`
2. Upsert artist into `artists` table using `jambase_artist_id`
3. Store the artist's UUID in `events.artist_jambase_id`

### Venue Information

| Jambase API Field | Events Table Column | Type | Notes |
|-------------------|---------------------|------|-------|
| `location.name` | `venue_name` | TEXT | Required, NOT NULL |
| `location.identifier` | Lookup → `venues.jambase_venue_id` → `venues.id` | UUID | FK to `venues.id` stored in `venue_jambase_id` |
| `location.address.streetAddress` | `venue_address` | TEXT | Can be null |
| `location.address.addressLocality` | `venue_city` | TEXT | Can be null |
| `location.address.addressRegion` | `venue_state` | TEXT | Can be null |
| `location.address.postalCode` | `venue_zip` | TEXT | Can be null |
| `location.geo.latitude` | `latitude` | NUMERIC(10,8) | Can be null |
| `location.geo.longitude` | `longitude` | NUMERIC(11,8) | Can be null |

**Note**: The sync process should:
1. Extract `location` object
2. Upsert venue into `venues` table using `jambase_venue_id`
3. Store the venue's UUID in `events.venue_jambase_id`

### Ticketing Information

| Jambase API Field | Events Table Column | Type | Notes |
|-------------------|---------------------|------|-------|
| `offers[].url` | `ticket_urls` | TEXT[] | Array of ticket URLs |
| `offers[].availability === "InStock"` | `ticket_available` | BOOLEAN | True if any offer is InStock |
| `offers[0].priceSpecification.price` | `price_range` | TEXT | String representation |
| `offers[0].priceSpecification.minPrice` | `price_min` | NUMERIC(10,2) | Can be null |
| `offers[0].priceSpecification.maxPrice` | `price_max` | NUMERIC(10,2) | Can be null |
| `offers[0].priceSpecification.priceCurrency` | `price_currency` | TEXT | Default: 'USD' |

### Media & Additional Data

| Jambase API Field | Events Table Column | Type | Notes |
|-------------------|---------------------|------|-------|
| `image[]` | `images` | JSONB | Array of image objects with url, caption |
| `sameAs[]` | `external_url` | TEXT | First URL, or can store in JSONB if multiple needed |
| `sameAs[]` | *(not stored)* | - | Additional URLs not stored (can add if needed) |

### Tour & Setlist

| Jambase API Field | Events Table Column | Type | Notes |
|-------------------|---------------------|------|-------|
| `tour.name` or `partOfTour` | `tour_name` | TEXT | Can be null |
| *(not in API)* | `setlist` | JSONB | Populated from Setlist.fm integration, not Jambase |

### User & Promotion Fields

| Jambase API Field | Events Table Column | Type | Notes |
|-------------------|---------------------|------|-------|
| *(not in API)* | `is_user_created` | BOOLEAN | Default: false (only true for manual events) |
| *(not in API)* | `is_promoted` | BOOLEAN | Default: false (set by admin) |
| *(not in API)* | `promotion_tier` | TEXT | 'basic', 'premium', 'featured' (set by admin) |
| *(not in API)* | `is_featured` | BOOLEAN | Default: false (set by admin) |
| *(not in API)* | `featured_until` | TIMESTAMPTZ | Set by admin |
| *(not in API)* | `created_by_user_id` | UUID | FK to users (for manual events) |
| *(not in API)* | `media_urls` | TEXT[] | User-uploaded media |

### Timestamps

| Jambase API Field | Events Table Column | Type | Notes |
|-------------------|---------------------|------|-------|
| *(auto-generated)* | `created_at` | TIMESTAMPTZ | Auto-set on insert |
| *(auto-generated)* | `updated_at` | TIMESTAMPTZ | Auto-updated by trigger |
| `dateModified` | `last_modified_at` | TIMESTAMPTZ | **NEW COLUMN** - From API, used for incremental sync |

## Fields NOT Mapped (Available in API but Not Stored)

These fields are available in the Jambase API but are not currently stored in the events table:

- `endDate` - Event end time (can be calculated if needed)
- `datePublished` - When event was first published
- `performer[]` (all performers) - Only headliner is stored
- `location.address.addressCountry` - Country code
- `sameAs[]` (all URLs) - Only first URL stored in `external_url`
- `image[].caption` - Image captions (stored in JSONB but not indexed)

## Sync Process Flow

1. **Fetch Events** from Jambase API with `expandExternalIdentifiers=true`
2. **For each event:**
   - Extract `identifier` → `jambase_event_id`
   - Extract `dateModified` → `last_modified_at`
   - Extract headliner from `performer[]` → upsert to `artists` → get UUID → `artist_jambase_id`
   - Extract `location` → upsert to `venues` → get UUID → `venue_jambase_id`
   - Map all other fields per mapping above
   - Upsert to `events` table using `jambase_event_id` as conflict key

3. **For incremental sync:**
   - Query events where `last_modified_at < MAX(dateModified from API)`
   - Or use `dateModifiedFrom` parameter in API call

## Data Type Notes

- **TEXT[]**: Array of strings (e.g., genres, ticket_urls, media_urls)
- **JSONB**: JSON object/array (e.g., images, setlist)
- **NUMERIC**: Decimal numbers with precision (latitude: 10,8; longitude: 11,8; prices: 10,2)
- **TIMESTAMPTZ**: Timestamp with timezone
- **UUID**: Foreign key references

## Validation Rules

- `jambase_event_id` must be unique
- `title`, `artist_name`, `venue_name`, `event_date` are required (NOT NULL)
- `source` must be one of: 'jambase', 'ticketmaster', 'manual'
- `promotion_tier` must be one of: 'basic', 'premium', 'featured' (if set)
- `price_currency` defaults to 'USD'
- `is_user_created` defaults to false (true only for manually created events)

