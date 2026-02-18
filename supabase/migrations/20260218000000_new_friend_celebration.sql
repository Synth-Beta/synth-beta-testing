-- ============================================
-- New Friend Celebration Feature
-- ============================================
-- 1. Modify accept_friend_request to insert friend_accepted for BOTH users with names
-- 2. Create get_new_friend_celebration_data RPC
-- ============================================

BEGIN;

-- ============================================
-- STEP 1: Modify accept_friend_request to insert friend_accepted for both users (with names both ways)
-- ============================================
CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  request_record RECORD;
  current_user_id uuid;
  friendship_exists boolean := false;
  sender_name text;
  receiver_name text;
BEGIN
  current_user_id := auth.uid();
  
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Get the friend request (only receiver can accept)
  SELECT 
    id,
    user_id as sender_id,
    related_user_id as receiver_id,
    status
  INTO request_record
  FROM public.user_relationships 
  WHERE id = request_id 
    AND related_user_id = current_user_id  -- receiver is current user
    AND relationship_type = 'friend'
    AND status = 'pending';
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found, already processed, or you are not the receiver';
  END IF;
  
  -- Get names for celebration notifications
  SELECT name INTO sender_name FROM public.users WHERE user_id = request_record.sender_id;
  SELECT name INTO receiver_name FROM public.users WHERE user_id = request_record.receiver_id;
  
  -- Check if friendship already exists (prevent duplicates)
  SELECT EXISTS (
    SELECT 1 FROM public.user_relationships
    WHERE relationship_type = 'friend'
      AND status = 'accepted'
      AND (
        (user_id = request_record.sender_id AND related_user_id = request_record.receiver_id)
        OR
        (user_id = request_record.receiver_id AND related_user_id = request_record.sender_id)
      )
  ) INTO friendship_exists;
  
  -- Update the friend request status to accepted
  UPDATE public.user_relationships 
  SET status = 'accepted', 
      updated_at = now()
  WHERE id = request_id;
  
  -- Create reciprocal relationship only if it doesn't already exist
  IF NOT friendship_exists THEN
    BEGIN
      INSERT INTO public.user_relationships (
        user_id,
        related_user_id,
        relationship_type,
        status,
        created_at,
        updated_at
      )
      SELECT 
        request_record.receiver_id,
        request_record.sender_id,
        'friend',
        'accepted',
        now(),
        now()
      WHERE NOT EXISTS (
        SELECT 1 FROM public.user_relationships
        WHERE user_id = request_record.receiver_id
          AND related_user_id = request_record.sender_id
          AND relationship_type = 'friend'
      );
    EXCEPTION
      WHEN unique_violation THEN
        NULL;
    END;
  END IF;
  
  -- Create friend_accepted for BOTH users, each with the other person's name
  -- Sender (who sent the request) sees receiver's name
  INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
  VALUES (
    request_record.sender_id,
    'friend_accepted',
    'You''re now friends!',
    'You and ' || COALESCE(receiver_name, 'your new friend') || ' are now friends.',
    jsonb_build_object('friend_id', request_record.receiver_id, 'friend_name', COALESCE(receiver_name, 'Friend')),
    request_record.receiver_id
  );
  
  -- Receiver (who accepted) sees sender's name
  INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
  VALUES (
    request_record.receiver_id,
    'friend_accepted',
    'You''re now friends!',
    'You and ' || COALESCE(sender_name, 'your new friend') || ' are now friends.',
    jsonb_build_object('friend_id', request_record.sender_id, 'friend_name', COALESCE(sender_name, 'Friend')),
    request_record.sender_id
  );
  
  -- Delete the original friend_request notification
  DELETE FROM public.notifications
  WHERE user_id = current_user_id
    AND type = 'friend_request'
    AND (data->>'request_id')::uuid = request_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_friend_request(uuid) TO authenticated;

COMMENT ON FUNCTION public.accept_friend_request IS 'Accepts a friend request, creates reciprocal friendship, and inserts friend_accepted notifications for both users (each with the other person''s name).';

