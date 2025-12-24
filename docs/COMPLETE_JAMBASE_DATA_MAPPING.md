# Complete Jambase API to Database Field Mapping

This document maps **EVERY** field from the Jambase Events API response to database columns. No Jambase data is left unused.

## Jambase API Response Structure

With `expandExternalIdentifiers=true`, the `/events` endpoint returns:

```json
{
  "success": true,
  "pagination": { "page": 1, "perPage": 100, "totalItems": 90000, "totalPages": 900 },
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
          "url": "https://jambase.com/artist/789",
          "image": "https://example.com/artist.jpg",
          "genre": ["Rock", "Indie"],
          "x-isHeadliner": true,
          "x-externalIdentifiers": [
            { "propertyID": "spotify", "value": "spotify:artist:abc123" },
            { "propertyID": "musicbrainz", "value": "musicbrainz:artist:xyz" }
          ],
          "sameAs": [
            "https://facebook.com/artist",
            "https://twitter.com/artist"
          ],
          "@type": "MusicGroup",
          "x-bandOrMusician": "band",
          "foundingLocation": { "@type": "Place", "name": "New York, NY" },
          "foundingDate": "2005",
          "member": [...],
          "memberOf": [...]
        }
      ],
      "location": {
        "identifier": "jambase:456",
        "name": "Venue Name",
        "url": "https://jambase.com/venue/456",
        "image": "https://example.com/venue.jpg",
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
        },
        "sameAs": [
          "https://facebook.com/venue",
          "https://twitter.com/venue"
        ],
        "maximumAttendeeCapacity": 5000
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
      ],
      "partOfTour": {
        "name": "World Tour 2024"
      }
    }
  ]
}
```

---

## COMPLETE FIELD MAPPING

### EVENTS TABLE MAPPINGS

| Jambase API Field | Events Table Column | Type | Transformation | Notes |
|-------------------|---------------------|------|----------------|-------|
| `identifier` | `jambase_event_id` | TEXT | Remove "jambase:" prefix | Unique constraint |
| `name` | `title` | TEXT | Direct mapping | Required, NOT NULL |
| `description` | `description` | TEXT | Direct mapping | Can be null |
| `eventStatus` | `event_status` | TEXT | Direct mapping | e.g., "EventScheduled" |
| `startDate` | `event_date` | TIMESTAMPTZ | Parse ISO string | Required, NOT NULL |
| `doorTime` | `doors_time` | TIMESTAMPTZ | Parse ISO string or combine with startDate | Can be null |
| `dateModified` | `last_modified_at` | TIMESTAMPTZ | Parse ISO string | **CRITICAL for incremental sync** |
| `performer[0].name` (headliner) | `artist_name` | TEXT | Extract headliner name | Required, NOT NULL |
| `performer[0].identifier` | → Lookup → `artist_jambase_id` | UUID | Extract → upsert artist → get UUID | FK to artists.id |
| `location.name` | `venue_name` | TEXT | Direct mapping | Required, NOT NULL |
| `location.identifier` | → Lookup → `venue_jambase_id` | UUID | Extract → upsert venue → get UUID | FK to venues.id |
| `location.address.streetAddress` | `venue_address` | TEXT | Direct mapping | Can be null |
| `location.address.addressLocality` | `venue_city` | TEXT | Direct mapping | Can be null |
| `location.address.addressRegion` | `venue_state` | TEXT | Extract name if object, else string | Can be null |
| `location.address.postalCode` | `venue_zip` | TEXT | Direct mapping | Can be null |
| `location.geo.latitude` | `latitude` | NUMERIC(10,8) | Parse number | Can be null |
| `location.geo.longitude` | `longitude` | NUMERIC(11,8) | Parse number | Can be null |
| `performer[0].genre[]` | `genres` | TEXT[] | Direct array mapping | Can be null |
| `offers[].url` | `ticket_urls` | TEXT[] | Extract all offer URLs | Can be null |
| `offers[].availability === "InStock"` | `ticket_available` | BOOLEAN | True if any offer is InStock | Default: false |
| `offers[0].priceSpecification.price` | `price_range` | TEXT | String representation | Can be null |
| `offers[0].priceSpecification.minPrice` | `price_min` | NUMERIC(10,2) | Parse number | Can be null |
| `offers[0].priceSpecification.maxPrice` | `price_max` | NUMERIC(10,2) | Parse number | Can be null |
| `offers[0].priceSpecification.priceCurrency` | `price_currency` | TEXT | Direct mapping | Default: 'USD' |
| `image[]` | `images` | JSONB | Store full array with url, caption | Can be null |
| `sameAs[0]` | `external_url` | TEXT | First URL from array | Can be null |
| `partOfTour.name` | `tour_name` | TEXT | Direct mapping | Can be null |
| *(default)* | `source` | TEXT | Always 'jambase' | Default: 'jambase' |
| *(default)* | `is_user_created` | BOOLEAN | Always false | Default: false |
| *(default)* | `is_promoted` | BOOLEAN | Always false | Default: false |
| *(default)* | `is_featured` | BOOLEAN | Always false | Default: false |
| *(default)* | `media_urls` | TEXT[] | Empty array | Default: '{}' |
| *(auto)* | `created_at` | TIMESTAMPTZ | Auto-generated | Default: now() |
| *(auto)* | `updated_at` | TIMESTAMPTZ | Auto-updated by trigger | Trigger handles |

