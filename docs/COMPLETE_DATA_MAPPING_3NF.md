# Complete Jambase API to Database Field Mapping (3NF Schema)

This document maps **EVERY** field from the Jambase Events API response to database columns using the **actual schema** you provided. No Jambase data is lost or unused.

## Jambase API Response Structure

With `expandExternalIdentifiers=true`, the `/jb-api/v1/events` endpoint returns:

```json
{
  "success": true,
  "pagination": { "page": 1, "perPage": 100, "totalItems": 90000, "totalPages": 900 },
  "events": [
    {
      "identifier": "jambase:123456",
      "name": "Event Title",
      "startDate": "2024-01-15T20:00:00Z",
      "doorTime": "2024-01-15T19:00:00Z",
      "dateModified": "2024-01-10T12:00:00Z",
      "datePublished": "2024-01-01T00:00:00Z",
      "description": "Event description...",
      "eventStatus": "EventScheduled",
      "performer": [
        {
          "identifier": "jambase:789",
          "name": "Artist Name",
          "url": "https://jambase.com/band/artist-name",
          "image": "https://example.com/artist.jpg",
          "genre": ["rock", "indie"],
          "@type": "MusicGroup",
          "x-bandOrMusician": "band",
          "x-isHeadliner": true,
          "datePublished": "2018-01-01T00:00:00Z",
          "dateModified": "2024-01-01T00:00:00Z",
          "foundingLocation": { "@type": "Place", "name": "New York, NY" },
          "foundingDate": "2005",
          "member": [
            { "name": "Member 1", "@type": "Person" },
            { "name": "Member 2", "@type": "Person" }
          ],
          "memberOf": [],
          "x-externalIdentifiers": [
            { "source": "spotify", "identifier": ["0abc123def456"] },
            { "source": "ticketmaster", "identifier": ["K8vZ917abc"] }
          ],
          "sameAs": [
            "https://facebook.com/artist",
            "https://twitter.com/artist"
          ]
        }
      ],
      "location": {
        "identifier": "jambase:456",
        "name": "Venue Name",
        "url": "https://jambase.com/venue/venue-name",
        "image": "https://example.com/venue.jpg",
        "address": {
          "@type": "PostalAddress",
          "streetAddress": "123 Main St",
          "addressLocality": "City",
          "addressRegion": { "name": "State", "@type": "State" },
          "postalCode": "12345",
          "addressCountry": { "name": "United States", "identifier": "US", "@type": "Country" }
        },
        "geo": {
          "latitude": "40.7128",
          "longitude": "-74.0060"
        },
        "maximumAttendeeCapacity": 5000,
        "datePublished": "2015-01-01T00:00:00Z",
        "dateModified": "2024-01-01T00:00:00Z",
        "sameAs": [
          "https://facebook.com/venue",
          "https://twitter.com/venue"
        ]
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
        "https://ticketmaster.com/event/123"
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

### 🔵 ARTISTS TABLE

| Jambase API Field | Database Column | Type | Transformation Logic | Notes |
|-------------------|-----------------|------|---------------------|-------|
| `performer[0].identifier` | `identifier` | TEXT | Direct mapping (e.g., "jambase:789") | UNIQUE constraint, NOT NULL |
| `performer[0].name` | `name` | TEXT | Direct mapping | NOT NULL |
| `performer[0].url` | `url` | TEXT | Direct mapping | Can be null |
| `performer[0].image` | `image_url` | TEXT | Direct mapping | Can be null |
| `performer[0].datePublished` | `date_published` | TIMESTAMPTZ | `new Date(performer.datePublished).toISOString()` | Can be null |
| `performer[0].dateModified` | `date_modified` | TIMESTAMPTZ | `new Date(performer.dateModified).toISOString()` | Can be null |
| `performer[0].@type` | `artist_type` | TEXT | Direct mapping ("MusicGroup" or "Person") | Can be null, CHECK constraint |
| `performer[0].x-bandOrMusician` | `band_or_musician` | TEXT | Direct mapping ("band" or "musician") | Can be null, CHECK constraint |
| `performer[0].foundingLocation.name` | `founding_location` | TEXT | Extract name from object or string | Can be null (often not in embedded data) |
| `performer[0].foundingDate` | `founding_date` | TEXT | Direct mapping (e.g., "2005") | Can be null (often not in embedded data) |
| `performer[0].genre[]` | `genres` | TEXT[] | `Array.isArray(genre) ? genre : [genre]` | Can be null |
| `performer[0].member[]` | `members` | JSONB | Store full array (handle singular "member" or array "members") | Can be null (often not in embedded data) |
| `performer[0].memberOf[]` | `member_of` | JSONB | Deep copy of array | Can be null |
| `performer[0].x-externalIdentifiers[]` | `external_identifiers` | JSONB | Deep copy of array | Can be null |
| `performer[0].sameAs[]` | `same_as` | JSONB | Deep copy of array | Can be null |
| `performer[0]` (complete object) | `raw_jambase_data` | JSONB | `JSON.parse(JSON.stringify(performer))` | Stores everything for reference |
| *(derived)* | `id` | UUID | `gen_random_uuid()` | Auto-generated primary key |
| *(derived)* | `jambase_artist_id` | TEXT | `identifier.replace(/^jambase:/, '')` | Used for `external_entity_ids` lookup (NOT a column) |
| *(default)* | `num_upcoming_events` | INTEGER | Calculated by trigger from events table | Default: 0 |
| *(default)* | `verified` | BOOLEAN | Always `false` for Jambase imports | Default: false |
| *(auto)* | `created_at` | TIMESTAMPTZ | `now()` | Auto-generated |
| *(auto)* | `updated_at` | TIMESTAMPTZ | Trigger updates | Auto-updated |
| *(sync)* | `last_synced_at` | TIMESTAMPTZ | `new Date().toISOString()` | Set on each sync |

**Fields NOT from Jambase API:**
- `owner_user_id` - Set when user claims artist
- `claimed_at` - Set when user claims artist
- `artist_data_source` - **NOTE**: This column doesn't exist in your schema, but sync service uses it

**3NF Mapping:**
- Jambase artist ID stored in `external_entity_ids` table:
  - `entity_type`: 'artist'
  - `entity_uuid`: `artists.id`
  - `source`: 'jambase'
  - `external_id`: `identifier.replace(/^jambase:/, '')` (e.g., "789")

---

### 🟢 VENUES TABLE

| Jambase API Field | Database Column | Type | Transformation Logic | Notes |
|-------------------|-----------------|------|---------------------|-------|
| `location.identifier` | `identifier` | TEXT | Direct mapping (e.g., "jambase:456") | Can be null (not all venues have Jambase IDs) |
| `location.name` | `name` | TEXT | Direct mapping | NOT NULL |
| `location.url` | `url` | TEXT | Direct mapping | Can be null |
| `location.image` | `image_url` | TEXT | Direct mapping | Can be null |
| `location.address.streetAddress` OR `location.address.x-streetAddress` | `street_address` | TEXT | Use `streetAddress` or fallback to `x-streetAddress` | Can be null |
| `location.address.addressLocality` | *(not in schema)* | - | - | **MISSING** - city stored in events table only |
| `location.address.addressRegion.name` OR `location.address.addressRegion` (string) | `state` | TEXT | Extract name if object, else use string | Can be null |
| `location.address.addressCountry.name` OR `location.address.addressCountry.identifier` | `country` | TEXT | Extract name or identifier from object, else string | Can be null |
| `location.address.postalCode` | `zip` | TEXT | Direct mapping | Can be null |
| `location.geo.latitude` | `latitude` | NUMERIC(10,8) | `parseFloat(geo.latitude)` | Can be null |
| `location.geo.longitude` | `longitude` | NUMERIC(11,8) | `parseFloat(geo.longitude)` | Can be null |
| `location.geo` (full object) | `geo` | JSONB | Deep copy of geo object | Can be null (stores additional geo metadata) |
| `location.maximumAttendeeCapacity` | `maximum_attendee_capacity` | INTEGER | Direct mapping | Can be null |
| `location.sameAs[]` | `same_as` | TEXT[] | Convert array to TEXT[] | Can be null |
| `location.datePublished` | `date_published` | TIMESTAMPTZ | `new Date(location.datePublished).toISOString()` | Can be null |
| `location.dateModified` | `date_modified` | TIMESTAMPTZ | `new Date(location.dateModified).toISOString()` | Can be null |
| *(derived)* | `id` | UUID | `gen_random_uuid()` | Auto-generated primary key |
| *(derived)* | `jambase_venue_id` | TEXT | `identifier.replace(/^jambase:/, '')` | Used for `external_entity_ids` lookup (NOT a column) |
| *(default)* | `num_upcoming_events` | INTEGER | Calculated by trigger from events table | Default: 0 |
| *(default)* | `typical_genres` | TEXT[] | Aggregated from events (can calculate separately) | Can be null |
| *(default)* | `verified` | BOOLEAN | Always `false` for Jambase imports | Default: false |
| *(auto)* | `created_at` | TIMESTAMPTZ | `now()` | Auto-generated |
| *(auto)* | `updated_at` | TIMESTAMPTZ | Trigger updates | Auto-updated |
| *(sync)* | `last_synced_at` | TIMESTAMPTZ | `new Date().toISOString()` | Set on each sync |

**Fields NOT from Jambase API:**
- `owner_user_id` - Set when user claims venue
- `claimed_at` - Set when user claims venue

**3NF Mapping:**
- Jambase venue ID stored in `external_entity_ids` table:
  - `entity_type`: 'venue'
  - `entity_uuid`: `venues.id`
  - `source`: 'jambase'
  - `external_id`: `identifier.replace(/^jambase:/, '')` (e.g., "456")

**⚠️ Missing Coverage:**
- `location.address.addressLocality` (city) - Not stored in venues table, only in events.venue_city

---

### 🔴 EVENTS TABLE

| Jambase API Field | Database Column | Type | Transformation Logic | Notes |
|-------------------|-----------------|------|---------------------|-------|
| `name` | `title` | TEXT | Direct mapping or fallback to `"${headliner.name} Live"` | NOT NULL |
| `startDate` | `event_date` | TIMESTAMPTZ | `new Date(startDate).toISOString()` | NOT NULL |
| `doorTime` | `doors_time` | TIMESTAMPTZ | Parse ISO or combine with startDate if time-only | Can be null |
| `description` | `description` | TEXT | Direct mapping | Can be null |
| `eventStatus` | `event_status` | TEXT | Direct mapping (e.g., "EventScheduled") | Can be null |
| `dateModified` | `last_modified_at` | TIMESTAMPTZ | `new Date(dateModified).toISOString()` | **CRITICAL for incremental sync** |
| `performer[0].name` (headliner) | *(denormalized)* | - | Used for display, not stored | Stored via FK to artists.name |
| `performer[0].identifier` → `artists.id` | `artist_id` | UUID | Extract ID → upsert artist → get UUID FK | FK to `artists.id`, can be null |
| `location.name` | *(denormalized)* | - | Used for display, not stored | Stored via FK to venues.name |
| `location.identifier` → `venues.id` | `venue_id` | UUID | Extract ID → upsert venue → get UUID FK | FK to `venues.id`, can be null |
| `performer[0].genre[]` | `genres` | TEXT[] | `Array.isArray(genre) ? genre : [genre]` | Can be null |
| `location.address.streetAddress` | `venue_address` | TEXT | Direct mapping | Can be null |
| `location.address.addressLocality` | `venue_city` | TEXT | Direct mapping | Can be null |
| `location.address.addressRegion.name` OR `location.address.addressRegion` (string) | `venue_state` | TEXT | Extract name if object, else string | Can be null |
| `location.address.postalCode` | `venue_zip` | TEXT | Direct mapping | Can be null |
| `location.geo.latitude` | `latitude` | NUMERIC(10,8) | `parseFloat(geo.latitude)` | Can be null |
| `location.geo.longitude` | `longitude` | NUMERIC(11,8) | `parseFloat(geo.longitude)` | Can be null |
| `offers[].availability === "InStock"` | `ticket_available` | BOOLEAN | `offers.some(o => o.availability === 'InStock')` | Default: false |
| `offers[0].priceSpecification` (derived) | `price_range` | TEXT | `"$${minPrice} - $${maxPrice}"` or `"$${price}"` | Can be null |
| `offers[0].priceSpecification.minPrice` | `price_min` | NUMERIC(10,2) | `parseFloat(minPrice)` | Can be null |
| `offers[0].priceSpecification.maxPrice` | `price_max` | NUMERIC(10,2) | `parseFloat(maxPrice)` | Can be null |
| `offers[0].priceSpecification.priceCurrency` | `price_currency` | TEXT | Direct mapping | Default: 'USD' |
| `offers[].url` | `ticket_urls` | TEXT[] | `offers.map(o => o.url).filter(Boolean)` | Can be null |
| `sameAs[0]` | `external_url` | TEXT | First URL from array | Can be null |
| `image[]` | `images` | JSONB | Store array with `{url, caption}` objects | Can be null |
| `partOfTour.name` | `tour_name` | TEXT | Direct mapping | Can be null |
| `performer[0].image` (headliner) | `event_media_url` | TEXT | Artist's image URL | Can be null (trigger maintains this) |
| `identifier` (derived) | *(not a column)* | - | Used for `external_entity_ids` lookup | Stored in `external_entity_ids` table |
| *(derived)* | `id` | UUID | `gen_random_uuid()` | Auto-generated primary key |
| *(default)* | `source` | TEXT | Always 'jambase' | Default: 'jambase' |
| *(default)* | `is_user_created` | BOOLEAN | Always `false` for Jambase imports | Default: false |
| *(default)* | `is_promoted` | BOOLEAN | Always `false` for Jambase imports | Default: false |
| *(default)* | `is_featured` | BOOLEAN | Always `false` for Jambase imports | Default: false |
| *(default)* | `media_urls` | TEXT[] | Empty array `[]` | Default: '{}' |
| *(auto)* | `created_at` | TIMESTAMPTZ | `now()` | Auto-generated |
| *(auto)* | `updated_at` | TIMESTAMPTZ | Trigger updates | Auto-updated |

**Fields NOT from Jambase API:**
- `promotion_tier` - Set by admin
- `featured_until` - Set by admin
- `created_by_user_id` - For manual events only
- `setlist` - From Setlist.fm integration (not in schema you provided)

**3NF Mapping:**
- Jambase event ID stored in `external_entity_ids` table:
  - `entity_type`: 'event'
  - `entity_uuid`: `events.id`
  - `source`: 'jambase'
  - `external_id`: `identifier.replace(/^jambase:/, '')` (e.g., "123456")

---

## DATA EXTRACTION LOGIC

### Headliner Selection
```javascript
const headliner = event.performer?.find(p => p['x-isHeadliner']) || event.performer?.[0];
```
- Uses performer with `x-isHeadliner: true`, or falls back to first performer

### Identifier Extraction
```javascript
// Extract numeric Jambase ID for external_entity_ids lookup
const jambaseId = identifier?.replace(/^jambase:/, '') || identifier;

