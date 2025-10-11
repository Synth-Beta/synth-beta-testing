-- ============================================
-- ANALYTICS AGGREGATION TABLES
-- ============================================
-- This migration creates daily analytics tables for efficient querying
-- Raw data stays in user_interactions, aggregated data goes here

-- Step 1: Create analytics_user_daily table
CREATE TABLE IF NOT EXISTS public.analytics_user_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Engagement metrics
  events_viewed INTEGER DEFAULT 0,
  events_clicked INTEGER DEFAULT 0,
  events_interested INTEGER DEFAULT 0,
  events_attended INTEGER DEFAULT 0,
  ticket_links_clicked INTEGER DEFAULT 0,
  
  -- Review metrics
  reviews_written INTEGER DEFAULT 0,
  reviews_viewed INTEGER DEFAULT 0,
  reviews_liked INTEGER DEFAULT 0,
  reviews_commented INTEGER DEFAULT 0,
  
  -- Social metrics
  artists_followed INTEGER DEFAULT 0,
  venues_followed INTEGER DEFAULT 0,
  friends_added INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  shares_sent INTEGER DEFAULT 0,
  
  -- Search metrics
  searches_performed INTEGER DEFAULT 0,
  
  -- Session metrics
  sessions_count INTEGER DEFAULT 0,
  total_time_seconds INTEGER DEFAULT 0,
  avg_session_duration_seconds INTEGER,
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(user_id, date)
);

-- Step 2: Create analytics_event_daily table
CREATE TABLE IF NOT EXISTS public.analytics_event_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.jambase_events(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  
  -- Visibility metrics
  impressions INTEGER DEFAULT 0,
  unique_viewers INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  click_through_rate DECIMAL(5,2),
  
  -- Engagement metrics
  interested_count INTEGER DEFAULT 0,
  attended_count INTEGER DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2),
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  
  -- Conversion metrics
  ticket_link_clicks INTEGER DEFAULT 0,
  ticket_conversion_rate DECIMAL(5,2),
  
  -- Demographics (aggregated from metadata)
  viewer_demographics JSONB DEFAULT '{}',
  viewer_locations JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(event_id, date)
);

-- Step 3: Create analytics_artist_daily table
CREATE TABLE IF NOT EXISTS public.analytics_artist_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_name TEXT NOT NULL, -- Using name instead of UUID for flexibility
  date DATE NOT NULL,
  
  -- Profile metrics
  profile_views INTEGER DEFAULT 0,
  profile_clicks INTEGER DEFAULT 0,
  new_followers INTEGER DEFAULT 0,
  total_followers INTEGER DEFAULT 0,
  unfollows INTEGER DEFAULT 0,
  
  -- Event metrics
  active_events INTEGER DEFAULT 0,
  event_impressions INTEGER DEFAULT 0,
  event_clicks INTEGER DEFAULT 0,
  ticket_clicks INTEGER DEFAULT 0,
  
  -- Review metrics
  reviews_received INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2),
  total_review_likes INTEGER DEFAULT 0,
  
  -- Engagement metrics
  total_engagement INTEGER DEFAULT 0, -- likes + comments + shares
  
  -- Fan demographics
  fan_demographics JSONB DEFAULT '{}',
  fan_locations JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(artist_name, date)
);

-- Step 4: Create analytics_venue_daily table
CREATE TABLE IF NOT EXISTS public.analytics_venue_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  venue_name TEXT NOT NULL,
  venue_city TEXT,
  venue_state TEXT,
  date DATE NOT NULL,
  
  -- Profile metrics
  profile_views INTEGER DEFAULT 0,
  profile_clicks INTEGER DEFAULT 0,
  new_followers INTEGER DEFAULT 0,
  total_followers INTEGER DEFAULT 0,
  unfollows INTEGER DEFAULT 0,
  
  -- Event metrics
  events_hosted INTEGER DEFAULT 0,
  event_impressions INTEGER DEFAULT 0,
  event_clicks INTEGER DEFAULT 0,
  ticket_clicks INTEGER DEFAULT 0,
  total_attendance INTEGER DEFAULT 0,
  capacity_utilization DECIMAL(5,2),
  
  -- Review metrics
  reviews_received INTEGER DEFAULT 0,
  avg_venue_rating DECIMAL(3,2),
  
  -- Visitor demographics
  visitor_demographics JSONB DEFAULT '{}',
  visitor_locations JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(venue_name, venue_city, venue_state, date)
);

