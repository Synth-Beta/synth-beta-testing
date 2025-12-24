# Optimized Jambase Sync Strategy

## Overview
Minimize API calls by using a **single endpoint** (`/events`) that returns complete event, artist, and venue data in each response. No separate artist/venue API calls needed.

## API Call Minimization

### Single Endpoint Strategy
**Endpoint**: `GET https://www.jambase.com/jb-api/v1/events`

**Parameters**:
- `apikey` - From `process.env.JAMBASE_API_KEY`
- `expandExternalIdentifiers=true` - **CRITICAL** - includes all IDs
- `perPage=100` - Maximum page size (minimizes calls)
- `page=1, 2, 3...` - Paginate through all pages

**Result**: 
- ~900 API calls for ~90,000 upcoming events
- Each call provides: events + embedded artists + embedded venues
- **Total: ~900 calls for complete database seed**

## Schema-Based Upsert Strategy

### Foreign Key Challenge
The schemas require sequential upserts because:
- `events.artist_jambase_id` is UUID (FK to `artists.id`)
- `events.venue_jambase_id` is UUID (FK to `venues.id`)

### Optimized 3-Step Batch Process

For each page of 100 events:

#### Step 1: Upsert Artists (Get UUIDs)
```sql
INSERT INTO artists (jambase_artist_id, name, identifier, ...)
VALUES (...)
ON CONFLICT (jambase_artist_id) 
DO UPDATE SET name = EXCLUDED.name, ...
RETURNING id, jambase_artist_id;
```
- Store mapping: `artistUuidMap[jambase_artist_id] = uuid`

#### Step 2: Upsert Venues (Get UUIDs)
```sql
INSERT INTO venues (jambase_venue_id, name, identifier, ...)
VALUES (...)
ON CONFLICT (jambase_venue_id) 
DO UPDATE SET name = EXCLUDED.name, ...
RETURNING id, jambase_venue_id;
```
- Store mapping: `venueUuidMap[jambase_venue_id] = uuid`

#### Step 3: Upsert Events (With FK UUIDs)
```sql
INSERT INTO events (
  jambase_event_id, title, artist_name, artist_jambase_id, 
  venue_name, venue_jambase_id, event_date, last_modified_at, ...
)
VALUES (
  ..., 
  artistUuidMap[artist.jambase_artist_id],  -- FK UUID
  venueUuidMap[venue.jambase_venue_id],     -- FK UUID
  ...
)
ON CONFLICT (jambase_event_id) 
DO UPDATE SET 
  title = EXCLUDED.title,
  last_modified_at = EXCLUDED.last_modified_at,
  ...
```

### Deduplication Strategy

**Within Each Page**:
- Extract all artists → dedupe by `jambase_artist_id` → unique set
- Extract all venues → dedupe by `jambase_venue_id` → unique set
- Only upsert unique artists/venues per page

**Across Pages**:
- Database handles deduplication via unique constraints
- `ON CONFLICT` ensures no duplicates even if same artist/venue appears in multiple pages

## Data Extraction Mapping

### From Jambase API Response

**Event Object**:
- `identifier` → `jambase_event_id` (remove "jambase:" prefix)
- `name` → `title`
- `startDate` → `event_date`
- `doorTime` → `doors_time`
- `dateModified` → `last_modified_at` ⭐
- `eventStatus` → `event_status`
- `description` → `description`
- `performer[0]` → artist data (see below)
- `location` → venue data (see below)
- `offers[]` → ticket data (see below)

**Artist Object** (from `event.performer[0]` or headliner):
- `identifier` → `jambase_artist_id` (remove "jambase:" prefix)
- `name` → `name`
- `identifier` → `identifier` (full identifier string)
- `url` → `url`
- `image` → `image_url`
- `genre[]` → `genres[]`
- `externalIdentifiers` → `external_identifiers` (JSONB)
- `sameAs[]` → `same_as` (JSONB)

**Venue Object** (from `event.location`):
- `identifier` → `jambase_venue_id` (remove "jambase:" prefix)
- `name` → `name`
- `identifier` → `identifier`
- `address` → `address` (JSONB)
- `geo` → `geo` (JSONB)
- `url` → `url`
- `image` → `image_url`
- `sameAs[]` → `same_as[]` (TEXT[])

**Ticket Data** (from `event.offers[]`):
- `offers[].url` → `ticket_urls[]`
- `offers[].availability === "InStock"` → `ticket_available`
- `offers[0].priceSpecification.minPrice` → `price_min`
- `offers[0].priceSpecification.maxPrice` → `price_max`
- `offers[0].priceSpecification.priceCurrency` → `price_currency`

## Batch Processing Flow

```
For each page (100 events):
  1. Extract all unique artists → artistSet
  2. Extract all unique venues → venueSet
  3. Extract all events → eventList
  
  4. Batch upsert artists → get UUIDs → artistUuidMap
  5. Batch upsert venues → get UUIDs → venueUuidMap
  
  6. For each event:
     - Lookup artist UUID: artistUuidMap[event.artist.jambase_artist_id]
     - Lookup venue UUID: venueUuidMap[event.venue.jambase_venue_id]
     - Set event.artist_jambase_id = artist UUID
     - Set event.venue_jambase_id = venue UUID
  
  7. Batch upsert events with FK UUIDs
  
  8. Log progress, continue to next page
```

## Performance Metrics

**API Calls**:
- Initial seed: ~900 calls (~90k events ÷ 100 per page)
- Daily sync: ~1-5 calls (only changed events)

**Database Operations**:
- Per page: 3 batch upserts (artists, venues, events)
- Total for seed: ~2,700 batch operations (~900 pages × 3)

**Time Estimate**:
- ~900 API calls × ~1 second per call = ~15 minutes (with rate limiting)
- Database operations: ~2,700 batch upserts = ~5-10 minutes
- **Total: ~20-30 minutes for full seed**

## Error Handling

- Retry failed API calls (3 attempts, exponential backoff)
- Continue on individual record failures
- Log all errors for review
- Track failed pages for re-processing
- Checkpoint system: save last successful page

## Incremental Sync Strategy

**Query**: `SELECT MAX(last_modified_at) FROM events WHERE source = 'jambase'`

**API Call**:
```
GET /jb-api/v1/events?apikey=...&expandExternalIdentifiers=true&dateModifiedFrom={MAX(last_modified_at)}&perPage=100
```

**Result**: Only fetches events modified since last sync (typically 1-5 pages per day)

