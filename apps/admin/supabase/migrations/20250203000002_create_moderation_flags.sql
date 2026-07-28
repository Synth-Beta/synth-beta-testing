-- Create moderation flags table
-- This table tracks user-reported content that needs moderation review

CREATE TABLE IF NOT EXISTS public.moderation_flags (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  flagged_by_user_id uuid NOT NULL,
  content_type text NOT NULL,
  content_id uuid NOT NULL,
  flag_reason text NOT NULL,
  flag_category text NULL,
  additional_details text NULL,
  status text NOT NULL DEFAULT 'pending'::text,
  resolved_by_user_id uuid NULL,
  resolution_notes text NULL,
  resolution_action text NULL,
  resolved_at timestamp with time zone NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT moderation_flags_pkey PRIMARY KEY (id),
  CONSTRAINT moderation_flags_flagged_by_user_id_content_type_content_id_key UNIQUE (flagged_by_user_id, content_type, content_id),
  CONSTRAINT moderation_flags_resolved_by_user_id_fkey FOREIGN KEY (resolved_by_user_id) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT moderation_flags_flagged_by_user_id_fkey FOREIGN KEY (flagged_by_user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT moderation_flags_status_check CHECK (
    (
      status = ANY (
        ARRAY[
          'pending'::text,
          'under_review'::text,
          'resolved'::text,
          'dismissed'::text,
          'escalated'::text
        ]
      )
    )
  ),
  CONSTRAINT moderation_flags_flag_category_check CHECK (
    (
      flag_category = ANY (
        ARRAY[
          'spam'::text,
          'harassment'::text,
          'inappropriate_content'::text,
          'misinformation'::text,
          'copyright_violation'::text,
          'fake_content'::text,
          'other'::text
        ]
      )
    )
  ),
  CONSTRAINT moderation_flags_resolution_action_check CHECK (
    (
      resolution_action = ANY (
        ARRAY[
          'no_action'::text,
          'content_removed'::text,
          'content_edited'::text,
          'user_warned'::text,
          'user_suspended'::text,
          'user_banned'::text,
          'escalated_to_admin'::text
        ]
      )
    )
  ),
  CONSTRAINT moderation_flags_content_type_check CHECK (
    (
      content_type = ANY (
        ARRAY[
          'event'::text,
          'review'::text,
          'artist'::text,
          'venue'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_moderation_flags_content ON public.moderation_flags USING btree (content_type, content_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_moderation_flags_flagged_by ON public.moderation_flags USING btree (flagged_by_user_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_moderation_flags_status ON public.moderation_flags USING btree (status) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_moderation_flags_created_at ON public.moderation_flags USING btree (created_at DESC) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_moderation_flags_resolved_by ON public.moderation_flags USING btree (resolved_by_user_id) TABLESPACE pg_default
WHERE
  (resolved_by_user_id IS NOT NULL);

-- Create trigger to update updated_at timestamp
CREATE TRIGGER update_moderation_flags_updated_at
  BEFORE UPDATE ON public.moderation_flags
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create validation function for moderation flag content
CREATE OR REPLACE FUNCTION validate_moderation_flag_content()
RETURNS TRIGGER AS $$
BEGIN
  -- Validate that the content_id exists in the appropriate table based on content_type
  IF NEW.content_type = 'event' THEN
    IF NOT EXISTS (SELECT 1 FROM events WHERE id = NEW.content_id) AND
       NOT EXISTS (SELECT 1 FROM jambase_events WHERE id = NEW.content_id) THEN
      RAISE EXCEPTION 'Content ID % does not exist in events or jambase_events', NEW.content_id;
    END IF;
  ELSIF NEW.content_type = 'review' THEN
    IF NOT EXISTS (SELECT 1 FROM user_reviews WHERE id = NEW.content_id) THEN
      RAISE EXCEPTION 'Content ID % does not exist in user_reviews', NEW.content_id;
    END IF;
  ELSIF NEW.content_type = 'artist' THEN
    IF NOT EXISTS (SELECT 1 FROM artists WHERE id = NEW.content_id) AND
       NOT EXISTS (SELECT 1 FROM artist_profile WHERE id = NEW.content_id) THEN
      RAISE EXCEPTION 'Content ID % does not exist in artists or artist_profile', NEW.content_id;
    END IF;
  ELSIF NEW.content_type = 'venue' THEN
    IF NOT EXISTS (SELECT 1 FROM venues WHERE id = NEW.content_id) AND
       NOT EXISTS (SELECT 1 FROM venue_profile WHERE id = NEW.content_id) THEN
      RAISE EXCEPTION 'Content ID % does not exist in venues or venue_profile', NEW.content_id;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to validate content exists
CREATE TRIGGER validate_moderation_flag_content_trigger
  BEFORE INSERT OR UPDATE ON public.moderation_flags
  FOR EACH ROW
  EXECUTE FUNCTION validate_moderation_flag_content();

-- Enable RLS
ALTER TABLE public.moderation_flags ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own flags
CREATE POLICY "Users can view their own flags"
  ON public.moderation_flags
  FOR SELECT
  USING (auth.uid() = flagged_by_user_id);

-- Users can insert their own flags
CREATE POLICY "Users can insert their own flags"
  ON public.moderation_flags
  FOR INSERT
  WITH CHECK (auth.uid() = flagged_by_user_id);

-- Admins can view all flags
CREATE POLICY "Admins can view all flags"
  ON public.moderation_flags
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- Admins can update all flags
CREATE POLICY "Admins can update all flags"
  ON public.moderation_flags
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

