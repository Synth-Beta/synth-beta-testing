-- ============================================
-- CREATE user_event_relationships TABLE AND MIGRATE FROM relationships
-- ============================================
-- Migrate event relationships from polymorphic relationships table
-- to domain-specific user_event_relationships table for 3NF compliance
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: CREATE user_event_relationships TABLE
-- ============================================
-- 3NF-compliant table for user-event relationships
-- Direct FK to events(id) instead of polymorphic related_entity_id
-- Drop table if it exists to ensure clean creation (in case of previous incomplete migrations)
DROP TABLE IF EXISTS public.user_event_relationships CASCADE;

-- Create user_event_relationships table with composite primary key
CREATE TABLE public.user_event_relationships (
  user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES public.events(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN ('going', 'interested', 'maybe', 'not_going')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, event_id)
);

-- Create indexes for common query patterns
-- Note: idx_user_event_relationships_user_id is redundant since (user_id, relationship_type) covers user_id queries
CREATE INDEX IF NOT EXISTS idx_user_event_relationships_event_id 
  ON public.user_event_relationships(event_id);
CREATE INDEX IF NOT EXISTS idx_user_event_relationships_user_type 
  ON public.user_event_relationships(user_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_user_event_relationships_created_at 
  ON public.user_event_relationships(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_event_relationships_event_type 
  ON public.user_event_relationships(event_id, relationship_type);

-- ============================================
-- STEP 2: ENABLE RLS AND CREATE POLICIES
-- ============================================
ALTER TABLE public.user_event_relationships ENABLE ROW LEVEL SECURITY;

-- Users can view all event relationships (event interests are public)
DROP POLICY IF EXISTS "Users can view event relationships" ON public.user_event_relationships;
CREATE POLICY "Users can view event relationships"
ON public.user_event_relationships FOR SELECT
USING (true);

-- Users can create their own event relationships
DROP POLICY IF EXISTS "Users can create their own event relationships" ON public.user_event_relationships;
CREATE POLICY "Users can create their own event relationships"
ON public.user_event_relationships FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can update their own event relationships
DROP POLICY IF EXISTS "Users can update their own event relationships" ON public.user_event_relationships;
CREATE POLICY "Users can update their own event relationships"
ON public.user_event_relationships FOR UPDATE
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Users can delete their own event relationships
DROP POLICY IF EXISTS "Users can delete their own event relationships" ON public.user_event_relationships;
CREATE POLICY "Users can delete their own event relationships"
ON public.user_event_relationships FOR DELETE
USING (auth.uid() = user_id);

-- Admins can manage all relationships
DROP POLICY IF EXISTS "Admins can manage all event relationships" ON public.user_event_relationships;
CREATE POLICY "Admins can manage all event relationships"
ON public.user_event_relationships FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM public.users
    WHERE user_id = auth.uid()
    AND account_type = 'admin'
  )
);

-- ============================================
-- STEP 3: CREATE TRIGGER FOR updated_at
-- ============================================
-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_event_relationships_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_update_user_event_relationships_updated_at ON public.user_event_relationships;
CREATE TRIGGER trigger_update_user_event_relationships_updated_at
  BEFORE UPDATE ON public.user_event_relationships
  FOR EACH ROW
  EXECUTE FUNCTION update_user_event_relationships_updated_at();

-- ============================================
-- STEP 4: MIGRATE DATA FROM relationships TABLE
-- ============================================
-- Only migrate if relationships table exists and has event data
DO $$
DECLARE
  relationships_exists BOOLEAN;
  old_count INTEGER := 0;
  new_count INTEGER := 0;
BEGIN
  -- Check if relationships table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'relationships'
  ) INTO relationships_exists;
  
  IF relationships_exists THEN
    -- Count existing rows in relationships table for events
    SELECT COUNT(*) INTO old_count
    FROM public.relationships
    WHERE related_entity_type = 'event';
    
    RAISE NOTICE 'Found % event relationship rows in relationships table', old_count;
    
    -- Migrate data from relationships to user_event_relationships
    -- Note: related_entity_id is already UUID type (references events.id), so we can use it directly
    INSERT INTO public.user_event_relationships (
      user_id,
      event_id,
      relationship_type,
      created_at,
      updated_at
    )
    SELECT
      r.user_id,
      r.related_entity_id AS event_id,  -- Already UUID type, no conversion needed
      -- Normalize relationship_type: convert 'interest' to 'interested' for consistency
      CASE 
        WHEN r.relationship_type = 'interest' THEN 'interested'
        ELSE r.relationship_type
      END AS relationship_type,
      r.created_at,
      COALESCE(r.updated_at, r.created_at) AS updated_at
    FROM public.relationships r
    WHERE r.related_entity_type = 'event'
      AND r.related_entity_id IS NOT NULL
    ON CONFLICT (user_id, event_id) DO UPDATE SET
      relationship_type = EXCLUDED.relationship_type,
      updated_at = EXCLUDED.updated_at;
    
    -- Count migrated rows
    SELECT COUNT(*) INTO new_count
    FROM public.user_event_relationships;
    
    RAISE NOTICE 'Migrated % rows to user_event_relationships table (new total: %)', old_count, new_count;
  ELSE
    RAISE NOTICE 'relationships table does not exist, skipping data migration';
  END IF;
