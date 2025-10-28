-- Fix artist_follows_with_details view to work without artist_profile table
-- This view is used by the frontend to display followed artists

DROP VIEW IF EXISTS public.artist_follows_with_details CASCADE;

CREATE OR REPLACE VIEW public.artist_follows_with_details AS
SELECT 
  af.id,
  af.user_id,
  af.artist_id,
  af.created_at,
  a.name as artist_name,
  a.image_url as artist_image_url,
  a.jambase_artist_id,
  NULL::INTEGER as num_upcoming_events, -- Placeholder - can be calculated from jambase_events if needed
  NULL::TEXT[] as genres, -- Placeholder - genres would come from artist_profile if it existed
  p.name as user_name,
  p.avatar_url as user_avatar_url
FROM public.artist_follows af
LEFT JOIN public.artists a ON af.artist_id = a.id
LEFT JOIN public.profiles p ON af.user_id = p.user_id;

-- Grant permissions
GRANT SELECT ON public.artist_follows_with_details TO authenticated;

COMMENT ON VIEW public.artist_follows_with_details IS 'Artist follows with denormalized artist and user details. Does not reference artist_profile table.';