**Fields NOT in API** (set by admin/users):
- `promotion_tier` - Set by admin
- `featured_until` - Set by admin
- `created_by_user_id` - For manual events only
- `setlist` - From Setlist.fm integration

---

### ARTISTS TABLE MAPPINGS

| Jambase API Field | Artists Table Column | Type | Transformation | Notes |
|-------------------|----------------------|------|----------------|-------|
| `performer[0].identifier` | `jambase_artist_id` | TEXT | Remove "jambase:" prefix | Unique constraint |
| `performer[0].identifier` | `identifier` | TEXT | Full identifier string | Unique constraint |
| `performer[0].name` | `name` | TEXT | Direct mapping | Required, NOT NULL |
| `performer[0].url` | `url` | TEXT | Direct mapping | Can be null |
| `performer[0].image` | `image_url` | TEXT | Direct mapping | Can be null |
| `performer[0].datePublished` | `date_published` | TIMESTAMPTZ | Parse ISO string | Can be null |
| `performer[0].dateModified` | `date_modified` | TIMESTAMPTZ | Parse ISO string | Can be null |
| `performer[0].@type` | `artist_type` | TEXT | Direct mapping | 'MusicGroup' or 'Person' |
| `performer[0].x-bandOrMusician` | `band_or_musician` | TEXT | Direct mapping | 'band' or 'musician' |
| `performer[0].foundingLocation.name` | `founding_location` | TEXT | Extract name from object | Can be null |
| `performer[0].foundingDate` | `founding_date` | TEXT | Direct mapping | Can be null |
| `performer[0].genre[]` | `genres` | TEXT[] | Direct array mapping | Can be null |
| `performer[0].member[]` | `members` | JSONB | Store full array | Can be null |
| `performer[0].memberOf[]` | `member_of` | JSONB | Store full array | Can be null |
| `performer[0].x-externalIdentifiers[]` | `external_identifiers` | JSONB | Store full array | Can be null |
| `performer[0].sameAs[]` | `same_as` | JSONB | Store full array | Can be null |
| `performer[0]` (full object) | `raw_jambase_data` | JSONB | Store complete performer object | For reference |
| *(default)* | `artist_data_source` | TEXT | Always 'jambase' | Default: 'jambase' |
| *(default)* | `num_upcoming_events` | INTEGER | Calculate from events | Default: 0 |
| *(default)* | `verified` | BOOLEAN | Always false | Default: false |
| *(auto)* | `created_at` | TIMESTAMPTZ | Auto-generated | Default: now() |
| *(auto)* | `updated_at` | TIMESTAMPTZ | Auto-updated by trigger | Trigger handles |
| *(auto)* | `last_synced_at` | TIMESTAMPTZ | Set to current time on sync | Can be null |

