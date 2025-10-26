-- Fix analytics aggregation to handle missing events gracefully
-- This migration fixes the foreign key constraint violation in analytics_event_daily

-- Step 1: Update the aggregate_daily_analytics function to handle missing events
CREATE OR REPLACE FUNCTION public.aggregate_daily_analytics(target_date DATE DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

  -- Aggregate event daily metrics - ONLY for events that exist in jambase_events
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
    ui.entity_id::UUID,
    target_date::DATE,
    COUNT(*) FILTER (WHERE ui.event_type = 'view') as impressions,
    COUNT(DISTINCT ui.user_id) FILTER (WHERE ui.event_type IN ('view', 'click')) as unique_viewers,
    COUNT(*) FILTER (WHERE ui.event_type = 'click') as clicks,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE ui.event_type = 'click') / 
      NULLIF(COUNT(*) FILTER (WHERE ui.event_type = 'view'), 0),
      2
    ) as click_through_rate,
    COUNT(*) FILTER (WHERE ui.event_type = 'interest') as interested_count,
    COUNT(*) FILTER (WHERE ui.event_type = 'click' AND ui.entity_type = 'ticket_link' AND ui.metadata->>'event_id' = ui.entity_id) as ticket_link_clicks,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE ui.event_type = 'click' AND ui.entity_type = 'ticket_link') / 
      NULLIF(COUNT(*) FILTER (WHERE ui.event_type = 'click' AND ui.entity_type = 'event'), 0),
      2
    ) as ticket_conversion_rate,
    COUNT(*) FILTER (WHERE ui.event_type = 'like') as likes_count,
    COUNT(*) FILTER (WHERE ui.event_type = 'comment') as comments_count
  FROM public.user_interactions ui
  INNER JOIN public.jambase_events je ON je.id = ui.entity_id::UUID
  WHERE DATE(ui.occurred_at) = target_date::DATE
    AND ui.entity_type = 'event'
    AND ui.entity_id ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' -- Valid UUID format
  GROUP BY ui.entity_id::UUID
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
    artist_city,
    artist_state,
    date,
    profile_views,
    profile_clicks,
    new_followers,
    total_followers,
    unfollows,
    events_hosted,
    event_impressions,
    event_clicks,
    ticket_clicks,
    total_attendance,
    capacity_utilization,
    reviews_received,
    avg_artist_rating,
    visitor_demographics,
    visitor_locations
  )
  SELECT 
    ui.metadata->>'name' as artist_name,
    ui.metadata->>'city' as artist_city,
    ui.metadata->>'state' as artist_state,
    target_date::DATE,
    COUNT(*) FILTER (WHERE ui.event_type = 'view' AND ui.entity_type = 'artist') as profile_views,
    COUNT(*) FILTER (WHERE ui.event_type = 'click' AND ui.entity_type = 'artist') as profile_clicks,
    COUNT(*) FILTER (WHERE ui.event_type = 'follow' AND ui.entity_type = 'artist') as new_followers,
    0 as total_followers, -- This would need to be calculated separately
    COUNT(*) FILTER (WHERE ui.event_type = 'unfollow' AND ui.entity_type = 'artist') as unfollows,
    0 as events_hosted, -- This would need to be calculated separately
    COUNT(*) FILTER (WHERE ui.event_type = 'view' AND ui.entity_type = 'event' AND ui.metadata->>'artist_id' = ui.entity_id) as event_impressions,
    COUNT(*) FILTER (WHERE ui.event_type = 'click' AND ui.entity_type = 'event' AND ui.metadata->>'artist_id' = ui.entity_id) as event_clicks,
    COUNT(*) FILTER (WHERE ui.event_type = 'click' AND ui.entity_type = 'ticket_link' AND ui.metadata->>'artist_id' = ui.entity_id) as ticket_clicks,
    0 as total_attendance, -- This would need to be calculated separately
    0.0 as capacity_utilization, -- This would need to be calculated separately
    COUNT(*) FILTER (WHERE ui.event_type = 'review' AND ui.entity_type = 'artist') as reviews_received,
    ROUND(AVG((ui.metadata->>'rating')::DECIMAL), 2) FILTER (WHERE ui.event_type = 'review' AND ui.entity_type = 'artist') as avg_artist_rating,
    '{}' as visitor_demographics,
    '{}' as visitor_locations
  FROM public.user_interactions ui
  WHERE DATE(ui.occurred_at) = target_date::DATE
    AND ui.entity_type = 'artist'
  GROUP BY ui.metadata->>'name', ui.metadata->>'city', ui.metadata->>'state'
  ON CONFLICT (artist_name, artist_city, artist_state, date) 
  DO UPDATE SET
    profile_views = EXCLUDED.profile_views,
    profile_clicks = EXCLUDED.profile_clicks,
    new_followers = EXCLUDED.new_followers,
    unfollows = EXCLUDED.unfollows,
    event_impressions = EXCLUDED.event_impressions,
    event_clicks = EXCLUDED.event_clicks,
    ticket_clicks = EXCLUDED.ticket_clicks,
    reviews_received = EXCLUDED.reviews_received,
    avg_artist_rating = EXCLUDED.avg_artist_rating,
    updated_at = NOW();

  -- Aggregate venue daily metrics
  INSERT INTO public.analytics_venue_daily (
    venue_name,
    venue_city,
    venue_state,
    date,
    profile_views,
    profile_clicks,
    new_followers,
    total_followers,
    unfollows,
    events_hosted,
    event_impressions,
    event_clicks,
    ticket_clicks,
    total_attendance,
    capacity_utilization,
    reviews_received,
    avg_venue_rating,
    visitor_demographics,
    visitor_locations
  )
  SELECT 
    ui.metadata->>'name' as venue_name,
    ui.metadata->>'city' as venue_city,
    ui.metadata->>'state' as venue_state,
    target_date::DATE,
    COUNT(*) FILTER (WHERE ui.event_type = 'view' AND ui.entity_type = 'venue') as profile_views,
    COUNT(*) FILTER (WHERE ui.event_type = 'click' AND ui.entity_type = 'venue') as profile_clicks,
    COUNT(*) FILTER (WHERE ui.event_type = 'follow' AND ui.entity_type = 'venue') as new_followers,
    0 as total_followers, -- This would need to be calculated separately
    COUNT(*) FILTER (WHERE ui.event_type = 'unfollow' AND ui.entity_type = 'venue') as unfollows,
    0 as events_hosted, -- This would need to be calculated separately
    COUNT(*) FILTER (WHERE ui.event_type = 'view' AND ui.entity_type = 'event' AND ui.metadata->>'venue_id' = ui.entity_id) as event_impressions,
    COUNT(*) FILTER (WHERE ui.event_type = 'click' AND ui.entity_type = 'event' AND ui.metadata->>'venue_id' = ui.entity_id) as event_clicks,
    COUNT(*) FILTER (WHERE ui.event_type = 'click' AND ui.entity_type = 'ticket_link' AND ui.metadata->>'venue_id' = ui.entity_id) as ticket_clicks,
    0 as total_attendance, -- This would need to be calculated separately
    0.0 as capacity_utilization, -- This would need to be calculated separately
    COUNT(*) FILTER (WHERE ui.event_type = 'review' AND ui.entity_type = 'venue') as reviews_received,
    ROUND(AVG((ui.metadata->>'rating')::DECIMAL), 2) FILTER (WHERE ui.event_type = 'review' AND ui.entity_type = 'venue') as avg_venue_rating,
    '{}' as visitor_demographics,
    '{}' as visitor_locations
  FROM public.user_interactions ui
  WHERE DATE(ui.occurred_at) = target_date::DATE
    AND ui.entity_type = 'venue'
  GROUP BY ui.metadata->>'name', ui.metadata->>'city', ui.metadata->>'state'
  ON CONFLICT (venue_name, venue_city, venue_state, date) 
  DO UPDATE SET
    profile_views = EXCLUDED.profile_views,
    profile_clicks = EXCLUDED.profile_clicks,
    new_followers = EXCLUDED.new_followers,
    unfollows = EXCLUDED.unfollows,
    event_impressions = EXCLUDED.event_impressions,
    event_clicks = EXCLUDED.event_clicks,
    ticket_clicks = EXCLUDED.ticket_clicks,
    reviews_received = EXCLUDED.reviews_received,
    avg_venue_rating = EXCLUDED.avg_venue_rating,
    updated_at = NOW();
END;
$$;

-- Step 2: Add helpful comment
COMMENT ON FUNCTION public.aggregate_daily_analytics IS 'Aggregates raw user_interactions data into daily analytics tables. Only processes events that exist in jambase_events to prevent foreign key violations.';
