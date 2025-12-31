# Timeline Update SQL Scripts

## Quick Access

### Main Update Script (Run This)
📄 [RUN_TIMELINE_UPDATE.sql](./RUN_TIMELINE_UPDATE.sql)

This file contains:
- ✅ Updated `auto_populate_passport_timeline` function (no city logic)
- ✅ Trigger function and trigger setup
- ✅ Complete backfill script for all users
- ✅ Event_name backfill

**Usage:** Run the entire file to update functions and backfill timeline.

---

## Related Migration Files

- `supabase/migrations/20250201000006_update_auto_populate_timeline_new_schema.sql` - Function update
- `supabase/migrations/20250201000009_backfill_timeline_significant_events.sql` - Backfill script

---

## What This Updates

1. **Removes all city logic** from timeline functions
2. **Uses venue name matching only** (no city/state validation)
3. **Populates timeline** with:
   - First review
   - First time seeing favorite artist
   - First time at favorite venue
4. **Backfills Event_name** from artist and venue names

---

## Running the Script

Execute `RUN_TIMELINE_UPDATE.sql` in your PostgreSQL client or Supabase SQL editor.

