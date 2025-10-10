-- ============================================
-- VENUE FOLLOWS SYSTEM
-- ============================================
-- This migration creates a comprehensive venue following system
-- Users can follow venues by NAME (not ID) and receive notifications when venues have new events

-- Step 1: Create venue_follows table
CREATE TABLE IF NOT EXISTS public.venue_follows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  venue_name TEXT NOT NULL,
  venue_city TEXT,
  venue_state TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, venue_name, venue_city, venue_state)
);

-- Step 2: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_venue_follows_user_id ON public.venue_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_venue_follows_venue_name ON public.venue_follows(venue_name);
CREATE INDEX IF NOT EXISTS idx_venue_follows_venue_location ON public.venue_follows(venue_name, venue_city, venue_state);
CREATE INDEX IF NOT EXISTS idx_venue_follows_created_at ON public.venue_follows(created_at);

-- Step 3: Enable RLS on venue_follows
ALTER TABLE public.venue_follows ENABLE ROW LEVEL SECURITY;

-- Step 4: Create RLS policies
DROP POLICY IF EXISTS "Users can view their own followed venues" ON public.venue_follows;
DROP POLICY IF EXISTS "Users can follow venues" ON public.venue_follows;
DROP POLICY IF EXISTS "Users can unfollow venues" ON public.venue_follows;

CREATE POLICY "Users can view their own followed venues" 
ON public.venue_follows 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can follow venues" 
ON public.venue_follows 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unfollow venues" 
ON public.venue_follows 
FOR DELETE 
USING (auth.uid() = user_id);

-- Step 5: Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_venue_follows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_venue_follows_updated_at ON public.venue_follows;
CREATE TRIGGER trigger_update_venue_follows_updated_at
  BEFORE UPDATE ON public.venue_follows
  FOR EACH ROW
  EXECUTE FUNCTION update_venue_follows_updated_at();

