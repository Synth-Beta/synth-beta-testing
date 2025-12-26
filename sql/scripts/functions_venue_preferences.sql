-- ============================================
-- VENUE PREFERENCE TRACKING FUNCTIONS
-- ============================================
-- Functions for tracking all venue-related preference signals
-- Grouped: follow, unfollow, review, search

-- ============================================
-- FUNCTION: Track venue follow
-- ============================================
CREATE OR REPLACE FUNCTION track_venue_follow(
  p_user_id UUID,
  p_venue_id UUID DEFAULT NULL,
  p_venue_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_venue_uuid UUID;
  v_venue_name TEXT;
BEGIN
  -- Resolve venue UUID and name
  IF p_venue_id IS NOT NULL THEN
    v_venue_uuid := p_venue_id;
    SELECT name INTO v_venue_name
    FROM public.venues
    WHERE id = p_venue_id;
  END IF;

  -- Fallback to provided name
  IF v_venue_name IS NULL THEN
    v_venue_name := COALESCE(p_venue_name, 'Unknown Venue');
  END IF;

  -- Insert venue follow signal
  INSERT INTO public.user_preference_signals (
    user_id,
    signal_type,
    entity_type,
    entity_id,
    entity_name,
    signal_weight,
    occurred_at
  ) VALUES (
    p_user_id,
    'venue_follow',
    'venue',
    v_venue_uuid,
    v_venue_name,
    7.0,
    now()
  )
  RETURNING id INTO v_signal_id;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track venue unfollow
-- ============================================
CREATE OR REPLACE FUNCTION track_venue_unfollow(
  p_user_id UUID,
  p_venue_id UUID DEFAULT NULL,
  p_venue_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_venue_uuid UUID;
  v_venue_name TEXT;
BEGIN
  -- Resolve venue UUID and name
  IF p_venue_id IS NOT NULL THEN
    v_venue_uuid := p_venue_id;
    SELECT name INTO v_venue_name
    FROM public.venues
    WHERE id = p_venue_id;
  END IF;

  IF v_venue_name IS NULL THEN
    v_venue_name := COALESCE(p_venue_name, 'Unknown Venue');
  END IF;

  -- Insert unfollow signal (negative weight)
  INSERT INTO public.user_preference_signals (
    user_id,
    signal_type,
    entity_type,
    entity_id,
    entity_name,
    signal_weight,
    occurred_at
  ) VALUES (
    p_user_id,
    'venue_unfollow',
    'venue',
    v_venue_uuid,
    v_venue_name,
    -2.0,  -- Negative signal
    now()
  )
  RETURNING id INTO v_signal_id;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track venue review
-- ============================================
CREATE OR REPLACE FUNCTION track_venue_review(
  p_user_id UUID,
  p_review_id UUID,
  p_venue_id UUID,
  p_rating NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_venue_name TEXT;
  v_weight NUMERIC(5,2) := 8.0;
BEGIN
  -- Get venue name
  SELECT name INTO v_venue_name
  FROM public.venues
  WHERE id = p_venue_id;

  -- Adjust weight by rating if provided
  IF p_rating IS NOT NULL THEN
    v_weight := v_weight * (p_rating / 5.0);
  END IF;

  -- Insert venue review signal
  INSERT INTO public.user_preference_signals (
    user_id,
    signal_type,
    entity_type,
    entity_id,
    entity_name,
    signal_weight,
    context,
    occurred_at
  ) VALUES (
    p_user_id,
    'venue_review',
    'venue',
    p_venue_id,
    COALESCE(v_venue_name, 'Unknown Venue'),
    v_weight,
    jsonb_build_object('review_id', p_review_id, 'rating', p_rating),
    now()
  )
  RETURNING id INTO v_signal_id;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- FUNCTION: Track venue search
-- ============================================
CREATE OR REPLACE FUNCTION track_venue_search(
  p_user_id UUID,
  p_search_query TEXT,
  p_venue_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_signal_id UUID;
  v_venue_name TEXT;
BEGIN
  -- Get venue name if venue_id provided
  IF p_venue_id IS NOT NULL THEN
    SELECT name INTO v_venue_name
    FROM public.venues
    WHERE id = p_venue_id;
  END IF;

  -- Insert venue search signal
  INSERT INTO public.user_preference_signals (
    user_id,
    signal_type,
    entity_type,
    entity_id,
    entity_name,
    signal_weight,
    context,
    occurred_at
  ) VALUES (
    p_user_id,
    'venue_search',
    'venue',
    p_venue_id,
    COALESCE(v_venue_name, p_search_query),
    2.0,  -- Lower weight for searches
    jsonb_build_object('search_query', p_search_query),
    now()
  )
  RETURNING id INTO v_signal_id;

  RETURN v_signal_id;
END;
$$;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION track_venue_follow TO authenticated;
GRANT EXECUTE ON FUNCTION track_venue_unfollow TO authenticated;
GRANT EXECUTE ON FUNCTION track_venue_review TO authenticated;
GRANT EXECUTE ON FUNCTION track_venue_search TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON FUNCTION track_venue_follow IS 'Tracks venue follow signal. Weight: 7.0';
COMMENT ON FUNCTION track_venue_unfollow IS 'Tracks venue unfollow signal (negative). Weight: -2.0';
COMMENT ON FUNCTION track_venue_review IS 'Tracks venue review signal. Weight: 8.0 (scaled by rating)';
COMMENT ON FUNCTION track_venue_search IS 'Tracks venue search signal. Weight: 2.0';

