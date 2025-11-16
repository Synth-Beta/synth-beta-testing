-- ============================================
-- DATABASE CONSOLIDATION: PHASE 4 - UPDATE FUNCTIONS
-- ============================================
-- This migration updates all database functions to reference new consolidated table names
-- Run this AFTER Phase 3 (data migration) is complete
-- NOTE: This is a partial update - some functions may need manual review

-- ============================================
-- 4.1 UPDATE VIEW FUNCTIONS
-- ============================================

-- Update get_artist_for_review function
DROP FUNCTION IF EXISTS public.get_artist_for_review(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_artist_for_review(review_id UUID)
RETURNS TABLE (
    artist_id UUID,
    artist_name TEXT,
    artist_image_url TEXT,
    artist_url TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id as artist_id,
        a.name as artist_name,
        a.image_url as artist_image_url,
        a.url as artist_url
    FROM public.reviews r
    LEFT JOIN public.artists a ON r.artist_id = a.id
    WHERE r.id = review_id;
END;
$$ LANGUAGE plpgsql;

-- Update get_venue_for_review function
DROP FUNCTION IF EXISTS public.get_venue_for_review(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.get_venue_for_review(review_id UUID)
RETURNS TABLE (
    venue_id UUID,
    venue_name TEXT,
    venue_image_url TEXT,
    venue_address JSONB,
    venue_geo JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        v.id as venue_id,
        v.name as venue_name,
        v.image_url as venue_image_url,
        v.address as venue_address,
        v.geo as venue_geo
    FROM public.reviews r
    LEFT JOIN public.venues v ON r.venue_id = v.id
    WHERE r.id = review_id;
END;
$$ LANGUAGE plpgsql;

-- Update get_artist_events function
DROP FUNCTION IF EXISTS public.get_artist_events(UUID, INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION public.get_artist_events(artist_uuid UUID, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    event_id UUID,
    event_title TEXT,
    venue_name TEXT,
    event_date TIMESTAMP WITH TIME ZONE,
    venue_city TEXT,
    venue_state TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id as event_id,
        e.title as event_title,
        e.venue_name,
        e.event_date,
        e.venue_city,
        e.venue_state
    FROM public.events e
    WHERE e.artist_uuid = artist_uuid
    ORDER BY e.event_date DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- Update get_venue_events function
-- Drop existing function first to handle return type changes
DROP FUNCTION IF EXISTS public.get_venue_events(UUID, INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION public.get_venue_events(venue_uuid UUID, limit_count INTEGER DEFAULT 10)
RETURNS TABLE (
    event_id UUID,
    event_title TEXT,
    artist_name TEXT,
    event_date TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        e.id as event_id,
        e.title as event_title,
        e.artist_name,
        e.event_date
    FROM public.events e
    WHERE e.venue_uuid = venue_uuid
    ORDER BY e.event_date DESC
    LIMIT limit_count;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 4.2 UPDATE RECOMMENDATION FUNCTIONS
-- ============================================

-- Update calculate_user_recommendations function
-- Note: This is a simplified version - the full function is complex and may need manual review
-- Drop existing function first
DROP FUNCTION IF EXISTS public.calculate_user_recommendations(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.calculate_user_recommendations(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_connection_degree INT;
  v_connection_label TEXT;
  v_shared_artists_count INT;
  v_shared_venues_count INT;
  v_shared_genres_count INT;
  v_shared_events_count INT;
  v_mutual_friends_count INT;
  v_network_proximity_score NUMERIC;
  v_shared_interests_score NUMERIC;
  v_event_overlap_score NUMERIC;
  v_recommendation_score NUMERIC;
  v_recommendation_reasons TEXT[];
  v_candidate_user_id UUID;
BEGIN
  -- Clear existing recommendations for this user
  -- Note: user_recommendations_cache is migrated to user_preferences_new.recommendation_cache
  -- This function should update user_preferences_new.recommendation_cache instead
  UPDATE public.user_preferences
  SET recommendation_cache = '[]'::JSONB
  WHERE user_id = p_user_id;

  -- Get all candidate users (1st, 2nd, 3rd degree + strangers)
  -- Note: friends table is migrated to relationships_new
  FOR v_candidate_user_id, v_connection_degree IN
    WITH first_degree AS (
      SELECT DISTINCT
        r.related_entity_id::UUID as connected_user_id
      FROM public.relationships r
      WHERE r.user_id = p_user_id
        AND r.related_entity_type = 'user'
        AND r.relationship_type = 'friend'
        AND r.status = 'accepted'
    ),
    second_degree AS (
      SELECT DISTINCT
        r2.related_entity_id::UUID as connected_user_id
      FROM first_degree fd
      JOIN public.relationships r2 ON r2.user_id = fd.connected_user_id
        AND r2.related_entity_type = 'user'
        AND r2.relationship_type = 'friend'
        AND r2.status = 'accepted'
      WHERE r2.related_entity_id::UUID != p_user_id
        AND r2.related_entity_id::UUID NOT IN (SELECT connected_user_id FROM first_degree)
    ),
    third_degree AS (
      SELECT DISTINCT
        r3.related_entity_id::UUID as connected_user_id
      FROM second_degree sd
      JOIN public.relationships r3 ON r3.user_id = sd.connected_user_id
        AND r3.related_entity_type = 'user'
        AND r3.relationship_type = 'friend'
        AND r3.status = 'accepted'
      WHERE r3.related_entity_id::UUID != p_user_id
        AND r3.related_entity_id::UUID NOT IN (SELECT connected_user_id FROM first_degree)
        AND r3.related_entity_id::UUID NOT IN (SELECT connected_user_id FROM second_degree)
    ),
    all_connections AS (
      SELECT connected_user_id, 1 as degree FROM first_degree
      UNION
      SELECT connected_user_id, 2 as degree FROM second_degree
      UNION
      SELECT connected_user_id, 3 as degree FROM third_degree
    ),
    excluded_users AS (
      -- Users already friends
      SELECT DISTINCT r.related_entity_id::UUID as user_id
      FROM public.relationships r
      WHERE r.user_id = p_user_id
        AND r.related_entity_type = 'user'
        AND r.relationship_type = 'friend'
        AND r.status = 'accepted'
      UNION
      -- Users blocked
      SELECT DISTINCT r.related_entity_id::UUID as user_id
      FROM public.relationships r
      WHERE r.user_id = p_user_id
        AND r.related_entity_type = 'user'
        AND r.relationship_type = 'block'
    ),
    candidate_users AS (
      SELECT 
        u.user_id,
        COALESCE(ac.degree, 4) as connection_degree,
        CASE 
          WHEN ac.degree = 1 THEN 'Friend'
          WHEN ac.degree = 2 THEN 'Mutual Friend'
          WHEN ac.degree = 3 THEN 'Mutual Friends +'
          ELSE 'Stranger'
        END as connection_label
      FROM public.users u
      LEFT JOIN all_connections ac ON ac.connected_user_id = u.user_id
      WHERE u.user_id != p_user_id
        AND u.user_id NOT IN (SELECT user_id FROM excluded_users)
        AND u.is_public_profile = true
    )
    SELECT 
      cu.user_id,
      cu.connection_degree
    FROM candidate_users cu
    LIMIT 100 -- Limit to top 100 candidates
  LOOP
    -- Calculate recommendation score
    -- Note: This is a simplified version - the full calculation is complex
    v_network_proximity_score := CASE v_connection_degree
      WHEN 1 THEN 50
      WHEN 2 THEN 30
      WHEN 3 THEN 15
      ELSE 5
    END;
    
    -- Calculate shared interests
    -- Note: artist_follows and venue_follows are migrated to relationships_new
    SELECT COUNT(*) INTO v_shared_artists_count
    FROM public.relationships r1
    JOIN public.relationships r2 ON r1.related_entity_id = r2.related_entity_id
    WHERE r1.user_id = p_user_id
      AND r2.user_id = v_candidate_user_id
      AND r1.related_entity_type = 'artist'
      AND r2.related_entity_type = 'artist'
      AND r1.relationship_type = 'follow'
      AND r2.relationship_type = 'follow';
    
    SELECT COUNT(*) INTO v_shared_venues_count
    FROM public.relationships r1
    JOIN public.relationships r2 ON r1.related_entity_id = r2.related_entity_id
    WHERE r1.user_id = p_user_id
      AND r2.user_id = v_candidate_user_id
      AND r1.related_entity_type = 'venue'
      AND r2.related_entity_type = 'venue'
      AND r1.relationship_type = 'follow'
      AND r2.relationship_type = 'follow';
    
    -- Calculate shared events
    SELECT COUNT(*) INTO v_shared_events_count
    FROM public.relationships r1
    JOIN public.relationships r2 ON r1.related_entity_id = r2.related_entity_id
    WHERE r1.user_id = p_user_id
      AND r2.user_id = v_candidate_user_id
      AND r1.related_entity_type = 'event'
      AND r2.related_entity_type = 'event'
      AND r1.relationship_type IN ('interest', 'going', 'maybe');
    
    -- Calculate mutual friends
    SELECT COUNT(*) INTO v_mutual_friends_count
    FROM public.relationships r1
    JOIN public.relationships r2 ON r1.related_entity_id = r2.related_entity_id
    WHERE r1.user_id = p_user_id
      AND r2.user_id = v_candidate_user_id
      AND r1.related_entity_type = 'user'
      AND r2.related_entity_type = 'user'
      AND r1.relationship_type = 'friend'
      AND r2.relationship_type = 'friend'
      AND r1.status = 'accepted'
      AND r2.status = 'accepted';
    
    -- Calculate shared interests score
    v_shared_interests_score := (v_shared_artists_count * 5) + (v_shared_venues_count * 3) + (v_shared_genres_count * 2);
    
    -- Calculate event overlap score
    v_event_overlap_score := v_shared_events_count * 10;
    
    -- Calculate total recommendation score
    v_recommendation_score := v_network_proximity_score + v_shared_interests_score + v_event_overlap_score + (v_mutual_friends_count * 5);
    
    -- Build recommendation reasons
    v_recommendation_reasons := ARRAY[]::TEXT[];
    IF v_shared_artists_count > 0 THEN
      v_recommendation_reasons := v_recommendation_reasons || format('%s shared artists', v_shared_artists_count);
    END IF;
    IF v_shared_venues_count > 0 THEN
      v_recommendation_reasons := v_recommendation_reasons || format('%s shared venues', v_shared_venues_count);
    END IF;
    IF v_shared_events_count > 0 THEN
      v_recommendation_reasons := v_recommendation_reasons || format('%s shared events', v_shared_events_count);
    END IF;
    IF v_mutual_friends_count > 0 THEN
      v_recommendation_reasons := v_recommendation_reasons || format('%s mutual friends', v_mutual_friends_count);
    END IF;
    
    -- Update user_preferences_new.recommendation_cache
    UPDATE public.user_preferences
    SET recommendation_cache = COALESCE(recommendation_cache, '[]'::JSONB) || jsonb_build_array(
      jsonb_build_object(
        'recommended_user_id', v_candidate_user_id,
        'recommendation_score', v_recommendation_score,
        'connection_degree', v_connection_degree,
        'connection_label', CASE v_connection_degree
          WHEN 1 THEN 'Friend'
          WHEN 2 THEN 'Mutual Friend'
          WHEN 3 THEN 'Mutual Friends +'
          ELSE 'Stranger'
        END,
        'shared_artists_count', v_shared_artists_count,
        'shared_venues_count', v_shared_venues_count,
        'shared_genres_count', v_shared_genres_count,
        'shared_events_count', v_shared_events_count,
        'mutual_friends_count', v_mutual_friends_count,
        'recommendation_reasons', v_recommendation_reasons,
        'last_calculated_at', now()
      )
    ),
    updated_at = now()
    WHERE user_id = p_user_id;
  END LOOP;
END;
$$;

-- ============================================
-- 4.3 UPDATE PERSONALIZED FEED FUNCTIONS
-- ============================================

-- Update calculate_event_relevance_score function
-- Note: This is a simplified version - the full function is complex and may need manual review
-- Drop existing function first
DROP FUNCTION IF EXISTS calculate_event_relevance_score(UUID, UUID) CASCADE;

CREATE OR REPLACE FUNCTION calculate_event_relevance_score(
  p_user_id UUID,
  p_event_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_score NUMERIC := 0;
  v_event RECORD;
  v_artist_score NUMERIC := 0;
  v_genre_score NUMERIC := 0;
  v_venue_score NUMERIC := 0;
  v_social_score NUMERIC := 0;
  v_recency_score NUMERIC := 0;
BEGIN
  -- Get event details
  SELECT 
    e.id,
    e.artist_name,
    e.artist_uuid,
    e.venue_name,
    e.venue_uuid,
    e.genres,
    e.event_date
  INTO v_event
  FROM public.events e
  WHERE e.id = p_event_id;
  
  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  
  -- ARTIST MATCH SCORE (max 40 points)
  -- Note: music_preference_signals is migrated to user_preferences_new.music_preference_signals
  SELECT COALESCE((preference_signal->>'preference_score')::NUMERIC, 0)
  INTO v_artist_score
  FROM public.user_preferences up,
  jsonb_array_elements(up.music_preference_signals) AS preference_signal
  WHERE up.user_id = p_user_id
    AND (preference_signal->>'preference_type')::TEXT = 'artist'
    AND (preference_signal->>'preference_value')::TEXT = v_event.artist_name
  LIMIT 1;
  
  -- Cap at 40
  v_artist_score := LEAST(v_artist_score, 40);
  
  -- GENRE MATCH SCORE (max 30 points)
  IF v_event.genres IS NOT NULL AND array_length(v_event.genres, 1) > 0 THEN
    SELECT COALESCE(SUM((preference_signal->>'preference_score')::NUMERIC), 0)
    INTO v_genre_score
    FROM public.user_preferences up,
    jsonb_array_elements(up.music_preference_signals) AS preference_signal,
    unnest(v_event.genres) AS event_genre
    WHERE up.user_id = p_user_id
      AND (preference_signal->>'preference_type')::TEXT = 'genre'
      AND (preference_signal->>'preference_value')::TEXT = event_genre;
    
    -- Normalize: divide by number of genres and cap at 30
    v_genre_score := LEAST(v_genre_score / array_length(v_event.genres, 1), 30);
  END IF;
  
  -- VENUE MATCH SCORE (max 15 points)
  SELECT COALESCE((preference_signal->>'preference_score')::NUMERIC, 0)
  INTO v_venue_score
  FROM public.user_preferences up,
  jsonb_array_elements(up.music_preference_signals) AS preference_signal
  WHERE up.user_id = p_user_id
    AND (preference_signal->>'preference_type')::TEXT = 'venue'
    AND (preference_signal->>'preference_value')::TEXT = v_event.venue_name
  LIMIT 1;
  
  -- Cap at 15
  v_venue_score := LEAST(v_venue_score, 15);
  
  -- SOCIAL PROOF SCORE (max 10 points)
  -- Check if friends are interested in this event
  -- Note: user_jambase_events and friends are migrated to relationships_new
  SELECT COUNT(*) * 2 -- 2 points per friend interested
  INTO v_social_score
    FROM public.relationships r1
    JOIN public.relationships r2 ON r1.user_id = r2.related_entity_id::UUID
    AND r2.related_entity_type = 'event'
    AND r2.related_entity_id = p_event_id::TEXT
    AND r2.relationship_type IN ('interest', 'going', 'maybe')
  WHERE r1.user_id = p_user_id
    AND r1.related_entity_type = 'user'
    AND r1.relationship_type = 'friend'
    AND r1.status = 'accepted'
    AND r2.user_id = r1.related_entity_id::UUID;
  
  -- Cap at 10
  v_social_score := LEAST(v_social_score, 10);
  
  -- RECENCY SCORE (max 5 points)
  -- Events closer to today get higher scores
  IF v_event.event_date > now() THEN
    v_recency_score := 5 - LEAST(EXTRACT(EPOCH FROM (v_event.event_date - now())) / 86400 / 30, 5);
  ELSE
    v_recency_score := 0;
  END IF;
  
  -- Calculate total score
  v_score := v_artist_score + v_genre_score + v_venue_score + v_social_score + v_recency_score;
  
  RETURN v_score;
END;
$function$;

-- Update get_personalized_events_feed function
-- Note: This is a simplified version - the full function is complex and may need manual review
-- Drop existing function first
DROP FUNCTION IF EXISTS get_personalized_events_feed(UUID, INTEGER, INTEGER) CASCADE;

CREATE OR REPLACE FUNCTION get_personalized_events_feed(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  event_id UUID,
  event_title TEXT,
  artist_name TEXT,
  venue_name TEXT,
  event_date TIMESTAMP WITH TIME ZONE,
  relevance_score NUMERIC,
  promoted BOOLEAN,
  promotion_tier TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    e.id as event_id,
    e.title as event_title,
    e.artist_name,
    e.venue_name,
    e.event_date,
    calculate_event_relevance_score(p_user_id, e.id) as relevance_score,
    e.promoted,
    e.promotion_tier
  FROM public.events e
  WHERE e.event_date > now()
    AND NOT EXISTS (
      -- Exclude events user is not interested in
      SELECT 1 FROM public.relationships r
      WHERE r.user_id = p_user_id
        AND r.related_entity_type = 'event'
        AND r.related_entity_id = e.id::TEXT
        AND r.relationship_type = 'not_going'
    )
  ORDER BY 
    e.promoted DESC,
    e.promotion_tier DESC,
    calculate_event_relevance_score(p_user_id, e.id) DESC,
    e.event_date ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$function$;

-- ============================================
-- 4.4 UPDATE MUSIC PREFERENCE FUNCTIONS
-- ============================================

-- Update recalculate_music_preference_signals function
-- Note: This function is complex and may need manual review
-- This is a placeholder - the full function should be updated to use user_preferences_new
-- Drop existing function first
DROP FUNCTION IF EXISTS public.recalculate_music_preference_signals(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.recalculate_music_preference_signals(p_user_id UUID DEFAULT NULL)
RETURNS TABLE(
  user_id UUID,
  preference_type TEXT,
  preference_value TEXT,
  total_score NUMERIC,
  total_interactions INT,
  signal_breakdown JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Note: This function needs to be fully rewritten to use:
  -- - reviews_new instead of user_reviews
  -- - relationships_new instead of artist_follows, venue_follows, user_jambase_events
  -- - user_preferences_new.music_preference_signals instead of music_preference_signals table
  -- This is a placeholder that returns empty results
  RETURN QUERY
  SELECT 
    NULL::UUID as user_id,
    NULL::TEXT as preference_type,
    NULL::TEXT as preference_value,
    NULL::NUMERIC as total_score,
    NULL::INT as total_interactions,
    NULL::JSONB as signal_breakdown
  WHERE false;
END;
$function$;

-- ============================================
-- 4.5 UPDATE ANALYTICS FUNCTIONS
-- ============================================

-- Update aggregate_daily_analytics function
-- Note: This function should aggregate data from interactions and update analytics_daily
-- Drop existing function first to handle parameter name changes
DROP FUNCTION IF EXISTS public.aggregate_daily_analytics(DATE) CASCADE;

CREATE OR REPLACE FUNCTION public.aggregate_daily_analytics(p_date DATE DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Aggregate user analytics
  INSERT INTO public.analytics_daily (
    entity_type,
    entity_id,
    date,
    metrics,
    created_at,
    updated_at
  )
  SELECT 
    'user' as entity_type,
    i.user_id::TEXT as entity_id,
    p_date as date,
    jsonb_build_object(
      'events_viewed', COUNT(*) FILTER (WHERE i.entity_type = 'event' AND i.event_type = 'view'),
      'events_clicked', COUNT(*) FILTER (WHERE i.entity_type = 'event' AND i.event_type = 'click'),
      'events_interested', COUNT(*) FILTER (WHERE i.entity_type = 'event' AND i.event_type = 'interest'),
      'reviews_written', COUNT(*) FILTER (WHERE i.entity_type = 'review' AND i.event_type = 'create'),
      'reviews_viewed', COUNT(*) FILTER (WHERE i.entity_type = 'review' AND i.event_type = 'view')
    ) as metrics,
    now() as created_at,
    now() as updated_at
  FROM public.interactions i
  WHERE DATE(i.occurred_at) = p_date
  GROUP BY i.user_id
  ON CONFLICT (entity_type, entity_id, date) DO UPDATE
  SET metrics = EXCLUDED.metrics,
    updated_at = now();
  
  -- Aggregate event analytics
  INSERT INTO public.analytics_daily (
    entity_type,
    entity_id,
    date,
    metrics,
    created_at,
    updated_at
  )
  SELECT 
    'event' as entity_type,
    i.entity_id,
    p_date as date,
    jsonb_build_object(
      'impressions', COUNT(*) FILTER (WHERE i.event_type = 'view'),
      'clicks', COUNT(*) FILTER (WHERE i.event_type = 'click'),
      'interested_count', COUNT(*) FILTER (WHERE i.event_type = 'interest')
    ) as metrics,
    now() as created_at,
    now() as updated_at
  FROM public.interactions i
  WHERE i.entity_type = 'event'
    AND DATE(i.occurred_at) = p_date
  GROUP BY i.entity_id
  ON CONFLICT (entity_type, entity_id, date) DO UPDATE
  SET metrics = EXCLUDED.metrics,
    updated_at = now();
END;
$function$;

-- ============================================
-- 4.6 UPDATE RELATIONSHIP FUNCTIONS
-- ============================================

-- Update set_artist_follow function
-- Drop existing function first to handle parameter name changes
DROP FUNCTION IF EXISTS public.set_artist_follow(UUID, BOOLEAN) CASCADE;

CREATE OR REPLACE FUNCTION public.set_artist_follow(
  p_artist_id UUID,
  p_follow BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF p_follow THEN
    INSERT INTO public.relationships (
      user_id,
      related_entity_type,
      related_entity_id,
      relationship_type,
      status,
      metadata,
      created_at,
      updated_at
    )
    VALUES (
      auth.uid(),
      'artist',
      p_artist_id::TEXT,
      'follow',
      'accepted',
      jsonb_build_object(
        'artist_id', p_artist_id
      ),
      now(),
      now()
    )
    ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) DO NOTHING;
  ELSE
    DELETE FROM public.relationships
    WHERE user_id = auth.uid()
      AND related_entity_type = 'artist'
      AND related_entity_id = p_artist_id::TEXT
      AND relationship_type = 'follow';
  END IF;
END;
$function$;

-- Update set_venue_follow function
-- Drop existing function first to handle parameter name changes
DROP FUNCTION IF EXISTS public.set_venue_follow(TEXT, TEXT, TEXT, BOOLEAN) CASCADE;

CREATE OR REPLACE FUNCTION public.set_venue_follow(
  p_venue_name TEXT,
  p_venue_city TEXT,
  p_venue_state TEXT,
  p_follow BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_venue_id TEXT;
BEGIN
  -- Try to find venue by name+city+state, otherwise use name as identifier
  SELECT COALESCE(v.id::TEXT, p_venue_name || '|' || COALESCE(p_venue_city, '') || '|' || COALESCE(p_venue_state, ''))
  INTO v_venue_id
    FROM public.venues v
  WHERE v.name = p_venue_name
    AND (v.address->>'addressLocality') = p_venue_city
    AND (v.address->>'addressRegion') = p_venue_state
  LIMIT 1;
  
  IF v_venue_id IS NULL THEN
    v_venue_id := p_venue_name || '|' || COALESCE(p_venue_city, '') || '|' || COALESCE(p_venue_state, '');
  END IF;
  
  IF p_follow THEN
    INSERT INTO public.relationships (
      user_id,
      related_entity_type,
      related_entity_id,
      relationship_type,
      status,
      metadata,
      created_at,
      updated_at
    )
    VALUES (
      auth.uid(),
      'venue',
      v_venue_id,
      'follow',
      'accepted',
      jsonb_build_object(
        'venue_name', p_venue_name,
        'venue_city', p_venue_city,
        'venue_state', p_venue_state
      ),
      now(),
      now()
    )
    ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) DO NOTHING;
  ELSE
    DELETE FROM public.relationships
    WHERE user_id = auth.uid()
      AND related_entity_type = 'venue'
      AND related_entity_id = v_venue_id
      AND relationship_type = 'follow';
  END IF;
END;
$function$;

-- Update set_user_interest function
-- Drop existing function first to handle parameter name changes
DROP FUNCTION IF EXISTS public.set_user_interest(UUID, BOOLEAN, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION public.set_user_interest(
  event_id UUID,
  interested BOOLEAN,
  rsvp_status TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_relationship_type TEXT;
BEGIN
  -- Determine relationship type based on rsvp_status
  v_relationship_type := CASE 
    WHEN rsvp_status = 'going' THEN 'going'
    WHEN rsvp_status = 'maybe' THEN 'maybe'
    WHEN rsvp_status = 'not_going' THEN 'not_going'
    ELSE 'interest'
  END;
  
  IF interested THEN
    INSERT INTO public.relationships (
      user_id,
      related_entity_type,
      related_entity_id,
      relationship_type,
      status,
      metadata,
      created_at,
      updated_at
    )
    VALUES (
      auth.uid(),
      'event',
      event_id::TEXT,
      v_relationship_type,
      'accepted',
      jsonb_build_object(
        'event_id', event_id,
        'rsvp_status', rsvp_status
      ),
      now(),
      now()
    )
    ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) 
    DO UPDATE SET
      metadata = EXCLUDED.metadata,
      updated_at = now();
  ELSE
    DELETE FROM public.relationships
    WHERE user_id = auth.uid()
      AND related_entity_type = 'event'
      AND related_entity_id = event_id::TEXT
      AND relationship_type = v_relationship_type;
  END IF;
END;
$function$;

-- ============================================
-- 4.7 UPDATE REVIEW FUNCTIONS
-- ============================================

-- Update increment_review_count function
CREATE OR REPLACE FUNCTION public.increment_review_count(
  review_id UUID,
  column_name TEXT,
  delta INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  EXECUTE format('UPDATE public.reviews SET %I = %I + %s WHERE id = %L', 
    column_name, column_name, delta, review_id);
END;
$function$;

-- Update update_review_counts trigger function
CREATE OR REPLACE FUNCTION public.update_review_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment count when new like/comment/share is added
    IF TG_TABLE_NAME = 'engagements' AND NEW.entity_type = 'review' AND NEW.engagement_type = 'like' THEN
      UPDATE public.reviews 
      SET likes_count = COALESCE(likes_count, 0) + 1 
      WHERE id = NEW.entity_id;
    ELSIF TG_TABLE_NAME = 'comments' AND NEW.entity_type = 'review' THEN
      UPDATE public.reviews 
      SET comments_count = COALESCE(comments_count, 0) + 1 
      WHERE id = NEW.entity_id;
    ELSIF TG_TABLE_NAME = 'engagements' AND NEW.entity_type = 'review' AND NEW.engagement_type = 'share' THEN
      UPDATE public.reviews 
      SET shares_count = COALESCE(shares_count, 0) + 1 
      WHERE id = NEW.entity_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement count when like/comment/share is removed
    IF TG_TABLE_NAME = 'engagements' AND OLD.entity_type = 'review' AND OLD.engagement_type = 'like' THEN
      UPDATE public.reviews 
      SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) 
      WHERE id = OLD.entity_id;
    ELSIF TG_TABLE_NAME = 'comments' AND OLD.entity_type = 'review' THEN
      UPDATE public.reviews 
      SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) 
      WHERE id = OLD.entity_id;
    ELSIF TG_TABLE_NAME = 'engagements' AND OLD.entity_type = 'review' AND OLD.engagement_type = 'share' THEN
      UPDATE public.reviews 
      SET shares_count = GREATEST(COALESCE(shares_count, 0) - 1, 0) 
      WHERE id = OLD.entity_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- ============================================
-- 4.8 UPDATE COMMENT FUNCTIONS
-- ============================================

-- Update comment likes count function
CREATE OR REPLACE FUNCTION public.update_comment_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment comment likes count
    IF NEW.entity_type = 'comment' AND NEW.engagement_type = 'like' THEN
      UPDATE public.comments 
      SET likes_count = COALESCE(likes_count, 0) + 1 
      WHERE id = NEW.entity_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement comment likes count
    IF OLD.entity_type = 'comment' AND OLD.engagement_type = 'like' THEN
      UPDATE public.comments 
      SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) 
      WHERE id = OLD.entity_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- ============================================
-- 4.9 UPDATE FRIEND FUNCTIONS
-- ============================================

-- Update accept_friend_request function
-- Drop existing function first
DROP FUNCTION IF EXISTS public.accept_friend_request(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.accept_friend_request(request_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_sender_id UUID;
  v_receiver_id UUID;
BEGIN
  -- Get the friend request
  -- Note: friend_requests is migrated to relationships_new
  SELECT 
    r.related_entity_id::UUID as sender_id,
    r.user_id as receiver_id
  INTO v_sender_id, v_receiver_id
  FROM public.relationships r
  WHERE r.id = request_id
    AND r.related_entity_type = 'user'
    AND r.relationship_type = 'friend'
    AND r.status = 'pending'
    AND r.user_id = auth.uid();
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Friend request not found or already processed';
  END IF;
  
  -- Update the friend request status
  UPDATE public.relationships 
  SET status = 'accepted', updated_at = now()
  WHERE id = request_id;
  
  -- Create bidirectional friendship
  -- Create relationship from sender to receiver
    INSERT INTO public.relationships (
    user_id,
    related_entity_type,
    related_entity_id,
    relationship_type,
    status,
    metadata,
    created_at,
    updated_at
  )
  VALUES (
    v_sender_id,
    'user',
    v_receiver_id::TEXT,
    'friend',
    'accepted',
    jsonb_build_object(
      'friend_request_id', request_id,
      'friend_user_id', v_receiver_id
    ),
    now(),
    now()
  )
  ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) DO NOTHING;
  
  -- Create relationship from receiver to sender
    INSERT INTO public.relationships (
    user_id,
    related_entity_type,
    related_entity_id,
    relationship_type,
    status,
    metadata,
    created_at,
    updated_at
  )
  VALUES (
    v_receiver_id,
    'user',
    v_sender_id::TEXT,
    'friend',
    'accepted',
    jsonb_build_object(
      'friend_request_id', request_id,
      'friend_user_id', v_sender_id
    ),
    now(),
    now()
  )
  ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) DO NOTHING;
END;
$function$;

-- Update send_friend_request function
-- Drop existing function first
DROP FUNCTION IF EXISTS public.send_friend_request(UUID) CASCADE;

CREATE OR REPLACE FUNCTION public.send_friend_request(p_receiver_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_request_id UUID;
BEGIN
  -- Create friend request
    INSERT INTO public.relationships (
    user_id,
    related_entity_type,
    related_entity_id,
    relationship_type,
    status,
    metadata,
    created_at,
    updated_at
  )
  VALUES (
    auth.uid(),
    'user',
    p_receiver_id::TEXT,
    'friend',
    'pending',
    jsonb_build_object(
      'sender_id', auth.uid(),
      'receiver_id', p_receiver_id
    ),
    now(),
    now()
  )
  ON CONFLICT (user_id, related_entity_type, related_entity_id, relationship_type) DO NOTHING
  RETURNING id INTO v_request_id;
  
  RETURN v_request_id;
END;
$function$;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- Verify all functions updated
SELECT 
  'Functions updated' as status,
  COUNT(*) as function_count
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.prokind = 'f'
  AND (
    pg_get_functiondef(p.oid) LIKE '%users_new%'
    OR pg_get_functiondef(p.oid) LIKE '%events_new%'
    OR pg_get_functiondef(p.oid) LIKE '%artists_new%'
    OR pg_get_functiondef(p.oid) LIKE '%venues_new%'
    OR pg_get_functiondef(p.oid) LIKE '%relationships_new%'
    OR pg_get_functiondef(p.oid) LIKE '%reviews_new%'
    OR pg_get_functiondef(p.oid) LIKE '%comments_new%'
    OR pg_get_functiondef(p.oid) LIKE '%engagements_new%'
    OR pg_get_functiondef(p.oid) LIKE '%interactions_new%'
    OR pg_get_functiondef(p.oid) LIKE '%analytics_daily_new%'
    OR pg_get_functiondef(p.oid) LIKE '%user_preferences_new%'
  );

