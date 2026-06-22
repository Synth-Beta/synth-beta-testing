-- ============================================
-- PHASE 1.2: Create Sync State Table (DEPRECATED)
-- NOTE: This approach has been replaced with last_modified_at column on events table
-- Keeping this migration for reference but it's not needed
-- ============================================

-- DEPRECATED: We're using last_modified_at column on events table instead
-- This migration is kept for reference but can be skipped

-- The sync_state table approach has been replaced with:
-- - last_modified_at column on events table (see 20250125000001_add_last_modified_at_to_events.sql)
-- - Query MAX(last_modified_at) from events for incremental sync

