-- ============================================
-- FIX EVENT CREATION ANALYTICS TRACKING
-- ============================================
-- This migration fixes the analytics aggregation to properly track event creation
-- and ensures events populate analytics correctly for business, admin, and creator accounts

-- Step 1: Update the analytics aggregation function to include event creation tracking
CREATE OR REPLACE FUNCTION public.aggregate_daily_analytics(target_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Aggregate user daily metrics
  INSERT INTO public.analytics_user_daily (
    user_id, 
    date, 
    events_viewed, 
    events_clicked, 
    events_interested,
    ticket_links_clicked, 
    reviews_written,
    reviews_viewed,
    reviews_liked,
    searches_performed,
    sessions_count, 
    total_time_seconds,
    avg_session_duration_seconds
  )
  SELECT 
    user_id,
    target_date::DATE,
    COUNT(*) FILTER (WHERE event_type = 'view' AND entity_type = 'event') as events_viewed,
    COUNT(*) FILTER (WHERE event_type = 'click' AND entity_type = 'event') as events_clicked,
    COUNT(*) FILTER (WHERE event_type = 'interest' AND entity_type = 'event') as events_interested,
    COUNT(*) FILTER (WHERE event_type = 'click' AND entity_type = 'ticket_link') as ticket_links_clicked,
    COUNT(*) FILTER (WHERE event_type = 'review') as reviews_written,
    COUNT(*) FILTER (WHERE event_type = 'view' AND entity_type = 'review') as reviews_viewed,
    COUNT(*) FILTER (WHERE event_type = 'like' AND entity_type = 'review') as reviews_liked,
    COUNT(*) FILTER (WHERE event_type = 'search') as searches_performed,
    COUNT(DISTINCT session_id) as sessions_count,
    EXTRACT(EPOCH FROM (MAX(occurred_at) - MIN(occurred_at)))::INTEGER as total_time_seconds,
    CASE 
      WHEN COUNT(DISTINCT session_id) > 0 THEN 
        (EXTRACT(EPOCH FROM (MAX(occurred_at) - MIN(occurred_at))) / COUNT(DISTINCT session_id))::INTEGER
      ELSE 0
    END as avg_session_duration_seconds
  FROM public.user_interactions
  WHERE DATE(occurred_at) = target_date::DATE
  GROUP BY user_id
  ON CONFLICT (user_id, date) 
  DO UPDATE SET
    events_viewed = EXCLUDED.events_viewed,
    events_clicked = EXCLUDED.events_clicked,
    events_interested = EXCLUDED.events_interested,
    ticket_links_clicked = EXCLUDED.ticket_links_clicked,
    reviews_written = EXCLUDED.reviews_written,
    reviews_viewed = EXCLUDED.reviews_viewed,
    reviews_liked = EXCLUDED.reviews_liked,
    searches_performed = EXCLUDED.searches_performed,
    sessions_count = EXCLUDED.sessions_count,
    total_time_seconds = EXCLUDED.total_time_seconds,
    avg_session_duration_seconds = EXCLUDED.avg_session_duration_seconds,
    updated_at = NOW();

  -- Aggregate event daily metrics (including event creation tracking)
  INSERT INTO public.analytics_event_daily (
    event_id, 
    date, 
    impressions, 
    unique_viewers, 
    clicks,
    click_through_rate,
    interested_count,
    ticket_link_clicks,
    ticket_conversion_rate,
    likes_count,
    comments_count
  )
  SELECT 
    entity_id::UUID,
    target_date::DATE,
    COUNT(*) FILTER (WHERE event_type = 'view') as impressions,
    COUNT(DISTINCT user_id) FILTER (WHERE event_type IN ('view', 'click')) as unique_viewers,
    COUNT(*) FILTER (WHERE event_type = 'click') as clicks,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE event_type = 'click') / 
      NULLIF(COUNT(*) FILTER (WHERE event_type = 'view'), 0),
      2
    ) as click_through_rate,
    COUNT(*) FILTER (WHERE event_type = 'interest') as interested_count,
    COUNT(*) FILTER (WHERE event_type = 'click' AND entity_type = 'ticket_link' AND metadata->>'event_id' = entity_id) as ticket_link_clicks,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE event_type = 'click' AND entity_type = 'ticket_link') / 
      NULLIF(COUNT(*) FILTER (WHERE event_type = 'click' AND entity_type = 'event'), 0),
      2
    ) as ticket_conversion_rate,
    COUNT(*) FILTER (WHERE event_type = 'like') as likes_count,
    COUNT(*) FILTER (WHERE event_type = 'comment') as comments_count
  FROM public.user_interactions
  WHERE DATE(occurred_at) = target_date::DATE
  AND entity_type = 'event'
  GROUP BY entity_id
  ON CONFLICT (event_id, date)
  DO UPDATE SET
    impressions = EXCLUDED.impressions,
    unique_viewers = EXCLUDED.unique_viewers,
    clicks = EXCLUDED.clicks,
    click_through_rate = EXCLUDED.click_through_rate,
    interested_count = EXCLUDED.interested_count,
    ticket_link_clicks = EXCLUDED.ticket_link_clicks,
    ticket_conversion_rate = EXCLUDED.ticket_conversion_rate,
    likes_count = EXCLUDED.likes_count,
    comments_count = EXCLUDED.comments_count,
    updated_at = NOW();

  -- Aggregate artist daily metrics
  INSERT INTO public.analytics_artist_daily (
    artist_name,
    date,
    profile_views,
    profile_clicks,
    new_followers,
    event_impressions,
    event_clicks,
    ticket_clicks
  )
  SELECT 
    entity_id as artist_name,
    target_date::DATE,
    COUNT(*) FILTER (WHERE event_type = 'view') as profile_views,
    COUNT(*) FILTER (WHERE event_type = 'click') as profile_clicks,
    COUNT(*) FILTER (WHERE event_type = 'follow') as new_followers,
    -- Event impressions for this artist (from metadata)
    (SELECT COUNT(*) FROM user_interactions 
     WHERE DATE(occurred_at) = target_date::DATE 
     AND entity_type = 'event'
     AND metadata->>'artist_name' = entity_id) as event_impressions,
    (SELECT COUNT(*) FROM user_interactions 
     WHERE DATE(occurred_at) = target_date::DATE 
     AND entity_type = 'event'
     AND event_type = 'click'
     AND metadata->>'artist_name' = entity_id) as event_clicks,
    (SELECT COUNT(*) FROM user_interactions 
     WHERE DATE(occurred_at) = target_date::DATE 
     AND entity_type = 'ticket_link'
     AND metadata->>'artist_name' = entity_id) as ticket_clicks
  FROM public.user_interactions
  WHERE DATE(occurred_at) = target_date::DATE
  AND entity_type = 'artist'
  GROUP BY entity_id
  ON CONFLICT (artist_name, date)
  DO UPDATE SET
    profile_views = EXCLUDED.profile_views,
    profile_clicks = EXCLUDED.profile_clicks,
    new_followers = EXCLUDED.new_followers,
    event_impressions = EXCLUDED.event_impressions,
    event_clicks = EXCLUDED.event_clicks,
    ticket_clicks = EXCLUDED.ticket_clicks,
    updated_at = NOW();

  -- Update total_followers for artists
  UPDATE public.analytics_artist_daily aad
  SET total_followers = (
    SELECT COUNT(*) 
    FROM public.artist_follows af
    JOIN public.artists a ON af.artist_id = a.id
    WHERE a.name = aad.artist_name
    AND af.created_at <= (target_date::DATE + INTERVAL '1 day')
  )
  WHERE aad.date = target_date::DATE;

  -- Aggregate venue daily metrics
  INSERT INTO public.analytics_venue_daily (
    venue_name,
    venue_city,
    venue_state,
    date,
    profile_views,
    profile_clicks,
    new_followers,
    event_impressions,
    event_clicks,
    ticket_clicks
  )
  SELECT 
    entity_id as venue_name,
    metadata->>'venue_city' as venue_city,
    metadata->>'venue_state' as venue_state,
    target_date::DATE,
    COUNT(*) FILTER (WHERE event_type = 'view') as profile_views,
    COUNT(*) FILTER (WHERE event_type = 'click') as profile_clicks,
    COUNT(*) FILTER (WHERE event_type = 'follow') as new_followers,
    -- Event impressions for this venue
    (SELECT COUNT(*) FROM user_interactions 
     WHERE DATE(occurred_at) = target_date::DATE 
     AND entity_type = 'event'
     AND metadata->>'venue_name' = entity_id) as event_impressions,
    (SELECT COUNT(*) FROM user_interactions 
     WHERE DATE(occurred_at) = target_date::DATE 
     AND entity_type = 'event'
     AND event_type = 'click'
     AND metadata->>'venue_name' = entity_id) as event_clicks,
    (SELECT COUNT(*) FROM user_interactions 
     WHERE DATE(occurred_at) = target_date::DATE 
     AND entity_type = 'ticket_link'
     AND metadata->>'venue_name' = entity_id) as ticket_clicks
  FROM public.user_interactions
  WHERE DATE(occurred_at) = target_date::DATE
  AND entity_type = 'venue'
  GROUP BY entity_id, metadata->>'venue_city', metadata->>'venue_state'
  ON CONFLICT (venue_name, venue_city, venue_state, date)
  DO UPDATE SET
    profile_views = EXCLUDED.profile_views,
    profile_clicks = EXCLUDED.profile_clicks,
    new_followers = EXCLUDED.new_followers,
    event_impressions = EXCLUDED.event_impressions,
    event_clicks = EXCLUDED.event_clicks,
    ticket_clicks = EXCLUDED.ticket_clicks,
    updated_at = NOW();

  -- Log completion
  RAISE NOTICE 'Daily analytics aggregated for %', target_date;
