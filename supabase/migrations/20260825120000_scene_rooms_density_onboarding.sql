-- ============================================================
-- LOI-562: persistent density scene rooms (This week in DC + Going out)
-- ============================================================
-- Today reserved scene rooms live as entity_type='genre' with ids
-- dc-this-week / dc-going-out because chats_entity_type_check lacks 'scene'.
-- This migration adds 'scene', a get_or_create_scene_room RPC, and remaps
-- those reserved rows.

ALTER TABLE public.chats
  DROP CONSTRAINT IF EXISTS chats_entity_type_check;

ALTER TABLE public.chats
  ADD CONSTRAINT chats_entity_type_check
  CHECK (
    entity_type IS NULL
    OR entity_type IN ('event', 'artist', 'venue', 'genre', 'scene')
  );

UPDATE public.chats
SET entity_type = 'scene'
WHERE entity_type = 'genre'
  AND entity_id IN ('dc-this-week', 'dc-going-out', 'scene.dc.this_week', 'scene.dc.going_out');

CREATE OR REPLACE FUNCTION public.get_or_create_scene_room(
  p_scene_id text,
  p_chat_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
BEGIN
  IF p_scene_id IS NULL OR length(trim(p_scene_id)) = 0 THEN
    RAISE EXCEPTION 'p_scene_id is required';
  END IF;

  SELECT c.id INTO v_chat_id
  FROM public.chats c
  WHERE c.entity_type = 'scene'
    AND c.entity_id = p_scene_id
    AND c.is_group_chat = true
  LIMIT 1;

  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  INSERT INTO public.chats (
    chat_name,
    is_group_chat,
    entity_type,
    entity_id,
    is_verified
  )
  VALUES (
    COALESCE(NULLIF(trim(p_chat_name), ''), p_scene_id),
    true,
    'scene',
    p_scene_id,
    true
  )
  RETURNING id INTO v_chat_id;

  RETURN v_chat_id;
END;
$$;

COMMENT ON FUNCTION public.get_or_create_scene_room(text, text) IS
  'Idempotent create/lookup for density persistent scene rooms (LOI-562).';

GRANT EXECUTE ON FUNCTION public.get_or_create_scene_room(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_or_create_scene_room(text, text) TO anon;

-- Ensure both density rooms exist
SELECT public.get_or_create_scene_room('scene.dc.this_week', 'This week in DC');
SELECT public.get_or_create_scene_room('scene.dc.going_out', 'Going out tonight / this weekend');