-- ============================================
-- STEP 3: Create get_new_friend_celebration_data RPC
-- ============================================
CREATE OR REPLACE FUNCTION public.get_new_friend_celebration_data(p_friend_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current_user_id uuid;
  v_events_attended jsonb;
  v_shared_genres jsonb;
  v_suggested_events jsonb;
  v_shared_genres_arr text[];
BEGIN
  v_current_user_id := auth.uid();
  IF v_current_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;
  
  -- Verify friendship exists
  IF NOT EXISTS (
    SELECT 1 FROM public.user_relationships
    WHERE relationship_type = 'friend' AND status = 'accepted'
      AND ((user_id = v_current_user_id AND related_user_id = p_friend_id)
           OR (user_id = p_friend_id AND related_user_id = v_current_user_id))
  ) THEN
    RAISE EXCEPTION 'Friendship not found or not accepted';
  END IF;

  -- Events attended together: both users have reviews with was_there=true or non-draft review
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'title', e.title,
        'event_date', e.event_date,
        'venue_city', e.venue_city,
        'venue_name', v.name,
        'artist_name', a.name
      )
      ORDER BY e.event_date DESC
    ),
    '[]'::jsonb
  ) INTO v_events_attended
  FROM (
    SELECT DISTINCT r1.event_id
    FROM public.reviews r1
    INNER JOIN public.reviews r2 ON r1.event_id = r2.event_id AND r2.user_id = p_friend_id
    WHERE r1.user_id = v_current_user_id
      AND r1.event_id IS NOT NULL
      AND r1.is_draft = false
      AND r2.is_draft = false
      AND (r1.was_there = true OR (r1.review_text IS NOT NULL AND r1.review_text != 'ATTENDANCE_ONLY'))
      AND (r2.was_there = true OR (r2.review_text IS NOT NULL AND r2.review_text != 'ATTENDANCE_ONLY'))
  ) shared
  INNER JOIN public.events e ON e.id = shared.event_id
  LEFT JOIN public.artists a ON a.id = e.artist_id
  LEFT JOIN public.venues v ON v.id = e.venue_id;

  -- Shared genres: intersection of user_preferences.top_genres
  WITH shared AS (
    SELECT unnest(up1.top_genres) AS genre
    FROM public.user_preferences up1
    WHERE up1.user_id = v_current_user_id AND up1.top_genres IS NOT NULL AND array_length(up1.top_genres, 1) > 0
    INTERSECT
    SELECT unnest(up2.top_genres)
    FROM public.user_preferences up2
    WHERE up2.user_id = p_friend_id AND up2.top_genres IS NOT NULL AND array_length(up2.top_genres, 1) > 0
  )
  SELECT
    COALESCE(jsonb_agg(genre ORDER BY genre), '[]'::jsonb),
    COALESCE(ARRAY_AGG(genre ORDER BY genre), '{}')
  INTO v_shared_genres, v_shared_genres_arr
  FROM shared;

  IF v_shared_genres_arr IS NULL THEN
    v_shared_genres_arr := '{}';
  END IF;

  -- Suggested events: upcoming events matching shared genres, limit 5
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', ev.id,
        'title', ev.title,
        'event_date', ev.event_date,
        'venue_city', ev.venue_city,
        'venue_name', vn.name,
        'artist_name', ar.name,
        'genres', ev.genres
      )
    ),
    '[]'::jsonb
  ) INTO v_suggested_events
  FROM (
    SELECT e2.id, e2.title, e2.event_date, e2.venue_city, e2.venue_id, e2.artist_id, e2.genres
    FROM public.events e2
    WHERE e2.event_date > now()
      AND (
        (array_length(v_shared_genres_arr, 1) > 0 AND e2.genres && v_shared_genres_arr)
        OR (array_length(v_shared_genres_arr, 1) IS NULL)
      )
    ORDER BY e2.event_date ASC
    LIMIT 5
  ) ev
  LEFT JOIN public.artists ar ON ar.id = ev.artist_id
  LEFT JOIN public.venues vn ON vn.id = ev.venue_id;

  RETURN jsonb_build_object(
    'events_attended_together', COALESCE(v_events_attended, '[]'::jsonb),
    'shared_genres', COALESCE(v_shared_genres, '[]'::jsonb),
    'suggested_events', COALESCE(v_suggested_events, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_new_friend_celebration_data(uuid) TO authenticated;

COMMENT ON FUNCTION public.get_new_friend_celebration_data IS 'Returns events attended together, shared genres, and suggested events for new friend celebration popup.';

COMMIT;
