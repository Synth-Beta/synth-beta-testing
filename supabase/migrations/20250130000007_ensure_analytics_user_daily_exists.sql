-- Ensure analytics_user_daily table exists
-- This migration ensures the analytics_user_daily table exists and has proper structure

-- Step 1: Create analytics_user_daily table if it doesn't exist
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

-- Step 2: Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_analytics_user_daily_user_date ON public.analytics_user_daily(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_user_daily_date ON public.analytics_user_daily(date DESC);

-- Step 3: Enable RLS if not already enabled
ALTER TABLE public.analytics_user_daily ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policies if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'analytics_user_daily'
    AND policyname = 'Users can view their own analytics'
  ) THEN
    CREATE POLICY "Users can view their own analytics"
    ON public.analytics_user_daily FOR SELECT
    USING (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'analytics_user_daily'
    AND policyname = 'Users can insert their own analytics'
  ) THEN
    CREATE POLICY "Users can insert their own analytics"
    ON public.analytics_user_daily FOR INSERT
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'analytics_user_daily'
    AND policyname = 'Users can update their own analytics'
  ) THEN
    CREATE POLICY "Users can update their own analytics"
    ON public.analytics_user_daily FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'analytics_user_daily'
    AND policyname = 'Admins can view all analytics'
  ) THEN
    CREATE POLICY "Admins can view all analytics"
    ON public.analytics_user_daily FOR SELECT
    USING (
      EXISTS (
        SELECT 1 FROM public.profiles
        WHERE user_id = auth.uid()
        AND account_type = 'admin'
      )
    );
  END IF;
END $$;

-- Step 5: Add helpful comments
COMMENT ON TABLE public.analytics_user_daily IS 'Daily analytics aggregation table for user engagement metrics';
COMMENT ON POLICY "Users can view their own analytics" ON public.analytics_user_daily IS 'Users can view their own daily analytics data';
COMMENT ON POLICY "Users can insert their own analytics" ON public.analytics_user_daily IS 'Users can insert their own daily analytics data';
COMMENT ON POLICY "Users can update their own analytics" ON public.analytics_user_daily IS 'Users can update their own daily analytics data';
COMMENT ON POLICY "Admins can view all analytics" ON public.analytics_user_daily IS 'Admins can view all users analytics data';
