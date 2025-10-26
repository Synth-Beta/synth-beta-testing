-- Run all the remaining migrations to ensure everything is properly set up
-- This combines all the fixes we've created

-- 1. Fix analytics foreign key constraint violation
ALTER TABLE public.analytics_event_daily 
DROP CONSTRAINT IF EXISTS analytics_event_daily_event_id_fkey;

ALTER TABLE public.analytics_event_daily 
ADD CONSTRAINT analytics_event_daily_event_id_fkey 
FOREIGN KEY (event_id) 
REFERENCES public.jambase_events(id) 
ON DELETE CASCADE 
DEFERRABLE INITIALLY DEFERRED;

-- 2. Fix the set_user_interest function
DROP FUNCTION IF EXISTS public.set_user_interest(uuid, boolean);

CREATE OR REPLACE FUNCTION public.set_user_interest(event_id uuid, interested boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF interested THEN
    BEGIN
      INSERT INTO public.user_jambase_events (user_id, jambase_event_id)
      VALUES (auth.uid(), event_id);
    EXCEPTION WHEN unique_violation THEN
      NULL;
    END;
  ELSE
    DELETE FROM public.user_jambase_events
    WHERE user_id = auth.uid() AND jambase_event_id = event_id;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_interest(uuid, boolean) TO authenticated;

-- 3. Ensure all analytics tables exist
CREATE TABLE IF NOT EXISTS public.analytics_user_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  events_viewed INTEGER DEFAULT 0,
  events_clicked INTEGER DEFAULT 0,
  events_interested INTEGER DEFAULT 0,
  events_attended INTEGER DEFAULT 0,
  ticket_links_clicked INTEGER DEFAULT 0,
  reviews_written INTEGER DEFAULT 0,
  reviews_viewed INTEGER DEFAULT 0,
  reviews_liked INTEGER DEFAULT 0,
  reviews_commented INTEGER DEFAULT 0,
  artists_followed INTEGER DEFAULT 0,
  venues_followed INTEGER DEFAULT 0,
  friends_added INTEGER DEFAULT 0,
  messages_sent INTEGER DEFAULT 0,
  shares_sent INTEGER DEFAULT 0,
  searches_performed INTEGER DEFAULT 0,
  sessions_count INTEGER DEFAULT 0,
  total_time_seconds INTEGER DEFAULT 0,
  avg_session_duration_seconds INTEGER,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, date)
);

CREATE TABLE IF NOT EXISTS public.analytics_event_daily (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.jambase_events(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  unique_viewers INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  click_through_rate DECIMAL(5,2),
  interested_count INTEGER DEFAULT 0,
  attended_count INTEGER DEFAULT 0,
  review_count INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2),
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  shares_count INTEGER DEFAULT 0,
  ticket_link_clicks INTEGER DEFAULT 0,
  ticket_conversion_rate DECIMAL(5,2),
  viewer_demographics JSONB DEFAULT '{}',
  viewer_locations JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(event_id, date)
);

-- 4. Enable RLS and create policies for analytics tables
ALTER TABLE public.analytics_user_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_event_daily ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to prevent conflicts
DROP POLICY IF EXISTS "Users can view their own daily analytics" ON public.analytics_user_daily;
DROP POLICY IF EXISTS "Admins can view all daily user analytics" ON public.analytics_user_daily;
DROP POLICY IF EXISTS "System can insert user daily analytics" ON public.analytics_user_daily;
DROP POLICY IF EXISTS "System can update user daily analytics" ON public.analytics_user_daily;

DROP POLICY IF EXISTS "Events analytics are viewable by all authenticated users" ON public.analytics_event_daily;
DROP POLICY IF EXISTS "System can insert event daily analytics" ON public.analytics_event_daily;
DROP POLICY IF EXISTS "System can update event daily analytics" ON public.analytics_event_daily;

-- Create new policies
CREATE POLICY "Users can view their own daily analytics"
ON public.analytics_user_daily FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all daily user analytics"
ON public.analytics_user_daily FOR SELECT
USING (auth.role() = 'service_role' OR EXISTS (SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND account_type = 'admin'));

CREATE POLICY "System can insert user daily analytics"
ON public.analytics_user_daily FOR INSERT
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "System can update user daily analytics"
ON public.analytics_user_daily FOR UPDATE
USING (auth.role() = 'service_role');

CREATE POLICY "Events analytics are viewable by all authenticated users"
ON public.analytics_event_daily FOR SELECT
USING (auth.role() = 'authenticated');

CREATE POLICY "System can insert event daily analytics"
ON public.analytics_event_daily FOR INSERT
WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "System can update event daily analytics"
ON public.analytics_event_daily FOR UPDATE
USING (auth.role() = 'service_role');

-- 5. Add helpful comments
COMMENT ON CONSTRAINT analytics_event_daily_event_id_fkey ON public.analytics_event_daily 
IS 'Deferrable foreign key constraint to allow analytics insertion after event creation';

COMMENT ON FUNCTION public.set_user_interest IS 'Safely toggle user interest in events without ON CONFLICT clauses - handles unique violations gracefully';
