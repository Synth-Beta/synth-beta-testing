-- ============================================
-- ARTIST FOLLOWS SYSTEM
-- ============================================
-- This migration creates a comprehensive artist following system
-- Users can follow artists and receive notifications when artist profiles change

-- Step 1: Rename user_artists to artist_follows for clarity (if needed)
-- Check if user_artists exists and rename it
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'user_artists') THEN
    ALTER TABLE public.user_artists RENAME TO artist_follows;
  END IF;
END $$;

-- Step 2: Ensure artist_follows table exists with proper structure
CREATE TABLE IF NOT EXISTS public.artist_follows (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, artist_id)
);

-- Add updated_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'artist_follows' AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.artist_follows ADD COLUMN updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now();
  END IF;
END $$;

-- Step 3: Enable RLS on artist_follows
ALTER TABLE public.artist_follows ENABLE ROW LEVEL SECURITY;

-- Step 4: Drop old policies if they exist and create new ones
DROP POLICY IF EXISTS "Users can view their own artists" ON public.artist_follows;
DROP POLICY IF EXISTS "Users can insert their own artists" ON public.artist_follows;
DROP POLICY IF EXISTS "Users can delete their own artists" ON public.artist_follows;

-- Create policies for artist_follows table
CREATE POLICY "Users can view their own followed artists" 
ON public.artist_follows 
FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can follow artists" 
ON public.artist_follows 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can unfollow artists" 
ON public.artist_follows 
FOR DELETE 
USING (auth.uid() = user_id);

-- Step 5: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_artist_follows_user_id ON public.artist_follows(user_id);
CREATE INDEX IF NOT EXISTS idx_artist_follows_artist_id ON public.artist_follows(artist_id);
CREATE INDEX IF NOT EXISTS idx_artist_follows_created_at ON public.artist_follows(created_at);

-- Step 6: Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_artist_follows_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 7: Create trigger for updated_at
DROP TRIGGER IF EXISTS trigger_update_artist_follows_updated_at ON public.artist_follows;
CREATE TRIGGER trigger_update_artist_follows_updated_at
  BEFORE UPDATE ON public.artist_follows
  FOR EACH ROW
  EXECUTE FUNCTION update_artist_follows_updated_at();

-- Step 8: Create secure function to toggle artist follow (similar to set_user_interest)
CREATE OR REPLACE FUNCTION public.set_artist_follow(p_artist_id UUID, p_following BOOLEAN)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_following THEN
    -- Insert row if following (presence-based)
    INSERT INTO public.artist_follows (user_id, artist_id)
    VALUES (auth.uid(), p_artist_id)
    ON CONFLICT (user_id, artist_id) 
    DO NOTHING;
  ELSE
    -- Delete row if not following
    DELETE FROM public.artist_follows
    WHERE user_id = auth.uid() AND artist_id = p_artist_id;
  END IF;
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.set_artist_follow(UUID, BOOLEAN) TO authenticated;

-- Step 9: Add artist_followed and artist_update notification types
-- First, check if we need to update the notification type constraint
DO $$
BEGIN
  -- Drop the existing constraint if it exists
  IF EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage 
    WHERE table_name = 'notifications' AND constraint_name LIKE '%notifications_type_check%'
  ) THEN
    ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
  END IF;
  
  -- Add new constraint with artist notification types
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
    'artist_profile_updated'
  ));
END $$;

-- Step 10: Create function to notify followers when artist has new events
CREATE OR REPLACE FUNCTION notify_artist_followers_new_event()
RETURNS TRIGGER AS $$
DECLARE
  v_artist_id UUID;
  v_artist_name TEXT;
  v_follower RECORD;
