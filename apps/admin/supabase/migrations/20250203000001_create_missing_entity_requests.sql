-- Create missing entity requests table
-- This table tracks user requests for missing artists, venues, or events

CREATE TABLE IF NOT EXISTS public.missing_entity_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  entity_type text NOT NULL,
  entity_name text NOT NULL,
  entity_description text NULL,
  entity_location text NULL,
  entity_date text NULL,
  entity_url text NULL,
  entity_image_url text NULL,
  additional_info jsonb NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending'::text,
  reviewed_by uuid NULL,
  reviewed_at timestamp with time zone NULL,
  review_notes text NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT missing_entity_requests_pkey PRIMARY KEY (id),
  CONSTRAINT missing_entity_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users (user_id) ON DELETE SET NULL,
  CONSTRAINT missing_entity_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT missing_entity_requests_entity_type_check CHECK (
    (
      entity_type = ANY (
        ARRAY['artist'::text, 'venue'::text, 'event'::text]
      )
    )
  ),
  CONSTRAINT missing_entity_requests_status_check CHECK (
    (
      status = ANY (
        ARRAY[
          'pending'::text,
          'approved'::text,
          'rejected'::text,
          'duplicate'::text,
          'added'::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_missing_entity_requests_user_id ON public.missing_entity_requests USING btree (user_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_missing_entity_requests_entity_type ON public.missing_entity_requests USING btree (entity_type) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_missing_entity_requests_status ON public.missing_entity_requests USING btree (status) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_missing_entity_requests_created_at ON public.missing_entity_requests USING btree (created_at DESC) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_missing_entity_requests_pending ON public.missing_entity_requests USING btree (entity_type, status) TABLESPACE pg_default
WHERE
  (status = 'pending'::text);

-- Create trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_missing_entity_requests_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_missing_entity_requests_updated_at
  BEFORE UPDATE ON public.missing_entity_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_missing_entity_requests_updated_at();

-- Enable RLS
ALTER TABLE public.missing_entity_requests ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own requests
CREATE POLICY "Users can view their own requests"
  ON public.missing_entity_requests
  FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own requests
CREATE POLICY "Users can insert their own requests"
  ON public.missing_entity_requests
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Admins can view all requests
CREATE POLICY "Admins can view all requests"
  ON public.missing_entity_requests
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

-- Admins can update all requests
CREATE POLICY "Admins can update all requests"
  ON public.missing_entity_requests
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.users
      WHERE users.user_id = auth.uid()
      AND users.account_type = 'admin'
    )
  );

