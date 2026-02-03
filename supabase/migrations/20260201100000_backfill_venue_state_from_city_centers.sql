-- Backfill venue_state from city_centers table (Layer 1)
-- 
-- NOTE: This is a placeholder migration. The actual backfill should be run
-- using the Node.js script to avoid Supabase statement timeouts:
--
--   node scripts/backfill-venue-state.mjs --dry-run   # Preview changes
--   node scripts/backfill-venue-state.mjs             # Apply changes
--
-- The script processes records in batches and uses Mapbox API as a fallback
-- for events that can't be matched via city_centers.
--
-- Safety: Only updates NULL values, never overwrites existing data.
-- Idempotent: Can be run multiple times without side effects.

-- This migration intentionally does nothing to avoid timeout issues.
-- The backfill is handled by scripts/backfill-venue-state.mjs

SELECT 1; -- No-op to make migration valid