BEGIN
  -- Get artist information
  SELECT id, name INTO v_artist_id, v_artist_name
  FROM public.artists
  WHERE jambase_artist_id = NEW.artist_id
  LIMIT 1;
  
  -- If artist not found, try artist_profile table
  IF v_artist_id IS NULL THEN
    SELECT id, name INTO v_artist_id, v_artist_name
    FROM public.artist_profile
    WHERE jambase_artist_id = NEW.artist_id
    LIMIT 1;
  END IF;
  
  -- If artist found, notify all followers
  IF v_artist_id IS NOT NULL THEN
    FOR v_follower IN 
      SELECT user_id 
      FROM public.artist_follows 
      WHERE artist_id = v_artist_id
    LOOP
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        data
      ) VALUES (
        v_follower.user_id,
        'artist_new_event',
        v_artist_name || ' has a new event!',
        NEW.title || ' at ' || NEW.venue_name || ' on ' || to_char(NEW.event_date, 'Mon DD, YYYY'),
        jsonb_build_object(
          'artist_id', v_artist_id,
          'artist_name', v_artist_name,
          'event_id', NEW.id,
          'event_title', NEW.title,
          'venue_name', NEW.venue_name,
          'event_date', NEW.event_date
        )
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 11: Create trigger for new events
DROP TRIGGER IF EXISTS trigger_notify_followers_new_event ON public.jambase_events;
CREATE TRIGGER trigger_notify_followers_new_event
  AFTER INSERT ON public.jambase_events
  FOR EACH ROW
  EXECUTE FUNCTION notify_artist_followers_new_event();

-- Step 12: Create function to notify followers when artist profile is updated
CREATE OR REPLACE FUNCTION notify_artist_followers_profile_update()
RETURNS TRIGGER AS $$
DECLARE
  v_follower RECORD;
  v_changes TEXT[];
BEGIN
  -- Only notify if significant fields changed
  IF OLD.name IS DISTINCT FROM NEW.name OR
     OLD.image_url IS DISTINCT FROM NEW.image_url OR
     OLD.num_upcoming_events IS DISTINCT FROM NEW.num_upcoming_events OR
     OLD.genres IS DISTINCT FROM NEW.genres THEN
    
    -- Build list of changes
    IF OLD.name IS DISTINCT FROM NEW.name THEN
      v_changes := array_append(v_changes, 'name');
    END IF;
    IF OLD.image_url IS DISTINCT FROM NEW.image_url THEN
      v_changes := array_append(v_changes, 'image');
    END IF;
    IF OLD.num_upcoming_events < NEW.num_upcoming_events THEN
      v_changes := array_append(v_changes, 'new_events');
    END IF;
    IF OLD.genres IS DISTINCT FROM NEW.genres THEN
      v_changes := array_append(v_changes, 'genres');
    END IF;
    
    -- Notify all followers
    FOR v_follower IN 
      SELECT user_id 
      FROM public.artist_follows 
      WHERE artist_id = NEW.id
    LOOP
      INSERT INTO public.notifications (
        user_id,
        type,
        title,
        message,
        data
      ) VALUES (
        v_follower.user_id,
        'artist_profile_updated',
        NEW.name || '''s profile was updated',
        'Check out the latest updates to ' || NEW.name,
        jsonb_build_object(
          'artist_id', NEW.id,
          'artist_name', NEW.name,
          'changes', v_changes
        )
      );
    END LOOP;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 13: Create triggers for artist profile updates on both tables
DROP TRIGGER IF EXISTS trigger_notify_followers_artist_update ON public.artists;
CREATE TRIGGER trigger_notify_followers_artist_update
  AFTER UPDATE ON public.artists
  FOR EACH ROW
  EXECUTE FUNCTION notify_artist_followers_profile_update();

DROP TRIGGER IF EXISTS trigger_notify_followers_artist_profile_update ON public.artist_profile;
CREATE TRIGGER trigger_notify_followers_artist_profile_update
  AFTER UPDATE ON public.artist_profile
  FOR EACH ROW
  EXECUTE FUNCTION notify_artist_followers_profile_update();

-- Step 14: Create view for artist followers with details
CREATE OR REPLACE VIEW public.artist_follows_with_details AS
SELECT 
  af.id,
  af.user_id,
  af.artist_id,
  af.created_at,
  COALESCE(a.name, ap.name) as artist_name,
  COALESCE(a.image_url, ap.image_url) as artist_image_url,
  COALESCE(a.jambase_artist_id, ap.jambase_artist_id) as jambase_artist_id,
  ap.num_upcoming_events,
  ap.genres,
  p.name as user_name,
  p.avatar_url as user_avatar_url
FROM public.artist_follows af
LEFT JOIN public.artists a ON af.artist_id = a.id
LEFT JOIN public.artist_profile ap ON af.artist_id = ap.id
LEFT JOIN public.profiles p ON af.user_id = p.user_id;

-- Grant permissions on the view
GRANT SELECT ON public.artist_follows_with_details TO authenticated;

-- Step 15: Create function to get follower count for an artist
CREATE OR REPLACE FUNCTION public.get_artist_follower_count(p_artist_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM public.artist_follows
  WHERE artist_id = p_artist_id;
  
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_artist_follower_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_artist_follower_count(UUID) TO anon;

-- Step 16: Create function to check if user follows an artist
CREATE OR REPLACE FUNCTION public.is_following_artist(p_artist_id UUID, p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_following BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.artist_follows
    WHERE artist_id = p_artist_id AND user_id = p_user_id
  ) INTO v_following;
  
  RETURN v_following;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_following_artist(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_following_artist(UUID, UUID) TO anon;

-- Step 17: Add comments for documentation
COMMENT ON TABLE public.artist_follows IS 'Tracks which users follow which artists for notifications and personalization';
COMMENT ON FUNCTION public.set_artist_follow IS 'Securely toggle artist follow status using presence-based model';
COMMENT ON FUNCTION notify_artist_followers_new_event IS 'Notifies followers when an artist has a new event added';
COMMENT ON FUNCTION notify_artist_followers_profile_update IS 'Notifies followers when an artist profile is significantly updated';
COMMENT ON VIEW public.artist_follows_with_details IS 'Artist follows with denormalized artist and user details for easier querying';
COMMENT ON FUNCTION public.get_artist_follower_count IS 'Returns the number of followers for a given artist';
COMMENT ON FUNCTION public.is_following_artist IS 'Checks if a user is following a specific artist';

