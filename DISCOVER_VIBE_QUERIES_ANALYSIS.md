# Discover Vibe Queries - Database Filtering Analysis

## Queries That Filter Exactly in Database ✅

### 1. `getSimilarArtists`
- **Database Filtering**: ✅ Uses `.in('artist_name', ...)` - exact DB filter
- **JS Filtering**: None

### 2. `getLast5Attended`
- **Database Filtering**: ✅ Uses `.overlaps('genres', ...)` - exact DB filter
- **JS Filtering**: None (genre extraction is for building the filter)

### 3. `getSimilarTasteUsers`
- **Database Filtering**: ✅ Uses `.in('id', ...)` and `.overlaps('genres', ...)` - exact DB filters
- **JS Filtering**: Deduplication (reasonable, as it's post-processing)

### 4. `getThisWeekend`
- **Database Filtering**: ✅ Uses `.gte()` and `.lte()` on `event_date` - exact DB filters
- **JS Filtering**: None

### 5. `getUnder25`
- **Database Filtering**: ✅ Uses `.or('price_min.lte.25,price_max.lte.25')` - exact DB filter
- **JS Filtering**: None

### 6. `getSmallVenues` ✅ **FIXED**
- **Database Filtering**: ✅ Now uses `venues.maximum_attendee_capacity < 500` - exact DB filter
- **Previous**: Was using JS filtering by event count per venue
- **JS Filtering**: None

### 7. `getHighestRatedMonth`
- **Database Filtering**: ✅ Uses `.in('id', ...)`, `.gte()`, `.lte()` on `event_date` - exact DB filters
- **JS Filtering**: Deduplication (reasonable)

### 8. `getBestValue`
- **Database Filtering**: ✅ Uses `.in('id', ...)` with pre-filtered event IDs - exact DB filter
- **JS Filtering**: Deduplication (reasonable)

## Queries That Require JS Filtering ⚠️

### 9. `getLateShows` ⚠️
- **Database Filtering**: ❌ Cannot filter by hour of `doors_time` exactly
- **Why**: Supabase PostgREST doesn't support `EXTRACT(HOUR FROM doors_time)` in filters
- **Current Approach**: Fetch events with `doors_time IS NOT NULL`, then filter in JS
- **Alternative**: Could use RPC function or raw SQL, but PostgREST client doesn't support this directly
- **Status**: Acceptable workaround - hour extraction requires SQL functions not available in PostgREST filters

### 10. `getUpAndComing` ⚠️
- **Database Filtering**: ❌ Cannot filter by "artists with <10 reviews" exactly
- **Why**: Requires aggregation (COUNT reviews per artist) which needs:
  - Subquery or JOIN with GROUP BY
  - Cannot be done in a single PostgREST query efficiently
- **Current Approach**: 
  1. Fetch all reviews (limited to prevent performance issues)
  2. Count reviews per artist in JS
  3. Filter artists with <10 reviews
  4. Query events for those artists
- **Alternative**: Could use RPC function with SQL aggregation, but requires database function
- **Status**: Acceptable workaround - complex aggregation not directly supported

### 11. `getLessThan10Reviews` ⚠️
- **Database Filtering**: ❌ Cannot filter by "events with <10 reviews" exactly
- **Why**: Requires aggregation (COUNT reviews per event) which needs:
  - Subquery or JOIN with GROUP BY
  - Cannot be done in a single PostgREST query efficiently
- **Current Approach**:
  1. Fetch review counts (limited)
  2. Count reviews per event in JS
  3. Filter events with <10 reviews
- **Alternative**: Could use RPC function with SQL aggregation, but requires database function
- **Status**: Acceptable workaround - complex aggregation not directly supported

### 12. `getFirstTimeCity` ⚠️
- **Database Filtering**: ⚠️ Partially - can filter by city and exclude artist names
- **Why**: `.not('artist_name', 'in', array)` should work but can be unreliable with large arrays
- **Current Approach**: 
  1. Fetch seen artist names
  2. Fetch events in city
  3. Filter out seen artists in JS
- **Alternative**: Could try `.not('artist_name', 'in', ...)` but Supabase can have issues with large IN arrays
- **Status**: Could potentially be improved with `.not().in()`, but JS filtering is safer

### 13. `getBestVenues` ⚠️
- **Database Filtering**: ⚠️ Partially - filters by venue IDs, but venue selection requires aggregation
- **Why**: Requires:
  - Calculating average `venue_rating_new` per venue
  - Filtering venues with avg rating >= 4
  - Needs aggregation with GROUP BY which PostgREST doesn't support directly
- **Current Approach**:
  1. Fetch reviews with high venue ratings
  2. Calculate average ratings per venue in JS
  3. Select top venues
  4. Query events for those venues
- **Alternative**: Could use RPC function with SQL aggregation
- **Status**: Acceptable workaround - aggregation requires database function

## Summary

### Exact Database Filtering: 8/13 queries ✅
- Most queries use exact database filters
- `getSmallVenues` now uses exact DB filter (maximum_attendee_capacity)

### JS Filtering Required: 5/13 queries ⚠️
1. **getLateShows**: Hour extraction not supported in PostgREST
2. **getUpAndComing**: Aggregation (COUNT per artist) requires SQL function
3. **getLessThan10Reviews**: Aggregation (COUNT per event) requires SQL function
4. **getFirstTimeCity**: Large array exclusion can be unreliable in PostgREST
5. **getBestVenues**: Aggregation (AVG per venue) requires SQL function

### Potential Improvements
- Create database functions (RPC) for aggregation-based queries
- Use `.rpc()` for complex aggregations instead of JS filtering
- This would move filtering logic to the database for better performance