-- Step 5: Create analytics_campaign_daily (for promoters and ad accounts)
CREATE TABLE IF NOT EXISTS public.analytics_campaign_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID NOT NULL, -- References campaigns table (to be created)
  date DATE NOT NULL,
  
  -- Visibility metrics
  impressions INTEGER DEFAULT 0,
  unique_viewers INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  click_through_rate DECIMAL(5,2),
  
  -- Financial metrics
  spend DECIMAL(10,2) DEFAULT 0,
  cost_per_click DECIMAL(8,2),
  cost_per_impression DECIMAL(8,4),
  
  -- Conversion metrics
  conversions INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2),
  cost_per_conversion DECIMAL(10,2),
  revenue_attributed DECIMAL(10,2),
  roas DECIMAL(6,2), -- Return on ad spend
  
  -- Audience metrics
  audience_demographics JSONB DEFAULT '{}',
  audience_locations JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(campaign_id, date)
);

-- Step 6: Create indexes for all analytics tables
CREATE INDEX IF NOT EXISTS idx_analytics_user_daily_user_date ON public.analytics_user_daily(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_user_daily_date ON public.analytics_user_daily(date DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_event_daily_event_date ON public.analytics_event_daily(event_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_event_daily_date ON public.analytics_event_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_event_daily_impressions ON public.analytics_event_daily(impressions DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_event_daily_ticket_clicks ON public.analytics_event_daily(ticket_link_clicks DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_artist_daily_artist_date ON public.analytics_artist_daily(artist_name, date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_artist_daily_date ON public.analytics_artist_daily(date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_artist_daily_followers ON public.analytics_artist_daily(total_followers DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_venue_daily_venue_date ON public.analytics_venue_daily(venue_name, date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_venue_daily_date ON public.analytics_venue_daily(date DESC);

CREATE INDEX IF NOT EXISTS idx_analytics_campaign_daily_campaign_date ON public.analytics_campaign_daily(campaign_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_campaign_daily_date ON public.analytics_campaign_daily(date DESC);

-- Step 7: Enable RLS on all analytics tables
ALTER TABLE public.analytics_user_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_event_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_artist_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_venue_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_campaign_daily ENABLE ROW LEVEL SECURITY;

-- Step 8: RLS Policies for analytics_user_daily
DROP POLICY IF EXISTS "Users can view their own analytics" ON public.analytics_user_daily;
CREATE POLICY "Users can view their own analytics"
ON public.analytics_user_daily FOR SELECT
USING (
  auth.uid() = user_id OR 
  public.user_has_permission(auth.uid(), 'view_all_analytics')
);

-- Step 9: RLS Policies for analytics_event_daily
DROP POLICY IF EXISTS "Event analytics viewable by creators, businesses, and admins" ON public.analytics_event_daily;
CREATE POLICY "Event analytics viewable by creators, businesses, and admins"
ON public.analytics_event_daily FOR SELECT
USING (
  -- Admins can see all
  public.user_has_permission(auth.uid(), 'view_all_analytics') OR
  -- Creators can see their event analytics
  public.user_has_permission(auth.uid(), 'view_creator_analytics') OR
  -- Businesses can see their event analytics
  public.user_has_permission(auth.uid(), 'view_business_analytics')
);

-- Step 10: RLS Policies for analytics_artist_daily
DROP POLICY IF EXISTS "Artist analytics viewable by creators and admins" ON public.analytics_artist_daily;
CREATE POLICY "Artist analytics viewable by creators and admins"
ON public.analytics_artist_daily FOR SELECT
USING (
  -- Admins can see all
  public.user_has_permission(auth.uid(), 'view_all_analytics') OR
  -- Creators can see their own artist analytics
  (
    public.user_has_permission(auth.uid(), 'view_creator_analytics') AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.account_type = 'creator'
      -- Match by business_info artist_name or profile name, or managed roster
      AND (
        p.business_info->>'artist_name' = analytics_artist_daily.artist_name OR 
        p.name = analytics_artist_daily.artist_name OR
        analytics_artist_daily.artist_name = ANY(
          ARRAY(SELECT jsonb_array_elements_text(p.business_info->'managed_artists'))
        )
      )
    )
  )
);

-- Step 11: RLS Policies for analytics_venue_daily
DROP POLICY IF EXISTS "Venue analytics viewable by businesses and admins" ON public.analytics_venue_daily;
CREATE POLICY "Venue analytics viewable by businesses and admins"
ON public.analytics_venue_daily FOR SELECT
USING (
  -- Admins can see all
  public.user_has_permission(auth.uid(), 'view_all_analytics') OR
  -- Businesses can see their own venue analytics
  (
    public.user_has_permission(auth.uid(), 'view_business_analytics') AND
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.user_id = auth.uid()
      AND p.account_type = 'business'
      -- Match by business_info venue_name or managed venues array
      AND (
        p.business_info->>'venue_name' = analytics_venue_daily.venue_name OR 
        p.name = analytics_venue_daily.venue_name OR
        analytics_venue_daily.venue_name = ANY(
          ARRAY(SELECT jsonb_array_elements_text(p.business_info->'managed_venues'))
        )
      )
    )
  )
);

-- Step 12: RLS Policies for analytics_campaign_daily
DROP POLICY IF EXISTS "Campaign analytics viewable by businesses and admins" ON public.analytics_campaign_daily;
CREATE POLICY "Campaign analytics viewable by businesses and admins"
ON public.analytics_campaign_daily FOR SELECT
USING (
  -- Admins can see all
  public.user_has_permission(auth.uid(), 'view_all_analytics') OR
  -- Businesses (promoters/advertisers) can see their campaigns
  public.user_has_permission(auth.uid(), 'view_business_analytics')
);

-- Step 13: Create aggregation function for daily analytics
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

  -- Aggregate event daily metrics
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

-- Grant execute to service role (for cron job)
GRANT EXECUTE ON FUNCTION public.aggregate_daily_analytics(DATE) TO service_role;
GRANT EXECUTE ON FUNCTION public.aggregate_daily_analytics(DATE) TO authenticated;

-- Step 14: Create helper function to backfill historical analytics
CREATE OR REPLACE FUNCTION public.backfill_analytics(start_date DATE, end_date DATE DEFAULT CURRENT_DATE)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_date DATE;
BEGIN
  -- Only admins can backfill
  IF NOT public.user_has_permission(auth.uid(), 'view_all_analytics') THEN
    RAISE EXCEPTION 'Only admins can backfill analytics';
  END IF;

  current_date := start_date;
  
  WHILE current_date <= end_date LOOP
    PERFORM public.aggregate_daily_analytics(current_date);
    current_date := current_date + INTERVAL '1 day';
  END LOOP;
  
  RAISE NOTICE 'Backfill complete from % to %', start_date, end_date;
END;
$$;

GRANT EXECUTE ON FUNCTION public.backfill_analytics(DATE, DATE) TO authenticated;

-- Step 15: Add comments for documentation
COMMENT ON TABLE public.analytics_user_daily IS 'Daily aggregated user engagement metrics';
COMMENT ON TABLE public.analytics_event_daily IS 'Daily aggregated event performance metrics';
COMMENT ON TABLE public.analytics_artist_daily IS 'Daily aggregated artist performance metrics';
COMMENT ON TABLE public.analytics_venue_daily IS 'Daily aggregated venue performance metrics';
COMMENT ON TABLE public.analytics_campaign_daily IS 'Daily aggregated campaign performance metrics';

COMMENT ON FUNCTION public.aggregate_daily_analytics IS 'Aggregates raw user_interactions data into daily analytics tables. Run nightly via cron.';
COMMENT ON FUNCTION public.backfill_analytics IS 'Backfills analytics for a date range. Admin only.';

-- Step 16: Create materialized view for real-time analytics (refreshed hourly)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.analytics_realtime_summary AS
SELECT 
  CURRENT_DATE as date,
  COUNT(DISTINCT user_id) as active_users,
  COUNT(*) as total_interactions,
  COUNT(*) FILTER (WHERE event_type = 'view' AND entity_type = 'event') as event_views,
  COUNT(*) FILTER (WHERE event_type = 'click' AND entity_type = 'event') as event_clicks,
  COUNT(*) FILTER (WHERE event_type = 'click' AND entity_type = 'ticket_link') as ticket_clicks,
  COUNT(*) FILTER (WHERE event_type = 'search') as searches,
  COUNT(*) FILTER (WHERE event_type = 'review') as reviews_created,
  COUNT(DISTINCT session_id) as sessions,
  MAX(occurred_at) as last_interaction_at
FROM public.user_interactions
WHERE DATE(occurred_at) = CURRENT_DATE;

-- Create index on materialized view
CREATE UNIQUE INDEX IF NOT EXISTS idx_analytics_realtime_summary_date 
ON public.analytics_realtime_summary(date);

-- Grant access
GRANT SELECT ON public.analytics_realtime_summary TO authenticated;

-- Step 17: Create function to refresh real-time view
CREATE OR REPLACE FUNCTION public.refresh_realtime_analytics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.analytics_realtime_summary;
END;
$$;

GRANT EXECUTE ON FUNCTION public.refresh_realtime_analytics() TO service_role;

-- Verification query
SELECT 
  'Analytics tables created successfully' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name LIKE 'analytics_%') as analytics_tables,
  (SELECT COUNT(*) FROM public.account_permissions) as permissions_count;

