# Fix Latona Pub Duplicate and Leif Totusek Events

## Run These Files in Order

### 1. `01_merge_latona_pub_duplicates.sql`
- Merges duplicate Latona Pub venues
- Updates all foreign key references
- Deletes the duplicate venue
- **Run this first**

### 2. `02_fix_leif_totusek_events.sql`
- Fixes the 5 Leif Totusek events with null venue_id
- Extracts venue name from title and matches to venues table
- **Run this second** (after duplicate is merged)

### 3. `03_verify_fixes.sql`
- Verifies both fixes worked correctly
- Shows final status of all changes
- **Run this last** to confirm everything is fixed

## Quick Summary

**Problem:**
- 2 duplicate "Latona Pub" venues in database
- 5 Leif Totusek events with null venue_id

**Solution:**
1. Merge duplicate venues (keep oldest, delete newer)
2. Fix events by matching venue names from titles
3. Verify everything is correct

## Expected Results

After running all 3 scripts:
- ✅ Only 1 Latona Pub venue remains
- ✅ All 5 Leif Totusek events have venue_id populated
- ✅ No references to deleted venue remain

