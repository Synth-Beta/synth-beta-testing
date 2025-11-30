# Schema Type Verification

## Column Type Analysis

Based on the provided schema, here's the verification of each column type:

### ✅ Correctly Mapped Columns:

1. **rating** - `INTEGER NOT NULL`
   - Code: `deriveRating(reviewData)` returns integer 1-5 ✅

2. **artist_performance_rating** - `NUMERIC(2,1)`
   - Code: `Number(reviewData.artist_performance_rating.toFixed(1))` ✅
   - Constraint: 0.5-5.0 ✅

3. **production_rating** - `NUMERIC(2,1)`
   - Code: `Number(reviewData.production_rating.toFixed(1))` ✅
   - Constraint: 0.5-5.0 ✅

4. **venue_rating_decimal** - `NUMERIC(2,1)`
   - Code: `Number(reviewData.venue_rating.toFixed(1))` ✅
   - Constraint: 0.5-5.0 ✅
   - **Note**: We explicitly delete `venue_rating` (INTEGER) to avoid type mismatch ✅

5. **location_rating** - `NUMERIC(2,1)`
   - Code: `Number(reviewData.location_rating.toFixed(1))` ✅
   - Constraint: 0.5-5.0 ✅

6. **value_rating** - `NUMERIC(2,1)`
   - Code: `Number(reviewData.value_rating.toFixed(1))` ✅
   - Constraint: 0.5-5.0 ✅

7. **ticket_price_paid** - `NUMERIC(8,2)`
   - Code: `reviewData.ticket_price_paid` (number) ✅
   - Constraint: >= 0 ✅

8. **artist_rating** - `NUMERIC` (no precision)
   - Code: `reviewData.artist_rating` (legacy field) ✅
   - Constraint: 1-5 ✅

9. **All feedback columns** - `TEXT`
   - Code: String values ✅

10. **All recommendation columns** - `TEXT`
    - Code: String values ✅

11. **photos** - `TEXT[]`
    - Code: `reviewData.photos` (string array) ✅

12. **videos** - `TEXT[]`
    - Code: `reviewData.videos` (string array) ✅

13. **attendees** - `TEXT[]`
    - Code: `reviewData.attendees` (array) ✅

14. **All tag arrays** - `TEXT[]`
    - Code: String arrays ✅

### ⚠️ Potentially Missing Columns (not in schema but used in code):

1. **setlist** - `JSONB` (added in migration `20250115000000_add_setlist_to_user_reviews.sql`)
   - Code: `reviewData.setlist` (any/JSONB)
   - **Status**: Column exists in migrations but not in provided schema
   - **Action**: Verify column exists in actual database

2. **custom_setlist** - `JSONB` (added in migration `20250116000000_add_custom_setlist_to_user_reviews.sql`)
   - Code: `reviewData.custom_setlist` (CustomSetlistSong[])
   - **Status**: Column exists in migrations but not in provided schema
   - **Action**: Verify column exists in actual database

3. **met_on_synth** - `BOOLEAN` (used in code but not in schema)
   - Code: `reviewData.met_on_synth`
   - **Status**: Not in provided schema
   - **Action**: Verify if column exists or remove from code

## Type Safety Issues Fixed:

1. ✅ **venue_rating (INTEGER) vs venue_rating_decimal (DECIMAL)**
   - We explicitly delete `venue_rating` from all insert/update payloads
   - Only use `venue_rating_decimal` for decimal values
   - Prevents "invalid input syntax for type integer" errors

2. ✅ **All DECIMAL(2,1) columns**
   - Values are rounded to 1 decimal place using `.toFixed(1)`
   - Then converted to Number to ensure proper type

3. ✅ **ticket_price_paid NUMERIC(8,2)**
   - Accepts number values (will be cast to NUMERIC(8,2) by PostgreSQL)

## Recommendations:

1. **Verify missing columns**: Run this SQL to check if `setlist`, `custom_setlist`, and `met_on_synth` exist:
   ```sql
   SELECT column_name, data_type 
   FROM information_schema.columns 
   WHERE table_name = 'reviews' 
   AND column_name IN ('setlist', 'custom_setlist', 'met_on_synth');
   ```

2. **If columns don't exist**: Either add them via migration or remove from code

3. **All type mappings are correct** for the columns that exist in the schema ✅