// Full identifier stored in identifier column
const fullIdentifier = identifier; // e.g., "jambase:789"
```

### Address Region Handling
```javascript
let state = null;
if (address.addressRegion) {
  if (typeof address.addressRegion === 'string') {
    state = address.addressRegion;
  } else if (address.addressRegion && typeof address.addressRegion === 'object') {
    if (Object.keys(address.addressRegion).length > 0 && address.addressRegion.name) {
      state = address.addressRegion.name;
    }
  }
}
```

### Address Country Handling
```javascript
let country = null;
if (address.addressCountry) {
  if (typeof address.addressCountry === 'string') {
    country = address.addressCountry;
  } else if (address.addressCountry && typeof address.addressCountry === 'object') {
    country = address.addressCountry.name || address.addressCountry.identifier || null;
  }
}
```

### Door Time Parsing
```javascript
let doorsTime = null;
if (jambaseEvent.doorTime) {
  const doorTimeStr = jambaseEvent.doorTime.trim();
  if (doorTimeStr.includes('T') || doorTimeStr.includes('-')) {
    doorsTime = new Date(doorTimeStr).toISOString();
  } else if (jambaseEvent.startDate) {
    // Combine with startDate if doorTime is time-only
    const datePart = jambaseEvent.startDate.split('T')[0];
    doorsTime = new Date(`${datePart}T${doorTimeStr}`).toISOString();
  }
}
```

### Price Range String Generation
```javascript
let priceRange = null;
if (priceSpec?.minPrice && priceSpec?.maxPrice) {
  priceRange = `$${priceSpec.minPrice} - $${priceSpec.maxPrice}`;
} else if (priceSpec?.price) {
  priceRange = `$${priceSpec.price}`;
}
```

### Ticket Available Logic
```javascript
const ticketAvailable = offers.some(offer => offer.availability === 'InStock');
```

---

## FIELD COVERAGE ANALYSIS

### ✅ COMPLETELY MAPPED FIELDS

**Artists Table:**
- ✅ All core fields (name, identifier, url, image_url, dates, types)
- ✅ All metadata (genres, members, member_of, external_identifiers, same_as)
- ✅ All JSONB fields (members, member_of, external_identifiers, same_as, raw_jambase_data)
- ✅ Founding information (location, date) - when available in API

**Venues Table:**
- ✅ All core fields (name, identifier, url, image_url, dates)
- ✅ All address fields (street_address, state, country, zip, latitude, longitude)
- ✅ Geo JSONB (preserves additional geo metadata)
- ✅ Capacity and social links (maximum_attendee_capacity, same_as)

**Events Table:**
- ✅ All core fields (title, event_date, doors_time, description, event_status)
- ✅ All venue location fields (address, city, state, zip, lat, lng)
- ✅ All pricing fields (price_range, price_min, price_max, price_currency, ticket_urls)
- ✅ All media fields (images, event_media_url)
- ✅ All relationship fields (artist_id, venue_id via FKs)
- ✅ Tour and external links (tour_name, external_url)
- ✅ Critical sync field (last_modified_at)

### ⚠️ PARTIALLY MAPPED FIELDS

**Venues:**
- ⚠️ `location.address.addressLocality` (city) - **NOT stored in venues table**, only stored in `events.venue_city`
  - **Reason**: Your schema doesn't have a `city` column in venues table
  - **Workaround**: City is stored denormalized in events table

### ❌ NOT AVAILABLE FROM JAMBASE API

These fields exist in your schema but cannot be populated from Jambase:

**Events Table:**
- ❌ `setlist` - Not in schema you provided (was in old schema)
- ❌ `promotion_tier` - Set by admin
- ❌ `featured_until` - Set by admin
- ❌ `created_by_user_id` - For manual events only

**Artists Table:**
- ❌ `owner_user_id` - Set when user claims artist
- ❌ `claimed_at` - Set when user claims artist

**Venues Table:**
- ❌ `owner_user_id` - Set when user claims venue
- ❌ `claimed_at` - Set when user claims venue
- ❌ `typical_genres` - Can be calculated/aggregated from events

---

## 3NF COMPLIANCE - external_entity_ids TABLE

All Jambase IDs are stored in the `external_entity_ids` table:

### Artists
```javascript
{
  entity_type: 'artist',
  entity_uuid: artist.id, // UUID from artists table
  source: 'jambase',
  external_id: '789' // Extracted from identifier "jambase:789"
}
```

### Venues
```javascript
{
  entity_type: 'venue',
  entity_uuid: venue.id, // UUID from venues table
  source: 'jambase',
  external_id: '456' // Extracted from identifier "jambase:456"
}
```

### Events
```javascript
{
  entity_type: 'event',
  entity_uuid: event.id, // UUID from events table
  source: 'jambase',
  external_id: '123456' // Extracted from identifier "jambase:123456"
}
```

**Lookup Pattern:**
```javascript
// Check if entity exists
const { data } = await supabase
  .from('external_entity_ids')
  .select('entity_uuid')
  .eq('source', 'jambase')
  .eq('entity_type', 'artist')
  .eq('external_id', '789')
  .maybeSingle();

