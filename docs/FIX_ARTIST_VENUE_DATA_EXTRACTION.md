# Fix Artist & Venue Data Extraction Plan

## Problems Identified

### Problem 1: Missing Founding City and Date for Artists
**Issue**: Artist founding location and date are not being captured correctly.

**Current Code** (line 131-132):
```javascript
founding_location: performer.foundingLocation?.name || null,
founding_date: performer.foundingDate || null,
```

**Possible Issues**:
- `foundingLocation` might be an object with nested structure (like `{ "@type": "Place", "name": "..." }`)
- `foundingDate` might need parsing or validation
- Data might not be in the expected format from API

**Solution**:
1. Handle `foundingLocation` as object with `@type` and `name` properties
2. Extract `name` from nested structure if needed
3. Validate and parse `foundingDate` if it's a string
4. Add logging to verify data extraction

### Problem 2: Venue Address Extraction from Complex JSONB
**Issue**: Venue addresses come as complex JSONB with nested structures, and we need to properly extract individual fields for events table.

**Example Address Structure**:
```json
{
  "@type": "PostalAddress",
  "postalCode": "19059",
  "x-timezone": "Europe/Berlin",
  "addressRegion": {},  // Empty object, not string!
  "streetAddress": "Wittenburger Str. 118",
  "addressCountry": {
    "name": "Germany",
    "@type": "Country",
    "identifier": "DE",
    "alternateName": "DEU"
  },
  "addressLocality": "Schwerin",
  "x-jamBaseCityId": 1240957,
  "x-jamBaseMetroId": "",
  "x-streetAddress2": ""
}
```

**Current Code** (line 245-248):
```javascript
venue_address: address?.streetAddress || null,
venue_city: address?.addressLocality || null,
venue_state: venueState,  // Handles object/string but might fail on empty object
venue_zip: address?.postalCode || null,
```

**Issues**:
1. `addressRegion` can be empty object `{}` - current code might not handle this
2. Missing extraction of `addressCountry` information
3. Missing extraction of timezone (`x-timezone`)
4. Missing extraction of `x-jamBaseCityId` and `x-jamBaseMetroId` (could be useful)

**Solution**:
1. Handle `addressRegion` as empty object - check if it's an object and has no properties
2. Extract `addressCountry.name` or `addressCountry.identifier` for country info
3. Extract timezone from `x-timezone` (could store in venue or event)
4. Improve state extraction to handle empty objects
5. Store additional metadata in venue's address JSONB (already done, but verify)

---

## Implementation Plan

### Step 1: Fix Artist Founding Location & Date Extraction

**File**: `backend/jambase-sync-service.mjs`
**Function**: `extractArtistData()`

**Changes**:
1. Improve `foundingLocation` extraction:
   ```javascript
   // Handle foundingLocation as object with @type and name
   let foundingLocation = null;
   if (performer.foundingLocation) {
     if (typeof performer.foundingLocation === 'string') {
       foundingLocation = performer.foundingLocation;
     } else if (performer.foundingLocation.name) {
       foundingLocation = performer.foundingLocation.name;
     } else if (performer.foundingLocation['@type'] === 'Place' && performer.foundingLocation.name) {
       foundingLocation = performer.foundingLocation.name;
     }
   }
   ```

2. Validate `foundingDate`:
   ```javascript
   // Parse and validate founding date
   let foundingDate = null;
   if (performer.foundingDate) {
     // Could be year string like "2005" or full date
     foundingDate = performer.foundingDate;
     // Optionally validate format
   }
   ```

### Step 2: Fix Venue Address Extraction

**File**: `backend/jambase-sync-service.mjs`
**Function**: `extractEventData()`

**Changes**:
1. Improve `addressRegion` handling:
   ```javascript
   // Handle addressRegion - can be string, object with name, or empty object
   let venueState = null;
   if (address?.addressRegion) {
     if (typeof address.addressRegion === 'string') {
       venueState = address.addressRegion;
     } else if (address.addressRegion.name) {
       venueState = address.addressRegion.name;
     } else if (typeof address.addressRegion === 'object' && Object.keys(address.addressRegion).length === 0) {
       // Empty object - set to null
       venueState = null;
     }
   }
   ```

2. Extract country information:
   ```javascript
   // Extract country (could be useful for events table or venue)
   const venueCountry = address?.addressCountry?.name || 
                        address?.addressCountry?.identifier || 
                        null;
   ```

3. Extract timezone:
   ```javascript
   // Extract timezone (store in venue or could add to events)
   const timezone = address?.['x-timezone'] || null;
   ```

4. Update venue address extraction in `extractVenueData()`:
   - Ensure full address object is stored (already done)
   - Verify all nested fields are preserved

### Step 3: Update Events Table Address Fields

**Current**: Events table has individual address fields extracted from venue address.

**Action**: Ensure extraction handles all edge cases:
- Empty `addressRegion` object
- Nested country objects
- Missing fields gracefully

### Step 4: Add Logging for Debugging

**Add**: Console logs to verify data extraction:
```javascript
// Log sample extracted data for verification
if (this.stats.eventsProcessed === 1) {
  console.log('Sample artist founding data:', {
    founding_location: artistData.founding_location,
    founding_date: artistData.founding_date
  });
  console.log('Sample venue address:', {
    address: venueData.address,
    extracted_city: address?.addressLocality,
    extracted_state: venueState,
    extracted_country: venueCountry
  });
}
```

### Step 5: Test with Real Data

**Action**: Run test sync and verify:
1. Artist founding location and date are populated
2. Venue addresses are correctly extracted
3. Events table has correct venue_address, venue_city, venue_state, venue_zip
4. No errors with empty addressRegion objects

---

## Files to Modify

1. **`backend/jambase-sync-service.mjs`**
   - `extractArtistData()` - Fix founding location/date extraction
   - `extractVenueData()` - Verify address storage
   - `extractEventData()` - Fix address field extraction

2. **`docs/COMPLETE_JAMBASE_DATA_MAPPING.md`** (optional)
   - Update documentation with actual address structure
   - Document founding location extraction

---

## Testing Checklist

- [ ] Artist founding location extracted correctly (string or object)
- [ ] Artist founding date extracted correctly
- [ ] Venue address JSONB stores complete address object
- [ ] Events table venue_address extracted from nested structure
- [ ] Events table venue_city extracted correctly
- [ ] Events table venue_state handles empty object `{}`
- [ ] Events table venue_zip extracted correctly
- [ ] Country information available (if needed)
- [ ] Timezone information available (if needed)
- [ ] No errors with complex address structures

---

## Expected Results

After fixes:
- ✅ Artists table: `founding_location` and `founding_date` populated when available
- ✅ Venues table: `address` JSONB contains complete address structure
- ✅ Events table: All address fields (`venue_address`, `venue_city`, `venue_state`, `venue_zip`) correctly extracted
- ✅ No errors with empty `addressRegion` objects
- ✅ All nested address data preserved in venues table