END $$;

-- ============================================
-- STEP 5: UPDATE SQL FUNCTIONS
-- ============================================

-- Update set_user_interest function to use user_event_relationships
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(text, boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.set_user_interest(event_id uuid, interested boolean);
DROP FUNCTION IF EXISTS public.set_user_interest(event_id text, interested boolean);

CREATE OR REPLACE FUNCTION public.set_user_interest(
  event_id TEXT,
  interested BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_uuid UUID;
BEGIN
  -- Resolve event UUID from TEXT input (can be UUID string or external ID)
  BEGIN
    -- Try UUID cast first
    v_event_uuid := event_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    -- If conversion fails, resolve via external_entity_ids table (3NF compliant)
    SELECT entity_uuid INTO v_event_uuid
    FROM public.external_entity_ids
    WHERE source = 'jambase'
      AND entity_type = 'event'
      AND external_id = event_id
    LIMIT 1;
    
    IF v_event_uuid IS NULL THEN
      RAISE EXCEPTION 'Event not found: %', event_id;
    END IF;
  END;
  
  IF interested THEN
    -- Insert or update relationship for event interest
    INSERT INTO public.user_event_relationships (
      user_id,
      event_id,
      relationship_type,
      created_at,
      updated_at
    )
    VALUES (
      auth.uid(),
      v_event_uuid,
      'interested',
      now(),
      now()
    )
    ON CONFLICT (user_id, event_id) 
    DO UPDATE SET
      relationship_type = 'interested',
      updated_at = now();
    
    -- Verify the insert/update succeeded
    IF NOT EXISTS (
      SELECT 1 FROM public.user_event_relationships
      WHERE user_id = auth.uid()
        AND event_id = v_event_uuid
        AND relationship_type = 'interested'
    ) THEN
      RAISE EXCEPTION 'Failed to create relationship - row not found after insert';
    END IF;
  ELSE
    -- Delete relationship if not interested
    DELETE FROM public.user_event_relationships
    WHERE user_id = auth.uid()
      AND event_id = v_event_uuid
      AND relationship_type = 'interested';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_interest(TEXT, BOOLEAN) TO authenticated;

-- Update check_user_interest function to use user_event_relationships
CREATE OR REPLACE FUNCTION public.check_user_interest(
  p_event_id TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_uuid UUID;
  v_exists BOOLEAN;
BEGIN
  -- Resolve event UUID from TEXT input (can be UUID string or external ID)
  BEGIN
    -- Try UUID cast first
    v_event_uuid := p_event_id::UUID;
  EXCEPTION WHEN OTHERS THEN
    -- If conversion fails, resolve via external_entity_ids table (3NF compliant)
    SELECT entity_uuid INTO v_event_uuid
    FROM public.external_entity_ids
    WHERE source = 'jambase'
      AND entity_type = 'event'
      AND external_id = p_event_id
    LIMIT 1;
    
    IF v_event_uuid IS NULL THEN
      RETURN false;
    END IF;
  END;
  
  -- Check if relationship exists in user_event_relationships
  SELECT EXISTS (
    SELECT 1 FROM public.user_event_relationships
    WHERE user_id = auth.uid()
      AND event_id = v_event_uuid
      AND relationship_type = 'interested'
  ) INTO v_exists;
  
  RETURN v_exists;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_user_interest(TEXT) TO authenticated;

-- ============================================
-- STEP 6: ADD TABLE COMMENT
-- ============================================
COMMENT ON TABLE public.user_event_relationships IS 
'3NF-compliant table tracking user event interests: going, interested, maybe, not_going. Migrated from relationships table.';

COMMENT ON COLUMN public.user_event_relationships.user_id IS 
'Foreign key to users(user_id)';

COMMENT ON COLUMN public.user_event_relationships.event_id IS 
'Foreign key to events(id)';

COMMENT ON COLUMN public.user_event_relationships.relationship_type IS 
'Type of relationship: going, interested, maybe, or not_going';

-- ============================================
-- STEP 7: VERIFICATION
-- ============================================
DO $$
DECLARE
  table_exists BOOLEAN;
  row_count INTEGER := 0;
  relationships_row_count INTEGER := 0;
BEGIN
  -- Verify table was created
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'user_event_relationships'
  ) INTO table_exists;
  
  IF NOT table_exists THEN
    RAISE EXCEPTION 'user_event_relationships table was not created';
  END IF;
  
  -- Count rows in new table
  SELECT COUNT(*) INTO row_count FROM public.user_event_relationships;
  
  -- Count rows in old table (if it exists)
  SELECT COUNT(*) INTO relationships_row_count
  FROM public.relationships
  WHERE related_entity_type = 'event';
  
  RAISE NOTICE '================================================';
  RAISE NOTICE 'MIGRATION VERIFICATION';
  RAISE NOTICE '================================================';
  RAISE NOTICE 'user_event_relationships table created: %', table_exists;
  RAISE NOTICE 'Rows in user_event_relationships: %', row_count;
  RAISE NOTICE 'Rows in relationships (events): %', relationships_row_count;
  RAISE NOTICE '================================================';
END $$;

COMMIT;

