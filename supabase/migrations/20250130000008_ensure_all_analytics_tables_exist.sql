-- Ensure all analytics tables exist
-- This migration ensures all analytics tables exist and have proper structure

-- Step 1: Create analytics_event_daily table if it doesn't exist
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

-- Step 2: Create analytics_artist_daily table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.analytics_artist_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  artist_name TEXT NOT NULL,
  artist_city TEXT,
  artist_state TEXT,
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
  avg_artist_rating DECIMAL(3,2),
  
  -- Visitor demographics
  visitor_demographics JSONB DEFAULT '{}',
  visitor_locations JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(artist_name, artist_city, artist_state, date)
);

-- Step 3: Create analytics_venue_daily table if it doesn't exist
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

-- Step 4: Create analytics_campaign_daily table if it doesn't exist
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

-- Step 5: Create indexes for all analytics tables
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

-- Step 6: Enable RLS on all analytics tables
ALTER TABLE public.analytics_event_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_artist_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_venue_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_campaign_daily ENABLE ROW LEVEL SECURITY;

-- Step 7: Create RLS policies for analytics_event_daily
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'analytics_event_daily'
    AND policyname = 'Authenticated users can view event analytics'
  ) THEN
    CREATE POLICY "Authenticated users can view event analytics"
    ON public.analytics_event_daily FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'analytics_event_daily'
    AND policyname = 'System can insert event analytics'
  ) THEN
    CREATE POLICY "System can insert event analytics"
    ON public.analytics_event_daily FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'analytics_event_daily'
    AND policyname = 'System can update event analytics'
  ) THEN
    CREATE POLICY "System can update event analytics"
    ON public.analytics_event_daily FOR UPDATE
    USING (true)
    WITH CHECK (true);
  END IF;
END $$;

-- Step 8: Create RLS policies for analytics_artist_daily
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'analytics_artist_daily'
    AND policyname = 'Authenticated users can view artist analytics'
  ) THEN
    CREATE POLICY "Authenticated users can view artist analytics"
    ON public.analytics_artist_daily FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'analytics_artist_daily'
    AND policyname = 'System can insert artist analytics'
  ) THEN
    CREATE POLICY "System can insert artist analytics"
    ON public.analytics_artist_daily FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;

-- Step 9: Create RLS policies for analytics_venue_daily
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'analytics_venue_daily'
    AND policyname = 'Authenticated users can view venue analytics'
  ) THEN
    CREATE POLICY "Authenticated users can view venue analytics"
    ON public.analytics_venue_daily FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'analytics_venue_daily'
    AND policyname = 'System can insert venue analytics'
  ) THEN
    CREATE POLICY "System can insert venue analytics"
    ON public.analytics_venue_daily FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;

-- Step 10: Create RLS policies for analytics_campaign_daily
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'analytics_campaign_daily'
    AND policyname = 'Authenticated users can view campaign analytics'
  ) THEN
    CREATE POLICY "Authenticated users can view campaign analytics"
    ON public.analytics_campaign_daily FOR SELECT
    USING (auth.role() = 'authenticated');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'analytics_campaign_daily'
    AND policyname = 'System can insert campaign analytics'
  ) THEN
    CREATE POLICY "System can insert campaign analytics"
    ON public.analytics_campaign_daily FOR INSERT
    WITH CHECK (true);
  END IF;
END $$;

-- Step 11: Add helpful comments
COMMENT ON TABLE public.analytics_event_daily IS 'Daily analytics aggregation table for event engagement metrics';
COMMENT ON TABLE public.analytics_artist_daily IS 'Daily analytics aggregation table for artist engagement metrics';
COMMENT ON TABLE public.analytics_venue_daily IS 'Daily analytics aggregation table for venue engagement metrics';
COMMENT ON TABLE public.analytics_campaign_daily IS 'Daily analytics aggregation table for campaign performance metrics';
