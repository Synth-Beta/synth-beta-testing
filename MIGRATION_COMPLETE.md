# ✅ External IDs Normalization - Code Migration Complete

## Summary

All application code has been updated to use the normalized `external_entity_ids` schema via helper views and helper functions.

## Files Updated

### Services (11 files)
1. ✅ `src/services/artistVenueService.ts` - Lookup functions + insert logic
2. ✅ `src/services/simpleArtistVenueService.ts` - Venue/artist lookups
3. ✅ `src/services/unifiedVenueSearchService.ts` - All venue lookups + inserts
4. ✅ `src/services/unifiedArtistSearchService.ts` - All artist lookups + inserts
5. ✅ `src/services/artistFollowService.ts` - `getArtistUuidByJambaseId` function
6. ✅ `src/services/reviewService.ts` - Venue lookups
7. ✅ `src/services/enhancedReviewService.ts` - Venue lookups
8. ✅ `src/services/draftReviewService.ts` - Artist lookups
9. ✅ `src/services/venueService.ts` - Venue lookups
10. ✅ `src/services/personalizedFeedService.ts` - Artist ID references
11. ✅ `src/services/artistProfileService.ts` - Artist profile lookups

### Components (5 files)
1. ✅ `src/components/reviews/EventReviewForm.tsx` - Artist lookups + venue inserts
2. ✅ `src/components/search/ManualArtistForm.tsx` - Artist inserts with external_entity_ids
3. ✅ `src/components/search/ManualVenueForm.tsx` - Venue inserts with external_entity_ids
4. ✅ `src/components/reviews/ArtistVenueReviews.tsx` - Query updates
5. ✅ `src/components/ArtistCard.tsx`, `ArtistSelector.tsx`, `ArtistSearchBox.tsx` - Display only (no changes needed)

### Pages (Already Updated)
- ✅ `src/pages/ArtistEvents.tsx` - Already using `artist_uuid`

## Migration Strategy Used

### 1. Helper Views (Primary Approach)
- `artists_with_external_ids` - Provides backward-compatible `jambase_artist_id` column
- `venues_with_external_ids` - Provides backward-compatible `jambase_venue_id` column
- `events_with_artist_venue` - Provides normalized event data with external IDs

### 2. Helper Functions (For UUID Lookups)
- `get_entity_uuid_by_external_id(p_external_id, p_source, p_entity_type)` - Converts external ID to UUID

### 3. Insert Logic Updates
All insert operations now:
1. Insert into main table (`artists`/`venues`) with `jambase_*_id` for backward compatibility
2. Also insert into `external_entity_ids` table for normalization

## What Changed

### Lookup Queries
**Before:**
```typescript
.from('artists')
.eq('jambase_artist_id', jamBaseId)
```

**After:**
```typescript
.from('artists_with_external_ids')
.eq('jambase_artist_id', jamBaseId)
```

### Insert Operations
**Before:**
```typescript
.insert({ jambase_artist_id: id, ... })
```

**After:**
```typescript
const { data } = await supabase
  .from('artists')
  .insert({ jambase_artist_id: id, ... }); // Keep for backward compatibility

await supabase
  .from('external_entity_ids')
  .insert({
    entity_type: 'artist',
    entity_uuid: data.id,
    source: 'jambase',
    external_id: id
  });
```

## Next Steps

### 1. Test All Functionality
- [ ] Test artist search and lookup
- [ ] Test venue search and lookup
- [ ] Test event creation with artist/venue
- [ ] Test review creation
- [ ] Test artist/venue following
- [ ] Test personalized feed
- [ ] Test manual artist/venue creation

### 2. Run Final Cleanup Migration
Once all tests pass, run:
```sql
-- File: supabase/migrations/20250328000007_complete_normalization_remove_redundant_columns.sql
```

**⚠️ WARNING:** This migration removes the `jambase_*_id` columns from tables. Only run after:
- ✅ All code is updated (DONE)
- ✅ All tests pass
- ✅ All ingestion/sync jobs are updated
- ✅ All scheduled tasks are updated

### 3. Optional: Remove Helper Views
After the cleanup migration, you can optionally remove the helper views if you want to force all code to use direct JOINs with `external_entity_ids`.

## Verification Queries

Run these to verify the migration:

```sql
-- Check that external_entity_ids has data
SELECT 
  entity_type,
  source,
  COUNT(*) as count
FROM external_entity_ids
GROUP BY entity_type, source;

-- Check that helper views work
SELECT COUNT(*) FROM artists_with_external_ids;
SELECT COUNT(*) FROM venues_with_external_ids;
SELECT COUNT(*) FROM events_with_artist_venue;

-- Verify no orphaned records
SELECT COUNT(*) 
FROM artists a
LEFT JOIN external_entity_ids eei ON eei.entity_uuid = a.id AND eei.entity_type = 'artist' AND eei.source = 'jambase'
WHERE a.jambase_artist_id IS NOT NULL 
  AND eei.id IS NULL;
```

## Notes

- All changes maintain backward compatibility during migration
- Helper views provide a smooth transition path
- The old `jambase_*_id` columns still exist until cleanup migration runs
- All new inserts populate both old columns (for compatibility) and `external_entity_ids` (for normalization)

