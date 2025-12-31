-- ============================================
-- UPDATE TIMELINE TO MATCH NEW SCHEMA
-- Remove milestone_type and custom_reason (not in new schema)
-- Ensure Event_name column exists (it should be in the new schema)
-- ============================================

-- Note: milestone_type and custom_reason are not in the new schema
-- If they exist, we'll need to remove them, but we'll only add Event_name if it doesn't exist
-- The new schema already has Event_name, so we'll just ensure the function populates it

-- Add Event_name column if it doesn't exist (should already exist in new schema)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'passport_timeline'
      AND column_name = 'Event_name'
  ) THEN
    ALTER TABLE public.passport_timeline ADD COLUMN "Event_name" TEXT;
  END IF;
END $$;

-- Remove milestone_type if it exists (not in new schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'passport_timeline'
      AND column_name = 'milestone_type'
  ) THEN
    ALTER TABLE public.passport_timeline DROP COLUMN milestone_type;
  END IF;
END $$;

-- Remove custom_reason if it exists (not in new schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'passport_timeline'
      AND column_name = 'custom_reason'
  ) THEN
    ALTER TABLE public.passport_timeline DROP COLUMN custom_reason;
  END IF;
END $$;

-- Drop index on milestone_type if it exists
DROP INDEX IF EXISTS idx_passport_timeline_milestone_type;

-- Add comment
COMMENT ON COLUMN public.passport_timeline."Event_name" IS 'Event name constructed from artist and venue names (e.g., "Artist Name @ Venue Name")';

