# Vibe Queries - Estimation/Sampling Analysis

## Queries Using Estimation/Sampling ⚠️

These queries use `.limit()` when fetching reviews, which means they're only sampling a subset of the data rather than analyzing all reviews:

### 1. `getSimilarTasteUsers` ⚠️
- **Line**: 242
- **Issue**: Uses `.limit(100)` when fetching high-rated reviews
- **Impact**: Only considers first 100 high-rated reviews (4+ stars), not all of them
- **Fix**: Remove limit or use a much higher limit, or better: use RPC function with SQL aggregation

### 2. `getUpAndComing` ⚠️
- **Line**: 484-488
- **Issue**: **NO LIMIT** when fetching all artist reviews (could be performance issue)
- **Impact**: Fetches ALL reviews from database to count per artist - could be slow with large datasets
- **Note**: Not really "estimation" but inefficient - should use RPC function with GROUP BY

### 3. `getLessThan10Reviews` ⚠️
- **Line**: 549
- **Issue**: Uses `.limit(1000)` when fetching review counts
- **Impact**: Only counts reviews from first 1000 reviews fetched - events beyond this won't be counted correctly
- **Fix**: Remove limit or use RPC function with SQL aggregation

### 4. `getBestVenues` ⚠️
- **Line**: 675
- **Issue**: Uses `.limit(200)` when fetching venue reviews
- **Impact**: Only considers first 200 reviews when calculating venue averages - venues with reviews beyond this won't be included
- **Fix**: Remove limit or use RPC function with SQL aggregation

### 5. `getBestValue` ⚠️
- **Line**: 781
- **Issue**: Uses `.limit(100)` when fetching high value reviews
- **Impact**: Only considers first 100 reviews with value_rating >= 4, not all of them
- **Fix**: Remove limit or use RPC function with SQL aggregation

## Summary

**5 out of 12 vibes** are using estimation/sampling through artificial limits when fetching reviews for aggregation.

These limits exist to prevent performance issues, but they create inaccurate results:
- Events/venues/artists with reviews beyond the limit won't be considered
- Results are biased toward items that appear in the first N reviews fetched
- The sampling is arbitrary and not representative

## Recommendations

1. **Remove limits and use RPC functions** - Create PostgreSQL functions that perform the aggregations server-side
2. **Or increase limits significantly** - If RPC functions aren't feasible, use much higher limits (10,000+)
3. **Or use pagination** - Fetch reviews in batches until we have enough data

The only query that's correctly structured is `getUpAndComing` which fetches all reviews (no limit), but this could be a performance issue with large datasets - should still use RPC function.

