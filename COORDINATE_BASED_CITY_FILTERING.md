# Coordinate-Based City Filtering Implementation

## Summary

This implementation replaces string-based city filtering with **coordinate-based radius filtering**. When users select a city like "NYC", the system now:
1. Looks up the city's coordinates
2. Finds all events within a 50-mile radius (covers metro areas)
3. Returns events from Newark, Jersey City, Brooklyn, etc. - not just Manhattan

**Benefits:**
- ✅ Metro area coverage (NYC includes Newark, DC includes Silver Spring/Bethesda)
- ✅ Works for any city automatically (no hardcoding)
- ✅ Standardized city names for display
- ✅ Scalable to any number of cities

## SQL Migration

**File:** `supabase/migrations/20250228000002_add_coordinate_based_city_filtering.sql`

**To apply:**
1. Copy the entire SQL file content
2. Run it in your Supabase SQL Editor
3. Or apply via Supabase CLI: `supabase migration up`

**What it does:**
- Adds `display_city` column (normalized city names for UI)
- Creates `city_centers` table (auto-computed from event data)
- Creates `get_events_by_city_coordinates()` function (coordinate-based filtering)
- Creates `get_available_cities_for_filter()` function (for city selector UI)
- Sets up triggers to auto-normalize city names

## Code Changes

### ✅ Updated Files:
1. **`src/services/personalizedFeedService.ts`**
   - Added `getEventIdsByCityCoordinates()` helper method
   - Updated `getFilteredPersonalizedFeed()` to use coordinate filtering
   - Updated `getFallbackFeed()` to use coordinate filtering

2. **`src/components/search/EventFilters.tsx`**
   - Updated `loadCities()` to use `get_available_cities_for_filter()` RPC
   - Falls back to direct query with `display_city` if RPC fails

## How It Works

### City Selection Flow:
1. User selects "New York" in filter
2. Frontend calls `get_events_by_city_coordinates(['New York'], null, 50, 1000)`
3. Database:
   - Looks up NYC coordinates in `city_centers` table
   - Finds all events within 50 miles of NYC center using lat/lng
   - Returns event IDs (includes Newark, Brooklyn, Jersey City, etc.)
4. Frontend filters personalized feed by these event IDs
5. UI displays standardized `display_city` names

### Display City Normalization:
- Original: `"new york"`, `"New York"`, `"NEW YORK"` → Normalized: `"New York"`
- Original: `"silver  spring"`, `"Silver Spring"` → Normalized: `"Silver Spring"`
- Trigger automatically normalizes new events on insert/update

## Verification

After running the migration, verify it worked:

```sql
-- Check display_city population
SELECT 
  COUNT(*) as total_events,
  COUNT(display_city) as events_with_display_city,
  COUNT(*) FILTER (WHERE venue_city IS NOT NULL AND display_city IS NULL) as missing
FROM jambase_events;

-- Check city_centers population
SELECT 
  COUNT(*) as total_cities,
  SUM(event_count) as total_upcoming_events
FROM city_centers
ORDER BY event_count DESC
LIMIT 10;

-- Test coordinate-based filtering
SELECT * FROM get_events_by_city_coordinates(ARRAY['New York'], NULL, 50, 10);

-- Get available cities for UI
SELECT * FROM get_available_cities_for_filter(1, 50);
```

## Testing

1. **Test Metro Coverage:**
   - Select "New York" as filter
   - Verify events from Newark, Jersey City, Brooklyn appear
   - Select "Washington" as filter
   - Verify events from Silver Spring, Bethesda, Arlington appear

2. **Test City Normalization:**
   - Check that duplicate city names are merged
   - Verify UI shows clean, standardized names

3. **Test Performance:**
   - City filtering should be fast (uses spatial indexes)
   - Large metro areas (NYC, LA) should return results quickly

## Maintenance

**Update city centers (runs automatically, but can be manual):**
```sql
SELECT update_city_centers();
```

**Schedule automatic updates (optional, requires pg_cron extension):**
```sql
SELECT cron.schedule('update-city-centers', '0 3 * * *', 'SELECT update_city_centers();');
```

## Notes

- **50-mile radius** is used for metro coverage (can be adjusted in code)
- **display_city** is display-only; original `venue_city` is preserved
- Filtering is **always coordinate-based**; city names are only for display
- Works for **any city** that has events in the database (no hardcoding needed)