END;
$$;

-- Step 2: Create a function to trigger analytics aggregation after event creation
CREATE OR REPLACE FUNCTION public.trigger_event_creation_analytics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Trigger analytics aggregation for the current date when a new event is created
  PERFORM public.aggregate_daily_analytics(CURRENT_DATE);
  
  RETURN NEW;
END;
$$;

-- Step 3: Create trigger for event creation analytics
DROP TRIGGER IF EXISTS event_creation_analytics_trigger ON public.jambase_events;
CREATE TRIGGER event_creation_analytics_trigger
  AFTER INSERT ON public.jambase_events
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_event_creation_analytics();

-- Step 4: Create a function to backfill analytics for existing events
CREATE OR REPLACE FUNCTION public.backfill_event_creation_analytics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  event_record RECORD;
  event_date DATE;
BEGIN
  -- Only admins can backfill
  IF NOT public.user_has_permission(auth.uid(), 'view_all_analytics') THEN
    RAISE EXCEPTION 'Only admins can backfill event creation analytics';
  END IF;

  -- Process each event and create analytics entries
  FOR event_record IN 
    SELECT id, created_at, created_by_user_id, owned_by_account_type
    FROM public.jambase_events 
    WHERE created_at IS NOT NULL
  LOOP
    event_date := DATE(event_record.created_at);
    
    -- Insert event creation interaction if it doesn't exist
    INSERT INTO public.user_interactions (
      user_id,
      event_type,
      entity_type,
      entity_id,
      metadata,
      occurred_at
    )
    SELECT 
      event_record.created_by_user_id,
      'form_submit',
      'event_creation',
      event_record.id,
      jsonb_build_object(
        'event_creation', true,
        'owned_by_account_type', event_record.owned_by_account_type,
        'backfilled', true
      ),
      event_record.created_at
    WHERE NOT EXISTS (
      SELECT 1 FROM public.user_interactions 
      WHERE user_id = event_record.created_by_user_id 
      AND event_type = 'form_submit' 
      AND entity_type = 'event_creation' 
      AND entity_id = event_record.id
    );
    
    -- Aggregate analytics for this event's creation date
    PERFORM public.aggregate_daily_analytics(event_date);
  END LOOP;
  
  RAISE NOTICE 'Event creation analytics backfilled successfully';
END;
$$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.backfill_event_creation_analytics() TO authenticated;

-- Step 5: Add comments for documentation
COMMENT ON FUNCTION public.trigger_event_creation_analytics IS 'Triggers analytics aggregation when events are created';
COMMENT ON FUNCTION public.backfill_event_creation_analytics IS 'Backfills analytics for existing events. Admin only.';
