-- Create interactions table for user analytics
CREATE TABLE IF NOT EXISTS public.interactions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  session_id UUID NULL,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  entity_uuid UUID NULL,
  CONSTRAINT interactions_new_pkey PRIMARY KEY (id),
  CONSTRAINT interactions_new_user_id_fkey FOREIGN KEY (user_id) REFERENCES users (user_id) ON DELETE CASCADE,
  CONSTRAINT interactions_entity_uuid_required_for_entities CHECK (
    (
      (
        entity_type = ANY (
          ARRAY[
            'search'::text,
            'view'::text,
            'form'::text,
            'ticket_link'::text,
            'song'::text,
            'album'::text,
            'playlist'::text,
            'genre'::text,
            'scene'::text
          ]
        )
      )
      OR (entity_uuid IS NOT NULL)
    )
  ) NOT VALID
) TABLESPACE pg_default;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_interactions_entity_type ON public.interactions USING btree (entity_type) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_interactions_occurred_at ON public.interactions USING btree (occurred_at DESC) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_interactions_entity_uuid ON public.interactions USING btree (entity_uuid) TABLESPACE pg_default
WHERE
  (entity_uuid IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_interactions_entity_type_uuid ON public.interactions USING btree (entity_type, entity_uuid) TABLESPACE pg_default
WHERE
  (entity_uuid IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_interactions_user_id ON public.interactions USING btree (user_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_interactions_session_id ON public.interactions USING btree (session_id) TABLESPACE pg_default;

CREATE INDEX IF NOT EXISTS idx_interactions_event_type ON public.interactions USING btree (event_type) TABLESPACE pg_default;

-- Create trigger for updated_at (if needed)
CREATE TRIGGER update_interactions_updated_at
  BEFORE UPDATE ON interactions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create trigger for analytics aggregation (if the function exists)
CREATE TRIGGER trigger_aggregate_analytics_on_interaction
  AFTER INSERT ON interactions
  FOR EACH ROW
  EXECUTE FUNCTION trigger_aggregate_analytics();

-- Enable RLS
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view their own interactions
CREATE POLICY "Users can view their own interactions"
  ON public.interactions
  FOR SELECT
  USING (auth.uid()::text = user_id::text);

-- Users can insert their own interactions
CREATE POLICY "Users can insert their own interactions"
  ON public.interactions
  FOR INSERT
  WITH CHECK (auth.uid()::text = user_id::text);

-- Admins can view all interactions
CREATE POLICY "Admins can view all interactions"
  ON public.interactions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.user_id::text = auth.uid()::text
      AND users.account_type = 'admin'
    )
  );

