# Location Filtering Analysis & Solutions

## 🔴 **Current Problems**

### 1. **City Name Matching Issues**
- **Problem**: City names in the database have inconsistent formats:
  - "Washington DC" vs "Washington" vs "Washington D.C." vs "Washington, DC"
  - "New York" vs "NYC" vs "New York City"
  - Case sensitivity issues
  - Extra spaces, punctuation variations
  
- **Current Implementation**:
  - SQL functions use exact matching: `venue_city = $1` (fails with variations)
  - Frontend uses `ilike` with `%${normalizedCity}%` (better but still misses some)
  - No canonical city name mapping table

- **Impact**: 
  - Users select "Washington DC" but events are stored as "Washington" → no results
  - Same city with different spellings treated as different cities

### 2. **Radius Filtering Not Working**
- **Problem**: 
  - The `get_personalized_feed_v1` RPC function expects a single `p_city` string, but:
    - It uses exact city name matching (`venue_city = $1`) which fails with variations
    - It calculates city center coordinates on-the-fly by averaging event coordinates
    - If no events match the exact city name, it returns empty (no coordinates found)
  
- **Fallback Feed Issues**:
  - The fallback feed (`getFallbackFeed`) doesn't use radius filtering at all
  - It only filters by city name matching (client-side, after fetching all events)
  - No latitude/longitude-based radius calculation

- **Impact**:
  - Radius filter is ignored when city name doesn't match exactly
  - Events just outside the city center are excluded
  - No geographic distance calculation

### 3. **Missing City Centers Table**
- **Problem**: 
  - No `city_centers` table with pre-calculated coordinates
  - Coordinates are calculated on-the-fly by averaging event locations
  - If a city has no events, no coordinates are available
  - No normalized city name mapping

- **Impact**:
  - Inaccurate city centers (biased by event distribution)
  - No coordinates for cities without events
  - Can't handle city name variations

### 4. **Coordinate Lookup Issues**
- **Problem**:
  - `RadiusSearchService.getCityCoordinates()` uses `ilike` matching which can return wrong cities
  - Example: Searching "Washington" might match "Washington Township" in NJ
  - No state disambiguation when multiple cities have same name
  - Falls back to hardcoded coordinates for major cities only

## ✅ **Recommended Solutions**

### **Solution 1: Create City Centers Table** (Recommended)
Create a `city_centers` table with:
- Normalized city names (canonical form)
- Pre-calculated center coordinates (from events or geocoding API)
- State information for disambiguation
- City name variations/aliases

**Benefits**:
- Accurate city centers
- Handles city name variations
- Fast lookups
- Works even when city has no events

### **Solution 2: Use Latitude/Longitude for Radius Filtering**
Instead of filtering by city name, filter by:
1. Look up city center coordinates from `city_centers` table
2. Use Haversine formula to calculate distance from center
3. Filter events where `distance <= radius_miles`

**Benefits**:
- Accurate radius filtering
- Works regardless of city name variations
- Includes events in nearby suburbs/areas

### **Solution 3: Normalize City Names**
Create a city normalization system:
- Map variations to canonical names: "Washington DC" → "Washington"
- Use fuzzy matching for user input
- Store normalized names in database

**Benefits**:
- Consistent city matching
- Better user experience
- Handles typos and variations

### **Solution 4: Update RPC Function**
Modify `get_personalized_feed_v1` to:
- Accept city center coordinates (lat/lng) instead of city name
- Use radius-based filtering with Haversine formula
- Handle multiple cities by using OR conditions with radius filters

**Benefits**:
- More accurate filtering
- Better performance (uses spatial indexes)
- Handles city name variations

## 🎯 **Implementation Plan**

### **Phase 1: Create City Centers Table**
1. Create `city_centers` table with:
   - `id` (UUID)
   - `normalized_name` (TEXT) - canonical city name
   - `state` (TEXT) - for disambiguation
   - `center_latitude` (DECIMAL)
   - `center_longitude` (DECIMAL)
   - `aliases` (TEXT[]) - array of city name variations
   - `event_count` (INTEGER) - number of events in this city

2. Populate from existing events:
   - Group events by normalized city name
   - Calculate center coordinates (average or geocoded)
   - Extract common variations

### **Phase 2: Update Services**
1. Update `RadiusSearchService.getCityCoordinates()`:
   - Query `city_centers` table first
   - Use fuzzy matching for city name variations
   - Fall back to event-based calculation if not found

2. Update `PersonalizedFeedService`:
   - Look up city center coordinates before calling RPC
   - Pass coordinates to RPC instead of city name
   - Update fallback feed to use radius filtering

3. Update `normalizeFilters()`:
   - Map city name variations to canonical names
   - Look up coordinates for each selected city
   - Use coordinates for radius filtering

### **Phase 3: Update RPC Function**
1. Modify `get_personalized_feed_v1`:
   - Accept `p_city_lat` and `p_city_lng` parameters
   - Use Haversine formula for distance calculation
   - Filter events within radius using spatial query

2. Or create new function `get_personalized_feed_v2`:
   - Accept coordinates and radius
   - Use PostGIS or native distance calculation
   - Return events sorted by distance

### **Phase 4: Update Frontend**
1. Update `UnifiedFeed`:
   - Look up city coordinates when city filter is selected
   - Pass coordinates to feed service
   - Display radius on map

2. Update `EventFilters`:
   - Show normalized city names
   - Allow radius selection
   - Display city center on map

## 📊 **Database Schema for City Centers**

```sql
CREATE TABLE IF NOT EXISTS city_centers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  normalized_name TEXT NOT NULL,
  state TEXT,
  country TEXT DEFAULT 'US',
  center_latitude DECIMAL(10, 8) NOT NULL,
  center_longitude DECIMAL(11, 8) NOT NULL,
  aliases TEXT[] DEFAULT '{}',
  event_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(normalized_name, state, country)
);

CREATE INDEX idx_city_centers_name ON city_centers(normalized_name);
CREATE INDEX idx_city_centers_state ON city_centers(state);
CREATE INDEX idx_city_centers_coordinates ON city_centers(center_latitude, center_longitude);
CREATE INDEX idx_city_centers_aliases ON city_centers USING GIN(aliases);
```

## 🔧 **Quick Fix (Immediate Solution)**

For immediate improvement without database changes:

1. **Update `normalizeFilters()` to use coordinates**:
   - Look up city coordinates using `RadiusSearchService.getCityCoordinates()`
   - Store coordinates in filter object
   - Use coordinates for radius filtering in fallback feed

2. **Update fallback feed to use radius**:
   - Calculate distance from city center to each event
   - Filter events within radius
   - Use Haversine formula for accurate distance

3. **Improve city name matching**:
   - Use `cityNormalization.ts` utilities
   - Normalize both user input and database values
   - Use fuzzy matching for better results

