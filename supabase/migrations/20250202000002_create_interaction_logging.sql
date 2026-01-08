-- ============================================
-- INTERACTION LOGGING SYSTEM
-- ============================================
-- Tracks user interactions: feeds, discover, passport, profiles, search, reviews, likes, comments

-- ============================================
-- FUNCTION 1: LOG INTERACTION (Main Function)
-- ============================================
-- Generic function to log any interaction from frontend

CREATE OR REPLACE FUNCTION public.log_interaction(
  p_event_type TEXT,
  p_entity_type TEXT,
  p_entity_id TEXT DEFAULT NULL,
  p_entity_uuid UUID DEFAULT NULL,
  p_session_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_interaction_id UUID;
BEGIN
  -- Get current user
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User must be authenticated';
  END IF;

  -- Validate event_type (add more as needed)
  IF p_event_type NOT IN ('click', 'view', 'submit', 'search', 'like', 'comment', 'post_review', 'share', 'navigate', 'scroll') THEN
    RAISE EXCEPTION 'Invalid event_type: %', p_event_type;
  END IF;

  -- Insert interaction
  INSERT INTO public.interactions (
    user_id,
    session_id,
    event_type,
    entity_type,
    entity_id,
    entity_uuid,
    occurred_at,
    created_at
  ) VALUES (
    v_user_id,
    COALESCE(p_session_id, gen_random_uuid()),
    p_event_type,
    p_entity_type,
    p_entity_id,
    p_entity_uuid,
    now(),
    now()
  )
  RETURNING id INTO v_interaction_id;

  RETURN v_interaction_id;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail (non-critical)
    RAISE WARNING 'Error logging interaction: %', SQLERRM;
    RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_interaction TO authenticated;

COMMENT ON FUNCTION public.log_interaction IS 
  'Logs a user interaction. Returns interaction ID or NULL if failed.';

-- ============================================
-- FUNCTION 2: LOG FEED INTERACTION
-- ============================================
-- Helper function to log feed clicks/views

CREATE OR REPLACE FUNCTION public.log_feed_interaction(
  p_feed_type TEXT,
  p_event_type TEXT DEFAULT 'click',
  p_entity_id TEXT DEFAULT NULL,
  p_entity_uuid UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate feed type
  IF p_feed_type NOT IN ('home', 'discover', 'events', 'friends', 'trending', 'nearby', 'for_you', 'following') THEN
    RAISE EXCEPTION 'Invalid feed_type: %', p_feed_type;
  END IF;

  RETURN public.log_interaction(
    p_event_type,
    'feed',
    p_feed_type || COALESCE(':' || p_entity_id, ''),
    p_entity_uuid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_feed_interaction TO authenticated;

COMMENT ON FUNCTION public.log_feed_interaction IS 
  'Logs feed interactions (home, discover, events, friends, etc.)';

-- ============================================
-- FUNCTION 3: LOG DISCOVER PAGE INTERACTION
-- ============================================
-- Helper function to log discover page interactions

CREATE OR REPLACE FUNCTION public.log_discover_interaction(
  p_section TEXT,
  p_action TEXT DEFAULT 'view',
  p_entity_id TEXT DEFAULT NULL,
  p_entity_uuid UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate discover section
  IF p_section NOT IN ('trending', 'nearby', 'genres', 'artists', 'venues', 'scenes', 'map', 'filters', 'search') THEN
    RAISE EXCEPTION 'Invalid discover section: %', p_section;
  END IF;

  RETURN public.log_interaction(
    CASE 
      WHEN p_action = 'click' THEN 'click'
      WHEN p_action = 'search' THEN 'search'
      ELSE 'view'
    END,
    'discover',
    p_section || COALESCE(':' || p_entity_id, ''),
    p_entity_uuid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_discover_interaction TO authenticated;

COMMENT ON FUNCTION public.log_discover_interaction IS 
  'Logs discover page interactions (trending, nearby, genres, artists, etc.)';

-- ============================================
-- FUNCTION 4: LOG SEARCH INTERACTION
-- ============================================
-- Tracks search bar usage

CREATE OR REPLACE FUNCTION public.log_search_interaction(
  p_search_type TEXT,
  p_query TEXT DEFAULT NULL,
  p_result_count INTEGER DEFAULT NULL,
  p_entity_uuid UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_id TEXT;
BEGIN
  -- Validate search type
  IF p_search_type NOT IN ('events', 'artists', 'venues', 'users', 'global', 'discover', 'home') THEN
    RAISE EXCEPTION 'Invalid search_type: %', p_search_type;
  END IF;

  -- Build entity_id with query info
  v_entity_id := p_search_type;
  IF p_query IS NOT NULL THEN
    v_entity_id := v_entity_id || ':query=' || LEFT(p_query, 100); -- Limit query length
  END IF;
  IF p_result_count IS NOT NULL THEN
    v_entity_id := v_entity_id || ':results=' || p_result_count;
  END IF;

  RETURN public.log_interaction(
    'search',
    'search_bar',
    v_entity_id,
    p_entity_uuid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_search_interaction TO authenticated;

COMMENT ON FUNCTION public.log_search_interaction IS 
  'Logs search bar usage with query and result count';

-- ============================================
-- FUNCTION 5: LOG PROFILE INTERACTION
-- ============================================
-- Tracks profile views/clicks

CREATE OR REPLACE FUNCTION public.log_profile_interaction(
  p_profile_user_id UUID,
  p_action TEXT DEFAULT 'view',
  p_section TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_id TEXT;
BEGIN
  IF p_action NOT IN ('view', 'click', 'follow', 'message', 'share') THEN
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  v_entity_id := p_action;
  IF p_section IS NOT NULL THEN
    v_entity_id := v_entity_id || ':' || p_section;
  END IF;

  RETURN public.log_interaction(
    p_action,
    'profile',
    v_entity_id,
    p_profile_user_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_profile_interaction TO authenticated;

COMMENT ON FUNCTION public.log_profile_interaction IS 
  'Logs profile interactions (view, click, follow, message, etc.)';

-- ============================================
-- FUNCTION 6: LOG PASSPORT INTERACTION
-- ============================================
-- Tracks passport page interactions

CREATE OR REPLACE FUNCTION public.log_passport_interaction(
  p_action TEXT,
  p_section TEXT DEFAULT NULL,
  p_entity_uuid UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_id TEXT;
BEGIN
  IF p_action NOT IN ('view', 'click', 'edit', 'add_event', 'add_venue', 'view_stats') THEN
    RAISE EXCEPTION 'Invalid passport action: %', p_action;
  END IF;

  v_entity_id := p_action;
  IF p_section IS NOT NULL THEN
    v_entity_id := v_entity_id || ':' || p_section;
  END IF;

  RETURN public.log_interaction(
    p_action,
    'passport',
    v_entity_id,
    p_entity_uuid
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_passport_interaction TO authenticated;

COMMENT ON FUNCTION public.log_passport_interaction IS 
  'Logs passport page interactions';

-- ============================================
-- TRIGGER 1: AUTO-LOG REVIEW POSTS
-- ============================================
-- Automatically logs when a review is posted

CREATE OR REPLACE FUNCTION public.log_review_posted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log review post interaction
  INSERT INTO public.interactions (
    user_id,
    event_type,
    entity_type,
    entity_id,
    entity_uuid,
    occurred_at,
    created_at
  ) VALUES (
    NEW.user_id,
    'post_review',
    'review',
    'event:' || COALESCE(NEW.event_id::TEXT, ''),
    NEW.id,
    now(),
    now()
  )
  ON CONFLICT DO NOTHING; -- Prevent duplicates if trigger fires multiple times

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail review insert if logging fails
    RETURN NEW;
END;
$$;

-- Create trigger (only if reviews table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'reviews') THEN
    DROP TRIGGER IF EXISTS trigger_log_review_posted ON public.reviews;
    CREATE TRIGGER trigger_log_review_posted
      AFTER INSERT ON public.reviews
      FOR EACH ROW
      EXECUTE FUNCTION public.log_review_posted();
  END IF;
END $$;

COMMENT ON FUNCTION public.log_review_posted IS 
  'Automatically logs when a review is posted';

-- ============================================
-- TRIGGER 2: AUTO-LOG LIKES
-- ============================================
-- Automatically logs when something is liked

CREATE OR REPLACE FUNCTION public.log_like_interaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_type TEXT;
  v_entity_uuid UUID;
BEGIN
  -- Determine entity type from engagements table structure
  IF NEW.entity_type IS NOT NULL THEN
    v_entity_type := NEW.entity_type;
  ELSE
    v_entity_type := 'unknown';
  END IF;

  -- Only log likes (not other engagement types)
  IF NEW.engagement_type = 'like' THEN
    INSERT INTO public.interactions (
      user_id,
      event_type,
      entity_type,
      entity_id,
      entity_uuid,
      occurred_at,
      created_at
    ) VALUES (
      NEW.user_id,
      'like',
      v_entity_type,
      NEW.engagement_type || ':' || COALESCE(NEW.entity_id::TEXT, ''),
      NEW.entity_id,
      now(),
      now()
    )
    ON CONFLICT DO NOTHING;

    -- If it's a review like, also log it as review interaction
    IF v_entity_type = 'review' AND NEW.entity_id IS NOT NULL THEN
      INSERT INTO public.interactions (
        user_id,
        event_type,
        entity_type,
        entity_id,
        entity_uuid,
        occurred_at,
        created_at
      ) VALUES (
        NEW.user_id,
        'like',
        'review',
        'review_id:' || NEW.entity_id::TEXT,
        NEW.entity_id,
        now(),
        now()
      )
      ON CONFLICT DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail like insert if logging fails
    RETURN NEW;
END;
$$;

-- Create trigger (only if engagements table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'engagements') THEN
    DROP TRIGGER IF EXISTS trigger_log_like_interaction ON public.engagements;
    CREATE TRIGGER trigger_log_like_interaction
      AFTER INSERT ON public.engagements
      FOR EACH ROW
      WHEN (NEW.engagement_type = 'like')
      EXECUTE FUNCTION public.log_like_interaction();
  END IF;
END $$;

COMMENT ON FUNCTION public.log_like_interaction IS 
  'Automatically logs when something is liked';

-- ============================================
-- TRIGGER 3: AUTO-LOG COMMENTS
-- ============================================
-- Automatically logs when a comment is posted

CREATE OR REPLACE FUNCTION public.log_comment_interaction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_type TEXT;
  v_entity_uuid UUID;
BEGIN
  -- Determine what was commented on
  IF NEW.entity_type IS NOT NULL THEN
    v_entity_type := NEW.entity_type;
  ELSE
    v_entity_type := 'unknown';
  END IF;

  -- Get entity UUID
  IF NEW.entity_id IS NOT NULL THEN
    v_entity_uuid := NEW.entity_id;
  END IF;

  -- Log comment interaction
  INSERT INTO public.interactions (
    user_id,
    event_type,
    entity_type,
    entity_id,
    entity_uuid,
    occurred_at,
    created_at
  ) VALUES (
    NEW.user_id,
    'comment',
    v_entity_type,
    'comment_id:' || COALESCE(NEW.id::TEXT, ''),
    v_entity_uuid,
    now(),
    now()
  )
  ON CONFLICT DO NOTHING;

  -- If commenting on a review, also log as review interaction
  IF v_entity_type = 'review' AND NEW.entity_id IS NOT NULL THEN
    INSERT INTO public.interactions (
      user_id,
      event_type,
      entity_type,
      entity_id,
      entity_uuid,
      occurred_at,
      created_at
    ) VALUES (
      NEW.user_id,
      'comment',
      'review',
      'review_id:' || NEW.entity_id::TEXT,
      NEW.entity_id,
      now(),
      now()
    )
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Don't fail comment insert if logging fails
    RETURN NEW;
END;
$$;

-- Create trigger (only if comments table exists)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'comments') THEN
    DROP TRIGGER IF EXISTS trigger_log_comment_interaction ON public.comments;
    CREATE TRIGGER trigger_log_comment_interaction
      AFTER INSERT ON public.comments
      FOR EACH ROW
      EXECUTE FUNCTION public.log_comment_interaction();
  END IF;
END $$;

COMMENT ON FUNCTION public.log_comment_interaction IS 
  'Automatically logs when a comment is posted';

-- ============================================
-- HELPER VIEWS FOR INSIGHTS
-- ============================================

-- View: Feed interaction summary
CREATE OR REPLACE VIEW public.v_feed_interaction_summary AS
SELECT 
  entity_id AS feed_type,
  event_type,
  COUNT(*) AS interaction_count,
  COUNT(DISTINCT user_id) AS unique_users,
  DATE_TRUNC('day', occurred_at) AS date
FROM public.interactions
WHERE entity_type = 'feed'
GROUP BY entity_id, event_type, DATE_TRUNC('day', occurred_at)
ORDER BY date DESC, interaction_count DESC;

COMMENT ON VIEW public.v_feed_interaction_summary IS 
  'Summary of feed interactions by type, event, and date';

-- View: Search usage summary
CREATE OR REPLACE VIEW public.v_search_usage_summary AS
SELECT 
  SPLIT_PART(entity_id, ':', 1) AS search_type,
  COUNT(*) AS search_count,
  COUNT(DISTINCT user_id) AS unique_users,
  DATE_TRUNC('day', occurred_at) AS date
FROM public.interactions
WHERE entity_type = 'search_bar'
GROUP BY SPLIT_PART(entity_id, ':', 1), DATE_TRUNC('day', occurred_at)
ORDER BY date DESC, search_count DESC;

COMMENT ON VIEW public.v_search_usage_summary IS 
  'Summary of search bar usage by type and date';

-- View: Review/comment/like activity
CREATE OR REPLACE VIEW public.v_content_activity_summary AS
SELECT 
  event_type,
  entity_type,
  COUNT(*) AS activity_count,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(DISTINCT entity_uuid) AS unique_entities,
  DATE_TRUNC('day', occurred_at) AS date
FROM public.interactions
WHERE event_type IN ('post_review', 'like', 'comment')
GROUP BY event_type, entity_type, DATE_TRUNC('day', occurred_at)
ORDER BY date DESC, activity_count DESC;

COMMENT ON VIEW public.v_content_activity_summary IS 
  'Summary of review, like, and comment activity';

-- View: Discover page section usage
CREATE OR REPLACE VIEW public.v_discover_usage_summary AS
SELECT 
  SPLIT_PART(entity_id, ':', 1) AS section,
  event_type,
  COUNT(*) AS interaction_count,
  COUNT(DISTINCT user_id) AS unique_users,
  DATE_TRUNC('day', occurred_at) AS date
FROM public.interactions
WHERE entity_type = 'discover'
GROUP BY SPLIT_PART(entity_id, ':', 1), event_type, DATE_TRUNC('day', occurred_at)
ORDER BY date DESC, interaction_count DESC;

COMMENT ON VIEW public.v_discover_usage_summary IS 
  'Summary of discover page section usage';

-- View: Profile interaction summary
CREATE OR REPLACE VIEW public.v_profile_interaction_summary AS
SELECT 
  entity_uuid AS profile_user_id,
  SPLIT_PART(entity_id, ':', 1) AS action,
  COUNT(*) AS interaction_count,
  COUNT(DISTINCT user_id) AS unique_visitors,
  DATE_TRUNC('day', occurred_at) AS date
FROM public.interactions
WHERE entity_type = 'profile'
GROUP BY entity_uuid, SPLIT_PART(entity_id, ':', 1), DATE_TRUNC('day', occurred_at)
ORDER BY date DESC, interaction_count DESC;

COMMENT ON VIEW public.v_profile_interaction_summary IS 
  'Summary of profile interactions by user and action';

