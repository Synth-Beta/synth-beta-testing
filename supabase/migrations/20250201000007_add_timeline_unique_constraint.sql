-- ============================================
-- ADD UNIQUE CONSTRAINT FOR TIMELINE
-- Ensure one timeline entry per user per review
-- ============================================

-- Add unique constraint on (user_id, review_id) if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'passport_timeline_user_id_review_id_key'
  ) THEN
    ALTER TABLE public.passport_timeline
      ADD CONSTRAINT passport_timeline_user_id_review_id_key
      UNIQUE (user_id, review_id);
  END IF;
END $$;

