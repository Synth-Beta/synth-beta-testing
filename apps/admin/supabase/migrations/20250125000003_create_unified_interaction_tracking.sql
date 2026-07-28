-- Unified Interaction Tracking System
-- This migration creates a single, normalized table to track ALL user interactions
-- across the entire application, following 3NF principles for OLTP source of truth

-- Create the unified interaction events table
CREATE TABLE IF NOT EXISTS public.user_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- Cross-backend identity anchors (for linking the same human across Supabase projects)
  identity_issuer TEXT,            -- e.g., https://<project-ref>.supabase.co/auth/v1
  identity_sub TEXT,               -- stable subject from JWT (provider uid)
  global_user_id TEXT,             -- optional app-level global id from app_metadata
  session_id UUID, -- Groups related interactions
  event_type TEXT NOT NULL, -- What the user did
  entity_type TEXT NOT NULL, -- What they acted on
  entity_id TEXT NOT NULL, -- ID of the entity (can be UUID or other identifier)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}', -- Additional context
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_user_interactions_user_id ON public.user_interactions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_global_user_id ON public.user_interactions(global_user_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_session_id ON public.user_interactions(session_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_event_type ON public.user_interactions(event_type);
CREATE INDEX IF NOT EXISTS idx_user_interactions_entity_type ON public.user_interactions(entity_type);
CREATE INDEX IF NOT EXISTS idx_user_interactions_entity_id ON public.user_interactions(entity_id);
CREATE INDEX IF NOT EXISTS idx_user_interactions_occurred_at ON public.user_interactions(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_interactions_metadata ON public.user_interactions USING GIN(metadata);

-- Enable RLS
ALTER TABLE public.user_interactions ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can insert their own interactions" 
ON public.user_interactions 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own interactions" 
ON public.user_interactions 
FOR SELECT 
USING (auth.uid() = user_id);

-- Admin can read all interactions (for analytics)
CREATE POLICY "Admins can read all interactions" 
ON public.user_interactions 
FOR SELECT 
USING (auth.role() = 'service_role');

-- Create a function to log interactions (RLS-safe)
CREATE OR REPLACE FUNCTION public.log_user_interaction(
  p_session_id UUID DEFAULT NULL,
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  interaction_id UUID;
  claims JSONB;
  v_issuer TEXT;
  v_sub TEXT;
  v_global TEXT;
BEGIN
  -- Extract identity anchors from JWT claims when present
  BEGIN
    claims := auth.jwt();
    v_issuer := COALESCE(claims->>'iss', NULL);
    v_sub := COALESCE(claims->>'sub', NULL);
    v_global := COALESCE(claims->'app_metadata'->>'global_user_id', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_issuer := NULL; v_sub := NULL; v_global := NULL;
  END;

  INSERT INTO public.user_interactions (
    user_id,
    identity_issuer,
    identity_sub,
    global_user_id,
    session_id,
    event_type,
    entity_type,
    entity_id,
    metadata
  ) VALUES (
    auth.uid(),
    v_issuer,
    v_sub,
    v_global,
    p_session_id,
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_metadata
  ) RETURNING id INTO interaction_id;
  
  RETURN interaction_id;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.log_user_interaction TO authenticated;

-- Create a function to batch log interactions (for performance)
CREATE OR REPLACE FUNCTION public.log_user_interactions_batch(
  p_interactions JSONB
)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  interaction_ids UUID[];
  interaction JSONB;
  claims JSONB;
  v_issuer TEXT;
  v_sub TEXT;
  v_global TEXT;
BEGIN
  interaction_ids := ARRAY[]::UUID[];
  -- Extract identity anchors once per batch
  BEGIN
    claims := auth.jwt();
    v_issuer := COALESCE(claims->>'iss', NULL);
    v_sub := COALESCE(claims->>'sub', NULL);
    v_global := COALESCE(claims->'app_metadata'->>'global_user_id', NULL);
  EXCEPTION WHEN OTHERS THEN
    v_issuer := NULL; v_sub := NULL; v_global := NULL;
  END;
  
  FOR interaction IN SELECT * FROM jsonb_array_elements(p_interactions)
  LOOP
    INSERT INTO public.user_interactions (
      user_id,
      identity_issuer,
      identity_sub,
      global_user_id,
      session_id,
      event_type,
      entity_type,
      entity_id,
      metadata
    ) VALUES (
      auth.uid(),
      v_issuer,
      v_sub,
      v_global,
      (interaction->>'session_id')::UUID,
      interaction->>'event_type',
      interaction->>'entity_type',
      interaction->>'entity_id',
      COALESCE(interaction->'metadata', '{}'::jsonb)
    ) RETURNING id INTO interaction_ids[array_length(interaction_ids, 1) + 1];
  END LOOP;
  
  RETURN interaction_ids;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.log_user_interactions_batch TO authenticated;

-- Add helpful comments
COMMENT ON TABLE public.user_interactions IS 'Unified table tracking all user interactions across the application for ML and analytics';
COMMENT ON COLUMN public.user_interactions.event_type IS 'Type of interaction: search, click, like, share, comment, review, interest, swipe, etc.';
COMMENT ON COLUMN public.user_interactions.entity_type IS 'Type of entity acted upon: artist, event, venue, review, user, search, etc.';
COMMENT ON COLUMN public.user_interactions.entity_id IS 'ID of the entity (can be UUID, string, or other identifier)';
COMMENT ON COLUMN public.user_interactions.metadata IS 'Additional context: query text, duration, position, etc.';
COMMENT ON COLUMN public.user_interactions.session_id IS 'Groups related interactions into sessions';
COMMENT ON COLUMN public.user_interactions.identity_issuer IS 'JWT issuer for cross-backend identity linking';
COMMENT ON COLUMN public.user_interactions.identity_sub IS 'JWT subject (provider user id) for cross-backend identity linking';
COMMENT ON COLUMN public.user_interactions.global_user_id IS 'Optional app-level global user id from JWT app_metadata for cross-backend linking';
