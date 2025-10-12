-- ============================================
-- PHASE 4: SOCIAL & ENGAGEMENT FEATURES
-- ============================================
-- Adds event groups and photo galleries (NO PAYMENTS)
-- Leverages existing matches, swipes, and chat infrastructure

-- ============================================
-- PART 1: EVENT GROUPS
-- ============================================

-- Step 1: Create event_groups table
CREATE TABLE IF NOT EXISTS public.event_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.jambase_events(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_by_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_public BOOLEAN DEFAULT true,
  max_members INTEGER,
  member_count INTEGER DEFAULT 0,
  cover_image_url TEXT,
  chat_id UUID REFERENCES public.chats(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 2: Create event_group_members table
CREATE TABLE IF NOT EXISTS public.event_group_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID NOT NULL REFERENCES public.event_groups(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'member' CHECK (role IN ('admin', 'moderator', 'member')),
  joined_at TIMESTAMPTZ DEFAULT now(),
  last_active_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(group_id, user_id)
);

-- Step 3: Create indexes for event_groups
CREATE INDEX IF NOT EXISTS idx_event_groups_event_id ON public.event_groups(event_id);
CREATE INDEX IF NOT EXISTS idx_event_groups_created_by ON public.event_groups(created_by_user_id);
CREATE INDEX IF NOT EXISTS idx_event_groups_public ON public.event_groups(is_public) WHERE is_public = true;
CREATE INDEX IF NOT EXISTS idx_event_groups_created_at ON public.event_groups(created_at DESC);

-- Step 4: Create indexes for event_group_members
CREATE INDEX IF NOT EXISTS idx_event_group_members_group_id ON public.event_group_members(group_id);
CREATE INDEX IF NOT EXISTS idx_event_group_members_user_id ON public.event_group_members(user_id);
CREATE INDEX IF NOT EXISTS idx_event_group_members_role ON public.event_group_members(role);

-- Step 5: Enable RLS on event_groups
ALTER TABLE public.event_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_group_members ENABLE ROW LEVEL SECURITY;

-- Step 6: RLS policies for event_groups
DROP POLICY IF EXISTS "Public groups are viewable by everyone" ON public.event_groups;
CREATE POLICY "Public groups are viewable by everyone"
ON public.event_groups FOR SELECT
USING (is_public = true OR created_by_user_id = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can create groups" ON public.event_groups;
CREATE POLICY "Authenticated users can create groups"
ON public.event_groups FOR INSERT
WITH CHECK (auth.uid() = created_by_user_id);

DROP POLICY IF EXISTS "Group creators can update their groups" ON public.event_groups;
CREATE POLICY "Group creators can update their groups"
ON public.event_groups FOR UPDATE
USING (created_by_user_id = auth.uid());

DROP POLICY IF EXISTS "Group creators can delete their groups" ON public.event_groups;
CREATE POLICY "Group creators can delete their groups"
ON public.event_groups FOR DELETE
USING (created_by_user_id = auth.uid());

-- Step 7: RLS policies for event_group_members
DROP POLICY IF EXISTS "Group members are viewable by group members" ON public.event_group_members;
CREATE POLICY "Group members are viewable by group members"
ON public.event_group_members FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.event_groups
    WHERE id = event_group_members.group_id
    AND (is_public = true OR created_by_user_id = auth.uid())
  )
  OR user_id = auth.uid()
);

DROP POLICY IF EXISTS "Users can join groups" ON public.event_group_members;
CREATE POLICY "Users can join groups"
ON public.event_group_members FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can leave groups" ON public.event_group_members;
CREATE POLICY "Users can leave groups"
ON public.event_group_members FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- PART 2: EVENT PHOTOS
-- ============================================

-- Step 8: Create event_photos table
CREATE TABLE IF NOT EXISTS public.event_photos (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id UUID NOT NULL REFERENCES public.jambase_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  caption TEXT,
  likes_count INTEGER DEFAULT 0,
  comments_count INTEGER DEFAULT 0,
  is_featured BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 9: Create event_photo_likes table
CREATE TABLE IF NOT EXISTS public.event_photo_likes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  photo_id UUID NOT NULL REFERENCES public.event_photos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(photo_id, user_id)
);

-- Step 10: Create event_photo_comments table
CREATE TABLE IF NOT EXISTS public.event_photo_comments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  photo_id UUID NOT NULL REFERENCES public.event_photos(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  comment TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Step 11: Create indexes for event_photos
CREATE INDEX IF NOT EXISTS idx_event_photos_event_id ON public.event_photos(event_id);
CREATE INDEX IF NOT EXISTS idx_event_photos_user_id ON public.event_photos(user_id);
CREATE INDEX IF NOT EXISTS idx_event_photos_created_at ON public.event_photos(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_photos_featured ON public.event_photos(is_featured) WHERE is_featured = true;

-- Step 12: Create indexes for photo interactions
CREATE INDEX IF NOT EXISTS idx_event_photo_likes_photo_id ON public.event_photo_likes(photo_id);
CREATE INDEX IF NOT EXISTS idx_event_photo_likes_user_id ON public.event_photo_likes(user_id);
CREATE INDEX IF NOT EXISTS idx_event_photo_comments_photo_id ON public.event_photo_comments(photo_id);
CREATE INDEX IF NOT EXISTS idx_event_photo_comments_user_id ON public.event_photo_comments(user_id);

-- Step 13: Enable RLS on event_photos tables
ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_photo_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_photo_comments ENABLE ROW LEVEL SECURITY;

-- Step 14: RLS policies for event_photos
DROP POLICY IF EXISTS "Event photos are viewable by everyone" ON public.event_photos;
CREATE POLICY "Event photos are viewable by everyone"
ON public.event_photos FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Authenticated users can upload photos" ON public.event_photos;
CREATE POLICY "Authenticated users can upload photos"
ON public.event_photos FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own photos" ON public.event_photos;
CREATE POLICY "Users can update their own photos"
ON public.event_photos FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own photos" ON public.event_photos;
CREATE POLICY "Users can delete their own photos"
ON public.event_photos FOR DELETE
USING (auth.uid() = user_id);

-- Step 15: RLS policies for photo_likes
DROP POLICY IF EXISTS "Photo likes are viewable by everyone" ON public.event_photo_likes;
CREATE POLICY "Photo likes are viewable by everyone"
ON public.event_photo_likes FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can like photos" ON public.event_photo_likes;
CREATE POLICY "Users can like photos"
ON public.event_photo_likes FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike photos" ON public.event_photo_likes;
CREATE POLICY "Users can unlike photos"
ON public.event_photo_likes FOR DELETE
USING (auth.uid() = user_id);

-- Step 16: RLS policies for photo_comments
DROP POLICY IF EXISTS "Photo comments are viewable by everyone" ON public.event_photo_comments;
CREATE POLICY "Photo comments are viewable by everyone"
ON public.event_photo_comments FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Users can comment on photos" ON public.event_photo_comments;
CREATE POLICY "Users can comment on photos"
ON public.event_photo_comments FOR INSERT
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own comments" ON public.event_photo_comments;
CREATE POLICY "Users can update their own comments"
ON public.event_photo_comments FOR UPDATE
USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.event_photo_comments;
CREATE POLICY "Users can delete their own comments"
ON public.event_photo_comments FOR DELETE
USING (auth.uid() = user_id);

-- ============================================
-- PART 3: HELPER FUNCTIONS
-- ============================================

-- Step 17: Function to create event group (with automatic chat creation)
CREATE OR REPLACE FUNCTION public.create_event_group(
  p_event_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_is_public BOOLEAN DEFAULT true,
  p_max_members INTEGER DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_group_id UUID;
  v_chat_id UUID;
BEGIN
  -- Create a chat for the group
  INSERT INTO public.chats (
    created_at,
    updated_at
  ) VALUES (
    now(),
    now()
  )
  RETURNING id INTO v_chat_id;
  
  -- Create the group
  INSERT INTO public.event_groups (
    event_id,
    name,
    description,
    created_by_user_id,
    is_public,
    max_members,
    chat_id,
    member_count
  ) VALUES (
    p_event_id,
    p_name,
    p_description,
    auth.uid(),
    p_is_public,
    p_max_members,
    v_chat_id,
    1
  )
  RETURNING id INTO v_group_id;
  
  -- Add creator as admin member
  INSERT INTO public.event_group_members (
    group_id,
    user_id,
    role
  ) VALUES (
    v_group_id,
    auth.uid(),
    'admin'
  );
  
  -- Add creator as chat participant
  INSERT INTO public.chat_participants (
    chat_id,
    user_id
  ) VALUES (
    v_chat_id,
    auth.uid()
  );
  
  RETURN v_group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_event_group(UUID, TEXT, TEXT, BOOLEAN, INTEGER) TO authenticated;

-- Step 18: Function to join event group
CREATE OR REPLACE FUNCTION public.join_event_group(
  p_group_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_chat_id UUID;
  v_current_members INTEGER;
  v_max_members INTEGER;
BEGIN
  -- Get group info
  SELECT chat_id, member_count, max_members 
  INTO v_chat_id, v_current_members, v_max_members
  FROM public.event_groups
  WHERE id = p_group_id;
  
  -- Check if group is full
  IF v_max_members IS NOT NULL AND v_current_members >= v_max_members THEN
    RAISE EXCEPTION 'Group is full';
  END IF;
  
  -- Add user to group
  INSERT INTO public.event_group_members (
    group_id,
    user_id,
    role
  ) VALUES (
    p_group_id,
    auth.uid(),
    'member'
  )
  ON CONFLICT (group_id, user_id) DO NOTHING;
  
  -- Add user to group chat
  IF v_chat_id IS NOT NULL THEN
    INSERT INTO public.chat_participants (
      chat_id,
      user_id
    ) VALUES (
      v_chat_id,
      auth.uid()
    )
    ON CONFLICT (chat_id, user_id) DO NOTHING;
  END IF;
  
  -- Update member count
  UPDATE public.event_groups
  SET member_count = member_count + 1
  WHERE id = p_group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_event_group(UUID) TO authenticated;

-- Step 19: Function to leave event group
CREATE OR REPLACE FUNCTION public.leave_event_group(
  p_group_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_chat_id UUID;
BEGIN
  -- Get chat_id
  SELECT chat_id INTO v_chat_id
  FROM public.event_groups
  WHERE id = p_group_id;
  
  -- Remove from group
  DELETE FROM public.event_group_members
  WHERE group_id = p_group_id AND user_id = auth.uid();
  
  -- Remove from chat
  IF v_chat_id IS NOT NULL THEN
    DELETE FROM public.chat_participants
    WHERE chat_id = v_chat_id AND user_id = auth.uid();
  END IF;
  
  -- Update member count
  UPDATE public.event_groups
  SET member_count = GREATEST(0, member_count - 1)
  WHERE id = p_group_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.leave_event_group(UUID) TO authenticated;

-- Step 20: Function to get groups for an event
CREATE OR REPLACE FUNCTION public.get_event_groups(
  p_event_id UUID
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  created_by_user_id UUID,
  creator_name TEXT,
  creator_avatar_url TEXT,
  is_public BOOLEAN,
  member_count INTEGER,
  max_members INTEGER,
  cover_image_url TEXT,
  is_member BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    eg.id,
    eg.name,
    eg.description,
    eg.created_by_user_id,
    p.name as creator_name,
    p.avatar_url as creator_avatar_url,
    eg.is_public,
    eg.member_count,
    eg.max_members,
    eg.cover_image_url,
    EXISTS (
      SELECT 1 FROM public.event_group_members
      WHERE group_id = eg.id AND user_id = auth.uid()
    ) as is_member,
    eg.created_at
  FROM public.event_groups eg
  JOIN public.profiles p ON p.user_id = eg.created_by_user_id
  WHERE eg.event_id = p_event_id
  AND (eg.is_public = true OR eg.created_by_user_id = auth.uid())
  ORDER BY eg.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_groups(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_groups(UUID) TO anon;

-- ============================================
-- PART 4: EVENT PHOTOS
-- ============================================

-- Step 21: Trigger to update photo like count
CREATE OR REPLACE FUNCTION update_photo_likes_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.event_photos
    SET likes_count = likes_count + 1
    WHERE id = NEW.photo_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.event_photos
    SET likes_count = GREATEST(0, likes_count - 1)
    WHERE id = OLD.photo_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_photo_likes_count ON public.event_photo_likes;
CREATE TRIGGER trigger_update_photo_likes_count
  AFTER INSERT OR DELETE ON public.event_photo_likes
  FOR EACH ROW
  EXECUTE FUNCTION update_photo_likes_count();

-- Step 22: Trigger to update photo comment count
CREATE OR REPLACE FUNCTION update_photo_comments_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.event_photos
    SET comments_count = comments_count + 1
    WHERE id = NEW.photo_id;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.event_photos
    SET comments_count = GREATEST(0, comments_count - 1)
    WHERE id = OLD.photo_id;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_photo_comments_count ON public.event_photo_comments;
CREATE TRIGGER trigger_update_photo_comments_count
  AFTER INSERT OR DELETE ON public.event_photo_comments
  FOR EACH ROW
  EXECUTE FUNCTION update_photo_comments_count();

-- Step 23: Function to get event photos
CREATE OR REPLACE FUNCTION public.get_event_photos(
  p_event_id UUID,
  p_limit INTEGER DEFAULT 20,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  photo_url TEXT,
  caption TEXT,
  likes_count INTEGER,
  comments_count INTEGER,
  is_featured BOOLEAN,
  user_id UUID,
  user_name TEXT,
  user_avatar_url TEXT,
  user_has_liked BOOLEAN,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ep.id,
    ep.photo_url,
    ep.caption,
    ep.likes_count,
    ep.comments_count,
    ep.is_featured,
    ep.user_id,
    p.name as user_name,
    p.avatar_url as user_avatar_url,
    EXISTS (
      SELECT 1 FROM public.event_photo_likes
      WHERE photo_id = ep.id AND user_id = auth.uid()
    ) as user_has_liked,
    ep.created_at
  FROM public.event_photos ep
  JOIN public.profiles p ON p.user_id = ep.user_id
  WHERE ep.event_id = p_event_id
  ORDER BY ep.is_featured DESC, ep.likes_count DESC, ep.created_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_event_photos(UUID, INTEGER, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_event_photos(UUID, INTEGER, INTEGER) TO anon;

-- ============================================
-- PART 5: ENHANCED RSVP (Extend Existing)
-- ============================================

-- Step 24: Add RSVP status to user_jambase_events
ALTER TABLE public.user_jambase_events
ADD COLUMN IF NOT EXISTS rsvp_status TEXT CHECK (rsvp_status IN ('interested', 'going', 'maybe', 'not_going')),
ADD COLUMN IF NOT EXISTS qr_code TEXT,
ADD COLUMN IF NOT EXISTS checked_in_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS guest_count INTEGER DEFAULT 1;

-- Step 25: Create index for RSVP
CREATE INDEX IF NOT EXISTS idx_user_jambase_events_rsvp_status ON public.user_jambase_events(rsvp_status);
CREATE INDEX IF NOT EXISTS idx_user_jambase_events_qr_code ON public.user_jambase_events(qr_code) WHERE qr_code IS NOT NULL;

-- Step 26: Function to update RSVP status
CREATE OR REPLACE FUNCTION public.update_rsvp_status(
  p_event_id UUID,
  p_rsvp_status TEXT,
  p_guest_count INTEGER DEFAULT 1
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Upsert RSVP
  INSERT INTO public.user_jambase_events (
    user_id,
    jambase_event_id,
    rsvp_status,
    guest_count
  ) VALUES (
    auth.uid(),
    p_event_id,
    p_rsvp_status,
    p_guest_count
  )
  ON CONFLICT (user_id, jambase_event_id)
  DO UPDATE SET
    rsvp_status = EXCLUDED.rsvp_status,
    guest_count = EXCLUDED.guest_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_rsvp_status(UUID, TEXT, INTEGER) TO authenticated;

-- ============================================
-- PART 6: HELPFUL COMMENTS
-- ============================================

COMMENT ON TABLE public.event_groups IS 'Event-based community groups with integrated chat';
COMMENT ON TABLE public.event_group_members IS 'Group membership and roles';
COMMENT ON TABLE public.event_photos IS 'User-uploaded photos from events';
COMMENT ON TABLE public.event_photo_likes IS 'Likes on event photos';
COMMENT ON TABLE public.event_photo_comments IS 'Comments on event photos';

COMMENT ON COLUMN public.user_jambase_events.rsvp_status IS 'RSVP status: interested, going, maybe, not_going';
COMMENT ON COLUMN public.user_jambase_events.qr_code IS 'QR code for event check-in';

COMMENT ON FUNCTION public.create_event_group IS 'Create event group with automatic chat';
COMMENT ON FUNCTION public.join_event_group IS 'Join an event group';
COMMENT ON FUNCTION public.leave_event_group IS 'Leave an event group';
COMMENT ON FUNCTION public.get_event_groups IS 'Get all groups for an event';
COMMENT ON FUNCTION public.get_event_photos IS 'Get photos for an event with like status';

-- Verification
SELECT 
  'Phase 4 Social & Engagement System Installed' as status,
  COUNT(*) FILTER (WHERE table_name = 'event_groups') as groups_table,
  COUNT(*) FILTER (WHERE table_name = 'event_group_members') as group_members_table,
  COUNT(*) FILTER (WHERE table_name = 'event_photos') as photos_table,
  COUNT(*) FILTER (WHERE table_name = 'event_photo_likes') as photo_likes_table,
  COUNT(*) FILTER (WHERE table_name = 'event_photo_comments') as photo_comments_table
FROM information_schema.tables
WHERE table_schema = 'public' 
  AND table_name IN ('event_groups', 'event_group_members', 'event_photos', 'event_photo_likes', 'event_photo_comments');

