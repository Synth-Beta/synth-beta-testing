-- ============================================
-- FIX SCHEMA CONSTRAINT ISSUES
-- ============================================
-- Addresses:
-- 1. analytics_daily contradictory constraint (entity_uuid CHECK NOT NULL vs entity_id text)
-- 2. external_entity_ids missing uniqueness constraint
-- 3. Acknowledgment of polymorphic signal tables (intentionally loose, acceptable for analytics)

-- ============================================
-- 1. FIX analytics_daily CONTRADICTORY CONSTRAINT
-- ============================================
-- Problem: entity_uuid has CHECK (entity_uuid IS NOT NULL) but:
--   - entity_id is text (nullable)
--   - entity_type includes 'campaign' which may only have entity_id (text)
--   - This creates a contradiction where some entities can't be stored
--
-- Solution: Remove the CHECK constraint and make entity_uuid nullable
-- This allows storing entities that only have entity_id (text) like campaigns

DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Find the CHECK constraint name (may be auto-generated)
  SELECT conname INTO constraint_name
  FROM pg_constraint 
  WHERE conrelid = 'public.analytics_daily'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) LIKE '%entity_uuid IS NOT NULL%';
  
  -- Drop the CHECK constraint if it exists
  IF constraint_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.analytics_daily DROP CONSTRAINT %I', constraint_name);
    RAISE NOTICE '✅ Removed contradictory CHECK constraint: %', constraint_name;
  ELSE
    RAISE NOTICE '⚠️ CHECK constraint on entity_uuid not found - may have already been removed';
  END IF;
  
  -- Ensure entity_uuid column is nullable (drop NOT NULL if present)
  -- Check if column is currently NOT NULL
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'analytics_daily'
      AND column_name = 'entity_uuid'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.analytics_daily 
    ALTER COLUMN entity_uuid DROP NOT NULL;
    RAISE NOTICE '✅ Made analytics_daily.entity_uuid nullable';
  ELSE
    RAISE NOTICE '✅ analytics_daily.entity_uuid is already nullable';
  END IF;
END $$;

-- Add comment explaining the schema
COMMENT ON COLUMN public.analytics_daily.entity_uuid IS 
'UUID reference to the entity. NULL for entities that only have entity_id (text), such as campaigns.';
COMMENT ON COLUMN public.analytics_daily.entity_id IS 
'Text identifier for the entity. Used for entities that don''t have UUIDs (e.g., campaigns).';
COMMENT ON COLUMN public.analytics_daily.entity_type IS 
'Type of entity: user, event, artist, venue, or campaign. Campaigns typically only have entity_id (text).';

-- ============================================
-- 2. ADD UNIQUENESS CONSTRAINT TO external_entity_ids
-- ============================================
-- Problem: No uniqueness guarantee for (entity_type, source, external_id)
--   - Logically, the same external_id from the same source for the same entity_type
--     should map to a single entity_uuid
--   - Without a unique constraint, duplicate mappings can exist
--
-- Solution: Add UNIQUE constraint on (entity_type, source, external_id)
-- This ensures each external entity ID maps to exactly one internal entity UUID

DO $$
BEGIN
  -- Check if unique constraint already exists
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_constraint 
    WHERE conname = 'external_entity_ids_entity_type_source_external_id_key'
  ) THEN
    -- Add unique constraint
    ALTER TABLE public.external_entity_ids
    ADD CONSTRAINT external_entity_ids_entity_type_source_external_id_key 
    UNIQUE (entity_type, source, external_id);
    
    RAISE NOTICE '✅ Added UNIQUE constraint to external_entity_ids (entity_type, source, external_id)';
  ELSE
    RAISE NOTICE '⚠️ Unique constraint already exists on external_entity_ids';
  END IF;
END $$;

-- Add comment explaining the constraint
COMMENT ON CONSTRAINT external_entity_ids_entity_type_source_external_id_key ON public.external_entity_ids IS 
'Ensures each external entity ID from a source maps to exactly one internal entity UUID. Prevents duplicate mappings.';