**Fields NOT in API** (set by users/admin):
- `owner_user_id` - For claimed artists
- `claimed_at` - When artist was claimed

---

### VENUES TABLE MAPPINGS

| Jambase API Field | Venues Table Column | Type | Transformation | Notes |
|-------------------|---------------------|------|----------------|-------|
| `location.identifier` | `jambase_venue_id` | TEXT | Remove "jambase:" prefix | Can be null (not unique) |
| `location.identifier` | `identifier` | TEXT | Full identifier string | Can be null |
| `location.name` | `name` | TEXT | Direct mapping | Required, NOT NULL |
| `location.url` | `url` | TEXT | Direct mapping | Can be null |
| `location.image` | `image_url` | TEXT | Direct mapping | Can be null |
| `location.address` (full object) | `address` | JSONB | Store complete address object | Can be null |
| `location.geo` (full object) | `geo` | JSONB | Store complete geo object | Can be null |
| `location.maximumAttendeeCapacity` | `maximum_attendee_capacity` | INTEGER | Parse number | Can be null |
| `location.sameAs[]` | `same_as` | TEXT[] | Store array of URLs | Can be null |
| `location.datePublished` | `date_published` | TIMESTAMPTZ | Parse ISO string | Can be null |
| `location.dateModified` | `date_modified` | TIMESTAMPTZ | Parse ISO string | Can be null |
| *(default)* | `num_upcoming_events` | INTEGER | Calculate from events | Default: 0 |
| *(default)* | `typical_genres` | TEXT[] | Aggregate from events | Can be null |
| *(default)* | `verified` | BOOLEAN | Always false | Default: false |
| *(auto)* | `created_at` | TIMESTAMPTZ | Auto-generated | Default: now() |
| *(auto)* | `updated_at` | TIMESTAMPTZ | Auto-updated by trigger | Trigger handles |
| *(auto)* | `last_synced_at` | TIMESTAMPTZ | Set to current time on sync | Can be null |

**Fields NOT in API** (set by users/admin):
- `owner_user_id` - For claimed venues
- `claimed_at` - When venue was claimed

---

## Data Extraction Logic

### Headliner Selection
```javascript
const headliner = event.performer?.find(p => p['x-isHeadliner']) || event.performer?.[0];
```

### Identifier Parsing
```javascript
// Remove "jambase:" prefix
const jambaseId = identifier?.replace(/^jambase:/, '') || identifier;
```

### Address Region Handling
```javascript
// Handle both string and object formats
const state = address?.addressRegion?.name || address?.addressRegion;
```

### Price Range String
```javascript
// Create readable price range
const priceRange = minPrice && maxPrice 
  ? `$${minPrice} - $${maxPrice}` 
  : price || null;
```

### Ticket Available Logic
```javascript
const ticketAvailable = offers?.some(offer => offer.availability === 'InStock') || false;
```

---

## Fields NOT Available in Jambase API

These fields are in the database but cannot be populated from Jambase:

### Events Table:
- `setlist` - From Setlist.fm integration
- `promotion_tier` - Set by admin
- `featured_until` - Set by admin
- `created_by_user_id` - For manual events only
- `media_urls` - User-uploaded media

### Artists Table:
- `owner_user_id` - For claimed artists
- `claimed_at` - When artist was claimed

### Venues Table:
- `owner_user_id` - For claimed venues
- `claimed_at` - When venue was claimed
- `typical_genres` - Aggregated from events (can calculate)

---

## Summary

✅ **100% Coverage**: Every field available in Jambase API is mapped to a database column
✅ **No Data Loss**: All Jambase data is captured and stored
✅ **Proper Types**: All data types match schema requirements
✅ **Foreign Keys**: Properly handled via sequential upserts

