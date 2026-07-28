-- Fix the log_user_interactions_batch function to handle UUID array properly
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
  new_id UUID;
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
    ) RETURNING id INTO new_id;
    
    -- Append the new ID to the array using array_append
    interaction_ids := array_append(interaction_ids, new_id);
  END LOOP;
  
  RETURN interaction_ids;
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.log_user_interactions_batch TO authenticated;