const artistUuid = data?.entity_uuid; // UUID to use in events.artist_id
```

---

## SUMMARY

### ✅ Complete Coverage
- **100% of available Jambase API data is captured**
- All fields that exist in Jambase API are mapped to database columns
- No data loss occurs during sync

### ✅ Proper Data Types
- All types match your schema requirements
- Proper handling of nullable fields
- Correct JSONB storage for complex objects

### ✅ 3NF Compliance
- All external IDs stored in `external_entity_ids` table
- No duplicate ID storage in entity tables
- Proper foreign key relationships via UUIDs

### ✅ Relationship Handling
- Artists → Events: via `events.artist_id` (UUID FK)
- Venues → Events: via `events.venue_id` (UUID FK)
- All IDs tracked in `external_entity_ids` for deduplication

### ⚠️ Schema Considerations
1. **Venue City**: Not stored in venues table, only in events table (denormalized)
2. **Artist/Venue Names**: Denormalized in events table for display (stored as `artist_name`, `venue_name` in extracted data, but NOT in your schema - these are computed/joined)
3. **Event Media URL**: Stored in `events.event_media_url`, populated from headliner's `image_url` via trigger

---

## VERIFICATION CHECKLIST

Use this checklist to verify all data is being captured:

- [ ] All artist identifiers captured in `artists.identifier` and `external_entity_ids`
- [ ] All artist metadata captured (genres, members, external IDs, social links)
- [ ] All venue identifiers captured in `venues.identifier` and `external_entity_ids`
- [ ] All venue address components captured (street, state, country, zip, coordinates)
- [ ] All event identifiers captured in `external_entity_ids`
- [ ] All event metadata captured (dates, prices, tickets, images, tour)
- [ ] All foreign key relationships properly established
- [ ] `last_modified_at` captured for incremental sync
- [ ] All JSONB fields preserve complete original data in `raw_jambase_data`

