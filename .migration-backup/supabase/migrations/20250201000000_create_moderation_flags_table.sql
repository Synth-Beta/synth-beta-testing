-- Create moderation_flags table to track content flags/reports
-- This separates moderation concerns from the users table
CREATE TABLE IF NOT EXISTS public.moderation_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  
  -- Who is flagging the content
  flagged_by_user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  
  -- What content is being flagged (polymorphic relationship)
  content_type TEXT NOT NULL CHECK (content_type IN ('event', 'review', 'artist', 'venue')),
  content_id UUID NOT NULL,
  
  -- Flag details
  flag_reason TEXT NOT NULL,
  flag_category TEXT CHECK (flag_category IN (
    'spam',
    'harassment',
    'inappropriate_content',
    'misinformation',
    'copyright_violation',
    'fake_content',
    'other'
  )),
  additional_details TEXT,
  
  -- Moderation status
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'under_review',
    'resolved',
    'dismissed',
    'escalated'
  )),
  
  -- Resolution details
  resolved_by_user_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
  resolution_notes TEXT,
  resolution_action TEXT CHECK (resolution_action IN (
    'no_action',
    'content_removed',
    'content_edited',
    'user_warned',
    'user_suspended',
    'user_banned',
    'escalated_to_admin'
  )),
  resolved_at TIMESTAMP WITH TIME ZONE,
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Ensure one flag per user per content item (users can't flag the same thing twice)
  UNIQUE(flagged_by_user_id, content_type, content_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_moderation_flags_content ON public.moderation_flags(content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_flagged_by ON public.moderation_flags(flagged_by_user_id);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_status ON public.moderation_flags(status);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_created_at ON public.moderation_flags(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_moderation_flags_resolved_by ON public.moderation_flags(resolved_by_user_id) WHERE resolved_by_user_id IS NOT NULL;

-- Add foreign key constraints based on content_type
-- Note: PostgreSQL doesn't support conditional foreign keys, so we'll use triggers for validation
-- Instead, we'll create a function to validate the content_id exists in the appropriate table

CREATE OR REPLACE FUNCTION public.validate_moderation_flag_content()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validate that the content_id exists in the appropriate table
  CASE NEW.content_type
    WHEN 'event' THEN
      IF NOT EXISTS (SELECT 1 FROM public.events WHERE id = NEW.content_id) THEN
        RAISE EXCEPTION 'Event with id % does not exist', NEW.content_id;
      END IF;
    WHEN 'review' THEN
      IF NOT EXISTS (SELECT 1 FROM public.reviews WHERE id = NEW.content_id) THEN
        RAISE EXCEPTION 'Review with id % does not exist', NEW.content_id;
      END IF;
    WHEN 'artist' THEN
      IF NOT EXISTS (SELECT 1 FROM public.artists WHERE id = NEW.content_id) THEN
        RAISE EXCEPTION 'Artist with id % does not exist', NEW.content_id;
      END IF;
    WHEN 'venue' THEN
      IF NOT EXISTS (SELECT 1 FROM public.venues WHERE id = NEW.content_id) THEN
        RAISE EXCEPTION 'Venue with id % does not exist', NEW.content_id;
      END IF;
  END CASE;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_moderation_flag_content_trigger
  BEFORE INSERT OR UPDATE ON public.moderation_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_moderation_flag_content();

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_moderation_flags_updated_at
  BEFORE UPDATE ON public.moderation_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Enable RLS
ALTER TABLE public.moderation_flags ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view flags they created
CREATE POLICY "Users can view their own flags"
  ON public.moderation_flags
  FOR SELECT
  USING (auth.uid() = flagged_by_user_id);

-- Admins can view all flags
CREATE POLICY "Admins can view all flags"
  ON public.moderation_flags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid()
      AND (account_type = 'admin' OR permissions_metadata->>'is_admin' = 'true')
    )
  );

-- Users can create flags
CREATE POLICY "Users can create flags"
  ON public.moderation_flags
  FOR INSERT
  WITH CHECK (auth.uid() = flagged_by_user_id);

-- Admins can update flags (for resolution)
CREATE POLICY "Admins can update flags"
  ON public.moderation_flags
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE user_id = auth.uid()
      AND (account_type = 'admin' OR permissions_metadata->>'is_admin' = 'true')
    )
  );

-- Add helpful comments
COMMENT ON TABLE public.moderation_flags IS 'Tracks user flags/reports on content (events, reviews, artists, venues)';
COMMENT ON COLUMN public.moderation_flags.content_type IS 'Type of content being flagged: event, review, artist, or venue';
COMMENT ON COLUMN public.moderation_flags.content_id IS 'UUID of the content being flagged (references events.id, reviews.id, artists.id, or venues.id)';
COMMENT ON COLUMN public.moderation_flags.flag_reason IS 'User-provided reason for flagging the content';
COMMENT ON COLUMN public.moderation_flags.status IS 'Current status of the flag: pending, under_review, resolved, dismissed, or escalated';
COMMENT ON COLUMN public.moderation_flags.resolution_action IS 'Action taken when flag was resolved';

-- ============================================================================
-- Remove moderation columns from users table
-- ============================================================================

-- Drop the index on moderation_status first (if it exists)
DROP INDEX IF EXISTS public.idx_users_moderation_status;

-- Drop the constraint on moderation_status (if it exists)
-- Try common constraint names
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_new_moderation_status_check;
ALTER TABLE public.users DROP CONSTRAINT IF EXISTS users_moderation_status_check;

-- Drop moderation-related columns from users table
ALTER TABLE public.users 
  DROP COLUMN IF EXISTS moderation_status,
  DROP COLUMN IF EXISTS warning_count,
  DROP COLUMN IF EXISTS last_warned_at,
  DROP COLUMN IF EXISTS suspended_until,
  DROP COLUMN IF EXISTS ban_reason;

