-- Fix ambiguous user_id reference in get_event_photos function

CREATE OR REPLACE FUNCTION public.get_event_photos(
  p_event_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  photo_url TEXT,
  caption TEXT,
  likes_count INTEGER,
  comments_count INTEGER,
  is_featured BOOLEAN,
  user_id UUID,
  user_name TEXT,
  user_avatar_url TEXT,
  user_has_liked BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ep.id,
    ep.photo_url,
    ep.caption,
    ep.likes_count,
    ep.comments_count,
    ep.is_featured,
    ep.user_id,
    p.name as user_name,
    p.avatar_url as user_avatar_url,
    EXISTS (
      SELECT 1 FROM public.event_photo_likes epl
      WHERE epl.photo_id = ep.id AND epl.user_id = auth.uid()
    ) as user_has_liked,
    ep.created_at
  FROM public.event_photos ep
  JOIN public.profiles p ON p.user_id = ep.user_id
  WHERE ep.event_id = p_event_id
  ORDER BY ep.is_featured DESC, ep.likes_count DESC, ep.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

COMMENT ON FUNCTION public.get_event_photos IS 'Get photos for an event with like status - FIXED: qualified user_id column reference';