-- ============================================
-- 3. ACKNOWLEDGMENT: Polymorphic Signal Tables
-- ============================================
-- The following tables intentionally use polymorphic patterns (entity_type + entity_id/entity_uuid):
--   - interactions (entity_type, entity_id, entity_uuid)
--   - passport_entries (entity_type, entity_id, entity_uuid)
--   - analytics_daily (entity_type, entity_id, entity_uuid)
--   - bucket_list (entity_type, entity_id)
--
-- These are:
--   ✅ Acceptable outside strict 3NF (by design)
--   ✅ Correct for analytics and ML pipelines
--   ✅ Event logs / signals, not relational facts
--   ❌ Not relationally enforceable (intentional)
--
-- These tables are designed for flexibility in analytics pipelines and don't need
-- strict foreign key constraints. The trade-off is worth it for analytics use cases.

COMMENT ON TABLE public.interactions IS 
'Event log for user interactions. Uses polymorphic entity_type + entity_id/entity_uuid pattern. Intentionally loose for analytics flexibility.';
COMMENT ON TABLE public.passport_entries IS 
'Passport stamps/entries. Uses polymorphic entity_type + entity_id/entity_uuid pattern. Intentionally loose for flexibility.';
COMMENT ON TABLE public.analytics_daily IS 
'Daily aggregated analytics metrics. Uses polymorphic entity_type + entity_id/entity_uuid pattern. Supports entities without UUIDs (e.g., campaigns).';
COMMENT ON TABLE public.bucket_list IS 
'User bucket list items. Uses polymorphic entity_type + entity_id pattern. Intentionally loose for flexibility.';

-- ============================================
-- 4. MAKE legacy_relationships READ-ONLY
-- ============================================
-- Problem: legacy_relationships table still exists (for safety during migration)
--   - Should be read-only to prevent new writes
--   - Should eventually be dropped once confirmed unused
--
-- Solution: Revoke INSERT, UPDATE, DELETE permissions from authenticated users
-- Keep SELECT for read access during transition period

DO $$
BEGIN
  -- Revoke write permissions (INSERT, UPDATE, DELETE)
  REVOKE INSERT, UPDATE, DELETE ON public.legacy_relationships FROM authenticated;
  REVOKE INSERT, UPDATE, DELETE ON public.legacy_relationships FROM anon;
  
  -- Keep SELECT for read access
  GRANT SELECT ON public.legacy_relationships TO authenticated;
  GRANT SELECT ON public.legacy_relationships TO anon;
  
  RAISE NOTICE '✅ Made legacy_relationships read-only (INSERT/UPDATE/DELETE revoked)';
  
  -- Drop existing RLS policies that allow writes (if they exist)
  DROP POLICY IF EXISTS "Users can create their own event relationships" ON public.legacy_relationships;
  DROP POLICY IF EXISTS "Users can update their own event relationships" ON public.legacy_relationships;
  DROP POLICY IF EXISTS "Users can delete their own event relationships" ON public.legacy_relationships;
  DROP POLICY IF EXISTS "Admins can manage all relationships" ON public.legacy_relationships;
  
  -- Keep/ensure SELECT policy exists (read-only)
  DROP POLICY IF EXISTS "Users can view event relationships" ON public.legacy_relationships;
  CREATE POLICY "Legacy relationships are read-only (SELECT only)"
  ON public.legacy_relationships FOR SELECT
  USING (true);  -- Allow read access for verification/migration purposes
  
  RAISE NOTICE '✅ Updated RLS policies on legacy_relationships to read-only';
  
  -- Drop any triggers on legacy_relationships (they should use user_event_relationships now)
  DROP TRIGGER IF EXISTS notify_friend_event_interest_insert_trigger ON public.legacy_relationships;
  DROP TRIGGER IF EXISTS notify_friend_event_interest_update_trigger ON public.legacy_relationships;
  DROP TRIGGER IF EXISTS trigger_update_relationships_updated_at ON public.legacy_relationships;
  DROP TRIGGER IF EXISTS trigger_refresh_recommendations_on_relationship_insert ON public.legacy_relationships;
  DROP TRIGGER IF EXISTS trigger_refresh_recommendations_on_relationship_delete ON public.legacy_relationships;
  DROP TRIGGER IF EXISTS trigger_refresh_recommendations_on_relationship_update ON public.legacy_relationships;
  
  RAISE NOTICE '✅ Dropped any triggers on legacy_relationships (triggers should be on user_event_relationships)';
  
  -- Add comment to table
  COMMENT ON TABLE public.legacy_relationships IS 