-- Step 7: Create secure function to toggle venue follow (by name)
CREATE OR REPLACE FUNCTION public.set_venue_follow(
  p_venue_name TEXT, 
  p_venue_city TEXT, 
  p_venue_state TEXT, 
  p_following BOOLEAN
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_following THEN
    -- Insert row if following (presence-based)
    INSERT INTO public.venue_follows (user_id, venue_name, venue_city, venue_state)
    VALUES (auth.uid(), p_venue_name, p_venue_city, p_venue_state)
    ON CONFLICT (user_id, venue_name, venue_city, venue_state) 
    DO NOTHING;
  ELSE
    -- Delete row if not following
    DELETE FROM public.venue_follows
    WHERE user_id = auth.uid() 
      AND venue_name = p_venue_name
      AND (venue_city IS NULL OR venue_city = p_venue_city OR p_venue_city IS NULL)
      AND (venue_state IS NULL OR venue_state = p_venue_state OR p_venue_state IS NULL);
  END IF;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.set_venue_follow(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- Step 8: Create function to check if user follows a venue (by name)
CREATE OR REPLACE FUNCTION public.is_following_venue(
  p_venue_name TEXT, 
  p_venue_city TEXT, 
  p_venue_state TEXT, 
  p_user_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_following BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.venue_follows
    WHERE user_id = p_user_id
      AND venue_name = p_venue_name
      AND (venue_city IS NULL OR venue_city = p_venue_city OR p_venue_city IS NULL)
      AND (venue_state IS NULL OR venue_state = p_venue_state OR p_venue_state IS NULL)
  ) INTO v_following;
  
  RETURN v_following;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_following_venue(TEXT, TEXT, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_following_venue(TEXT, TEXT, TEXT, UUID) TO anon;

-- Step 9: Create function to get follower count for a venue (by name)
CREATE OR REPLACE FUNCTION public.get_venue_follower_count(
  p_venue_name TEXT, 
  p_venue_city TEXT, 
  p_venue_state TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.venue_follows
  WHERE venue_name = p_venue_name
    AND (venue_city IS NULL OR venue_city = p_venue_city OR p_venue_city IS NULL)
    AND (venue_state IS NULL OR venue_state = p_venue_state OR p_venue_state IS NULL);
  
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_venue_follower_count(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_venue_follower_count(TEXT, TEXT, TEXT) TO anon;

-- Step 10: Create view for venue follows with details
CREATE OR REPLACE VIEW public.venue_follows_with_details AS
SELECT 
  vf.id,
  vf.user_id,
  vf.venue_name,
  vf.venue_city,
  vf.venue_state,
  vf.created_at,
  p.name as user_name,
  p.avatar_url as user_avatar_url
FROM public.venue_follows vf
LEFT JOIN public.profiles p ON vf.user_id = p.user_id;

-- Grant permissions on the view
GRANT SELECT ON public.venue_follows_with_details TO authenticated;

-- Step 11: Update notifications table constraint to include venue notification types
DO $$
BEGIN
  -- Drop the existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'notifications' AND constraint_name LIKE '%notifications_type_check%'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  END IF;
  
  -- Add new constraint with venue notification types
  ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check 
  CHECK (type IN (
    'friend_request', 
    'friend_accepted', 
    'match', 
    'message',
    'review_liked',
    'review_commented',
    'comment_replied',
    'event_interest',
    'artist_followed',
    'artist_new_event',
    'artist_profile_updated',
    'venue_new_event',
    'venue_profile_updated'
  ));
END $$;

-- Step 12: Create function to notify followers when venue has new events
CREATE OR REPLACE FUNCTION notify_venue_followers_new_event()
RETURNS TRIGGER AS $$
DECLARE
  v_follower RECORD;
BEGIN
  -- Notify all followers of this venue (matching by name and location)
  FOR v_follower IN 
    SELECT user_id 
    FROM public.venue_follows 
    WHERE venue_name ILIKE NEW.venue_name
      AND (venue_city IS NULL OR venue_city ILIKE NEW.venue_city)
      AND (venue_state IS NULL OR venue_state ILIKE NEW.venue_state)
  LOOP
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data
    ) VALUES (
      v_follower.user_id,
      'venue_new_event',
      NEW.venue_name || ' has a new event!',
      NEW.title || ' on ' || to_char(NEW.event_date, 'Mon DD, YYYY'),
      jsonb_build_object(
        'venue_name', NEW.venue_name,
        'venue_city', NEW.venue_city,
        'venue_state', NEW.venue_state,
        'event_id', NEW.id,
        'event_title', NEW.title,
        'artist_name', NEW.artist_name,
        'event_date', NEW.event_date
      )
    );
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 13: Create trigger for new events at followed venues
DROP TRIGGER IF EXISTS trigger_notify_venue_followers_new_event ON public.jambase_events;
CREATE TRIGGER trigger_notify_venue_followers_new_event
  AFTER INSERT ON public.jambase_events
  FOR EACH ROW
  EXECUTE FUNCTION notify_venue_followers_new_event();

-- Step 14: Add comments for documentation
COMMENT ON TABLE public.venue_follows IS 'Tracks which users follow which venues (by name) for notifications';
COMMENT ON FUNCTION public.set_venue_follow IS 'Securely toggle venue follow status using name-based matching';
COMMENT ON FUNCTION public.is_following_venue IS 'Checks if a user is following a specific venue by name';
COMMENT ON FUNCTION public.get_venue_follower_count IS 'Returns the number of followers for a given venue by name';
COMMENT ON FUNCTION notify_venue_followers_new_event IS 'Notifies followers when a venue has a new event added';
COMMENT ON VIEW public.venue_follows_with_details IS 'Venue follows with denormalized user details for easier querying';

-- ============================================
-- VERIFICATION QUERIES
-- ============================================
-- Run these to verify the migration worked:

-- 1. Check table exists
-- SELECT COUNT(*) FROM public.venue_follows;

-- 2. Check policies exist
-- SELECT * FROM pg_policies WHERE tablename = 'venue_follows';

-- 3. Check functions exist
-- SELECT proname FROM pg_proc WHERE proname LIKE '%venue%follow%';

-- 4. Check view exists
-- SELECT * FROM public.venue_follows_with_details LIMIT 1;

-- ============================================
-- MIGRATION COMPLETE
-- ============================================