'DEPRECATED: Legacy table for event relationships. Migrated to user_event_relationships (3NF compliant). This table is read-only and will be dropped once migration is confirmed complete. Do not write to this table.';
END $$;

-- ============================================
-- 5. DOCUMENT DUPLICATED NAME FIELDS
-- ============================================
-- Problem: Some tables have entity_name fields that duplicate data from referenced tables
--   - bucket_list.entity_name
--   - passport_entries.entity_name
--
-- These are:
--   ✅ Acceptable as display snapshots (for performance/denormalization)
--   ✅ Useful for historical accuracy (names change over time)
--   ✅ Not identity fields (entity_id/entity_uuid is the identity)
--   ⚠️ Should be kept in sync with source, but may diverge over time
--
-- This is a deliberate denormalization for:
--   - Performance (avoiding joins for display)
--   - Historical accuracy (captures name at time of creation)
--   - Resilience (works even if referenced entity is deleted)

COMMENT ON COLUMN public.bucket_list.entity_name IS 
'Display name snapshot of the entity. Denormalized for performance and historical accuracy. May differ from current entity name if entity was renamed. entity_id is the authoritative identity.';
COMMENT ON COLUMN public.passport_entries.entity_name IS 
'Display name snapshot of the entity at time of unlock. Denormalized for performance and historical accuracy. Captures name as it appeared when the passport entry was earned. entity_id/entity_uuid is the authoritative identity.';

-- ============================================
-- 6. DOCUMENT: Mixed auth.users(id) vs public.users(user_id)
-- ============================================
-- Pattern Analysis:
--   - auth.users(id) is Supabase Auth's user table
--   - public.users(user_id) references auth.users(id) via FOREIGN KEY
--   - public.users(id) is a separate UUID (different from user_id)
--
-- Current Usage:
--   - Some tables reference auth.users(id) directly
--   - Other tables reference public.users(user_id)
--   - This is acceptable but inconsistent
--
-- Standard Pattern (recommended going forward):
--   - Use public.users(user_id) for business logic (allows additional user data)
--   - Only use auth.users(id) directly when necessary for auth-only operations
--
-- Tables currently using auth.users(id):
--   - bucket_list.user_id → auth.users(id)
--   - music_preference_signals.user_id → auth.users(id)
--   - passport_* tables → auth.users(id)
--   - user_scene_progress.user_id → auth.users(id)
--
-- Tables currently using public.users(user_id):
--   - user_event_relationships.user_id → public.users(user_id)
--   - user_relationships → public.users(user_id)
--   - artist_follows → public.users(user_id)
--   - reviews → public.users(user_id)
--   - Most other tables → public.users(user_id)
--
-- This is NOT a 3NF violation, but standardization would improve:
--   - Consistency in joins
--   - Ability to query user profile data easily
--   - Clear separation between auth and business logic
--
-- Future migration: Consider migrating auth.users(id) references to public.users(user_id)
--   where business logic requires it. Keep auth.users(id) only for auth-specific operations.

COMMENT ON TABLE public.users IS 
'User profiles table. user_id references auth.users(id). Most tables should reference this table via user_id for business logic, not auth.users(id) directly.';
COMMENT ON COLUMN public.users.user_id IS 
'Foreign key to auth.users(id). This is the standard user identifier for business logic. Use this instead of auth.users(id) for joins in business logic queries.';

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '================================================';
  RAISE NOTICE 'Schema constraint fixes complete:';
  RAISE NOTICE '  1. ✅ analytics_daily.entity_uuid constraint removed (now nullable)';
  RAISE NOTICE '  2. ✅ external_entity_ids uniqueness constraint added';
  RAISE NOTICE '  3. ✅ Polymorphic signal tables documented';
  RAISE NOTICE '  4. ✅ legacy_relationships made read-only';
  RAISE NOTICE '  5. ✅ Duplicated name fields documented';
  RAISE NOTICE '  6. ✅ Mixed auth.users vs public.users pattern documented';
  RAISE NOTICE '================================================';
END $$;

