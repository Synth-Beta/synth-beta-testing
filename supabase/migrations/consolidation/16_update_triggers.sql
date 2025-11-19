-- ============================================
-- DATABASE CONSOLIDATION: PHASE 4 - UPDATE TRIGGERS
-- ============================================
-- This migration updates all database triggers to reference new consolidated table names
-- Run this AFTER Phase 4.1 (update functions) is complete

-- ============================================
-- STEP 0: AGGRESSIVE CLEANUP - DROP ALL TRIGGERS AND FUNCTIONS FIRST
-- ============================================
-- Drop all triggers that reference the functions we're updating
DROP TRIGGER IF EXISTS update_review_likes_count_insert ON public.engagements CASCADE;
DROP TRIGGER IF EXISTS update_review_likes_count_delete ON public.engagements CASCADE;
DROP TRIGGER IF EXISTS update_review_comments_count_insert ON public.comments CASCADE;
DROP TRIGGER IF EXISTS update_review_comments_count_delete ON public.comments CASCADE;
DROP TRIGGER IF EXISTS update_review_shares_count_insert ON public.engagements CASCADE;
DROP TRIGGER IF EXISTS update_review_shares_count_delete ON public.engagements CASCADE;
DROP TRIGGER IF EXISTS update_comment_likes_count_insert ON public.engagements CASCADE;
DROP TRIGGER IF EXISTS update_comment_likes_count_delete ON public.engagements CASCADE;
DROP TRIGGER IF EXISTS notify_friend_event_interest_insert_trigger ON public.relationships CASCADE;
DROP TRIGGER IF EXISTS notify_friend_event_interest_update_trigger ON public.relationships CASCADE;

-- Drop all functions that need to be recreated
DROP FUNCTION IF EXISTS public.update_review_counts() CASCADE;
DROP FUNCTION IF EXISTS public.update_comment_likes_count() CASCADE;
DROP FUNCTION IF EXISTS public.notify_friends_event_interest() CASCADE;

-- ============================================
-- 4.3.1 UPDATE REVIEW ENGAGEMENT TRIGGERS
-- ============================================

-- Create the function for updating review counts
-- Function was already dropped above, so we create it fresh
CREATE OR REPLACE FUNCTION public.update_review_counts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment count when new like/comment/share is added
    IF TG_TABLE_NAME = 'engagements' AND NEW.entity_type = 'review' AND NEW.engagement_type = 'like' THEN
      UPDATE public.reviews 
      SET likes_count = COALESCE(likes_count, 0) + 1 
      WHERE id = NEW.entity_id;
    ELSIF TG_TABLE_NAME = 'comments' AND NEW.entity_type = 'review' THEN
      UPDATE public.reviews 
      SET comments_count = COALESCE(comments_count, 0) + 1 
      WHERE id = NEW.entity_id;
    ELSIF TG_TABLE_NAME = 'engagements' AND NEW.entity_type = 'review' AND NEW.engagement_type = 'share' THEN
      UPDATE public.reviews 
      SET shares_count = COALESCE(shares_count, 0) + 1 
      WHERE id = NEW.entity_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement count when like/comment/share is removed
    IF TG_TABLE_NAME = 'engagements' AND OLD.entity_type = 'review' AND OLD.engagement_type = 'like' THEN
      UPDATE public.reviews 
      SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) 
      WHERE id = OLD.entity_id;
    ELSIF TG_TABLE_NAME = 'comments' AND OLD.entity_type = 'review' THEN
      UPDATE public.reviews 
      SET comments_count = GREATEST(COALESCE(comments_count, 0) - 1, 0) 
      WHERE id = OLD.entity_id;
    ELSIF TG_TABLE_NAME = 'engagements' AND OLD.entity_type = 'review' AND OLD.engagement_type = 'share' THEN
      UPDATE public.reviews 
      SET shares_count = GREATEST(COALESCE(shares_count, 0) - 1, 0) 
      WHERE id = OLD.entity_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- Triggers were already dropped above, now create them fresh

-- Create new triggers for review engagement counts
-- Separate triggers for INSERT and DELETE to avoid NEW/OLD reference issues

-- Review likes triggers
CREATE TRIGGER update_review_likes_count_insert
  AFTER INSERT ON public.engagements
  FOR EACH ROW
  WHEN (NEW.entity_type = 'review' AND NEW.engagement_type = 'like')
  EXECUTE FUNCTION public.update_review_counts();

CREATE TRIGGER update_review_likes_count_delete
  AFTER DELETE ON public.engagements
  FOR EACH ROW
  WHEN (OLD.entity_type = 'review' AND OLD.engagement_type = 'like')
  EXECUTE FUNCTION public.update_review_counts();

-- Review comments triggers
CREATE TRIGGER update_review_comments_count_insert
  AFTER INSERT ON public.comments
  FOR EACH ROW
  WHEN (NEW.entity_type = 'review')
  EXECUTE FUNCTION public.update_review_counts();

CREATE TRIGGER update_review_comments_count_delete
  AFTER DELETE ON public.comments
  FOR EACH ROW
  WHEN (OLD.entity_type = 'review')
  EXECUTE FUNCTION public.update_review_counts();

-- Review shares triggers
CREATE TRIGGER update_review_shares_count_insert
  AFTER INSERT ON public.engagements
  FOR EACH ROW
  WHEN (NEW.entity_type = 'review' AND NEW.engagement_type = 'share')
  EXECUTE FUNCTION public.update_review_counts();

CREATE TRIGGER update_review_shares_count_delete
  AFTER DELETE ON public.engagements
  FOR EACH ROW
  WHEN (OLD.entity_type = 'review' AND OLD.engagement_type = 'share')
  EXECUTE FUNCTION public.update_review_counts();

-- ============================================
-- 4.3.2 UPDATE COMMENT LIKES TRIGGERS
-- ============================================

-- Create the function for updating comment likes count
-- Function was already dropped above, so we create it fresh
CREATE OR REPLACE FUNCTION public.update_comment_likes_count()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Increment comment likes count
    IF NEW.entity_type = 'comment' AND NEW.engagement_type = 'like' THEN
      UPDATE public.comments 
      SET likes_count = COALESCE(likes_count, 0) + 1 
      WHERE id = NEW.entity_id;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    -- Decrement comment likes count
    IF OLD.entity_type = 'comment' AND OLD.engagement_type = 'like' THEN
      UPDATE public.comments 
      SET likes_count = GREATEST(COALESCE(likes_count, 0) - 1, 0) 
      WHERE id = OLD.entity_id;
    END IF;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- Triggers were already dropped above, now create them fresh

-- Create new triggers for comment likes count
-- Separate triggers for INSERT and DELETE to avoid NEW/OLD reference issues
CREATE TRIGGER update_comment_likes_count_insert
  AFTER INSERT ON public.engagements
  FOR EACH ROW
  WHEN (NEW.entity_type = 'comment' AND NEW.engagement_type = 'like')
  EXECUTE FUNCTION public.update_comment_likes_count();

CREATE TRIGGER update_comment_likes_count_delete
  AFTER DELETE ON public.engagements
  FOR EACH ROW
  WHEN (OLD.entity_type = 'comment' AND OLD.engagement_type = 'like')
  EXECUTE FUNCTION public.update_comment_likes_count();

-- ============================================
-- 4.3.3 UPDATE NOTIFICATION TRIGGERS
-- ============================================

-- Update notification triggers for relationship changes
-- Note: These triggers should fire when relationships are created/updated
-- Create trigger for friend request notifications
CREATE OR REPLACE FUNCTION public.notify_friend_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_sender_name TEXT;
  v_receiver_id UUID;
BEGIN
  -- Get sender name
  SELECT name INTO v_sender_name
  FROM public.users
  WHERE user_id = NEW.user_id;
  
  -- Get receiver ID
  v_receiver_id := NEW.related_entity_id::UUID;
  
  -- Create notification
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    data,
    created_at
  ) VALUES (
    v_receiver_id,
    'friend_request',
    'New Friend Request',
    v_sender_name || ' sent you a friend request',
    jsonb_build_object(
      'request_id', NEW.id,
      'sender_id', NEW.user_id,
      'receiver_id', v_receiver_id
    ),
    now()
  );
  
  RETURN NEW;
END;
$function$;

-- Create trigger for friend request notifications
DROP TRIGGER IF EXISTS notify_friend_request_trigger ON public.relationships;
CREATE TRIGGER notify_friend_request_trigger
  AFTER INSERT ON public.relationships
  FOR EACH ROW
  WHEN (NEW.related_entity_type = 'user' AND NEW.relationship_type = 'friend' AND NEW.status = 'pending')
  EXECUTE FUNCTION public.notify_friend_request();

-- Create trigger for friend accepted notifications
CREATE OR REPLACE FUNCTION public.notify_friend_accepted()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_name TEXT;
  v_friend_id UUID;
BEGIN
  -- Get user name
  SELECT name INTO v_user_name
  FROM public.users
  WHERE user_id = NEW.user_id;
  
  -- Get friend ID
  v_friend_id := NEW.related_entity_id::UUID;
  
  -- Create notification for the friend
  INSERT INTO public.notifications (
    user_id,
    type,
    title,
    message,
    data,
    created_at
  ) VALUES (
    v_friend_id,
    'friend_accepted',
    'Friend Request Accepted',
    v_user_name || ' accepted your friend request',
    jsonb_build_object(
      'friend_id', NEW.user_id,
      'friend_name', v_user_name
    ),
    now()
  );
  
  RETURN NEW;
END;
$function$;

-- Create trigger for friend accepted notifications
DROP TRIGGER IF EXISTS notify_friend_accepted_trigger ON public.relationships;
CREATE TRIGGER notify_friend_accepted_trigger
  AFTER UPDATE ON public.relationships
  FOR EACH ROW
  WHEN (NEW.related_entity_type = 'user' AND NEW.relationship_type = 'friend' AND NEW.status = 'accepted' AND OLD.status = 'pending')
  EXECUTE FUNCTION public.notify_friend_accepted();

-- ============================================
-- 4.3.4 UPDATE EVENT INTEREST NOTIFICATION TRIGGERS
-- ============================================

-- Update event interest notification triggers
-- Note: Event interests are now stored in the relationships table
-- Function was already dropped above, so we create it fresh
CREATE OR REPLACE FUNCTION public.notify_friends_event_interest()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_name TEXT;
  v_event_title TEXT;
  v_friend_id UUID;
BEGIN
  -- Only process "going" and "maybe" RSVP
  IF NEW.relationship_type NOT IN ('going', 'maybe') THEN
    RETURN NEW;
  END IF;
  
  -- Get user name
  SELECT name INTO v_user_name
  FROM public.users
  WHERE user_id = NEW.user_id;
  
  -- Get event title
  SELECT title INTO v_event_title
  FROM public.events
  WHERE id = NEW.related_entity_id::UUID;
  
  -- Skip if we don't have the info
  IF v_user_name IS NULL OR v_event_title IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Notify all friends who are also interested in this event
  FOR v_friend_id IN
    SELECT r.related_entity_id::UUID
    FROM public.relationships r
    WHERE r.user_id = NEW.user_id
      AND r.related_entity_type = 'user'
      AND r.relationship_type = 'friend'
      AND r.status = 'accepted'
      AND EXISTS (
        SELECT 1 FROM public.relationships r2
        WHERE r2.user_id = r.related_entity_id::UUID
          AND r2.related_entity_type = 'event'
          AND r2.related_entity_id = NEW.related_entity_id
          AND r2.relationship_type IN ('interest', 'going', 'maybe')
          AND (r2.relationship_type != NEW.relationship_type OR r2.metadata->>'rsvp_status' != NEW.metadata->>'rsvp_status')
      )
  LOOP
    INSERT INTO public.notifications (
      user_id,
      type,
      title,
      message,
      data,
      created_at
    ) VALUES (
      v_friend_id,
      'friend_rsvp_going',
      'Friend ' || CASE WHEN NEW.relationship_type = 'going' THEN 'Going!' ELSE 'Maybe Going' END,
      v_user_name || ' is ' || CASE WHEN NEW.relationship_type = 'going' THEN 'going to' ELSE 'maybe going to' END || ' "' || v_event_title || '"',
      jsonb_build_object(
        'friend_id', NEW.user_id,
        'friend_name', v_user_name,
        'event_id', NEW.related_entity_id::UUID,
        'event_title', v_event_title,
        'rsvp_status', NEW.relationship_type
      ),
      now()
    );
  END LOOP;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for event interest notifications
-- Triggers were already dropped above, now create them fresh

CREATE TRIGGER notify_friend_event_interest_insert_trigger
  AFTER INSERT ON public.relationships
  FOR EACH ROW
  WHEN (NEW.related_entity_type = 'event' AND NEW.relationship_type IN ('going', 'maybe'))
  EXECUTE FUNCTION public.notify_friends_event_interest();

CREATE TRIGGER notify_friend_event_interest_update_trigger
  AFTER UPDATE ON public.relationships
  FOR EACH ROW
  WHEN (NEW.related_entity_type = 'event' AND NEW.relationship_type IN ('going', 'maybe') AND (OLD.relationship_type IS NULL OR OLD.relationship_type != NEW.relationship_type))
  EXECUTE FUNCTION public.notify_friends_event_interest();

-- ============================================
-- 4.3.5 UPDATE ANALYTICS AGGREGATION TRIGGERS
-- ============================================

-- Update analytics aggregation triggers
-- Note: These triggers should fire when interactions are created
CREATE OR REPLACE FUNCTION public.trigger_aggregate_analytics()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
BEGIN
  -- Trigger daily analytics aggregation
  -- Note: This is a simplified version - the full aggregation should be done by a scheduled job
  PERFORM public.aggregate_daily_analytics(DATE(NEW.occurred_at));
  
  RETURN NEW;
END;
$function$;

-- Create trigger for analytics aggregation
DROP TRIGGER IF EXISTS trigger_aggregate_analytics_on_interaction ON public.interactions;
CREATE TRIGGER trigger_aggregate_analytics_on_interaction
  AFTER INSERT ON public.interactions
  FOR EACH ROW
  EXECUTE FUNCTION public.trigger_aggregate_analytics();

-- ============================================
-- 4.3.6 UPDATE MUSIC PREFERENCE TRIGGERS
-- ============================================

-- Update music preference triggers
-- Note: music_preference_signals is migrated to user_preferences.music_preference_signals
-- These triggers should update user_preferences.music_preference_signals when reviews, relationships, etc. are created/updated
CREATE OR REPLACE FUNCTION public.trigger_update_music_preferences()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user_id based on which table the trigger is on
  -- reviews and relationships tables both have user_id as a required field
  v_user_id := NEW.user_id;
  
  -- Only try to access metadata if user_id is NULL and table might have metadata column
  -- Note: reviews table doesn't have metadata, it has moderation_metadata
  -- relationships table has metadata, but user_id should always be present
  IF v_user_id IS NULL AND TG_TABLE_NAME = 'relationships' THEN
    -- Fallback for relationships (shouldn't be needed, but safe)
    v_user_id := (NEW.metadata->>'user_id')::UUID;
  END IF;
  
  -- Only update if we have a valid user_id
  IF v_user_id IS NOT NULL THEN
    UPDATE public.user_preferences
    SET updated_at = now()
    WHERE user_id = v_user_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for music preference updates on reviews
DROP TRIGGER IF EXISTS trigger_update_music_preferences_on_review ON public.reviews;
CREATE TRIGGER trigger_update_music_preferences_on_review
  AFTER INSERT OR UPDATE ON public.reviews
  FOR EACH ROW
  WHEN (NEW.is_draft = false)
  EXECUTE FUNCTION public.trigger_update_music_preferences();

-- Create trigger for music preference updates on relationships
DROP TRIGGER IF EXISTS trigger_update_music_preferences_on_relationship ON public.relationships;
CREATE TRIGGER trigger_update_music_preferences_on_relationship
  AFTER INSERT OR UPDATE ON public.relationships
  FOR EACH ROW
  WHEN (NEW.related_entity_type IN ('artist', 'venue', 'event'))
  EXECUTE FUNCTION public.trigger_update_music_preferences();

-- ============================================
-- 4.3.7 UPDATE RECOMMENDATION TRIGGERS
-- ============================================

-- Update recommendation triggers
-- Note: user_recommendations_cache is migrated to user_preferences.recommendation_cache
-- These triggers should refresh recommendations when relationships change
CREATE OR REPLACE FUNCTION public.trigger_refresh_recommendations()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_user_id UUID;
BEGIN
  -- Get user_id based on which table the trigger is on
  -- relationships table has user_id as a required field
  v_user_id := NEW.user_id;
  
  -- Only try to access metadata if user_id is NULL (shouldn't happen, but safe fallback)
  IF v_user_id IS NULL AND TG_TABLE_NAME = 'relationships' THEN
    -- Fallback for relationships (shouldn't be needed, but safe)
    v_user_id := (NEW.metadata->>'user_id')::UUID;
  END IF;
  
  -- Only update if we have a valid user_id
  IF v_user_id IS NOT NULL THEN
    UPDATE public.user_preferences
    SET updated_at = now()
    WHERE user_id = v_user_id;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create triggers for recommendation updates on relationships
-- Separate triggers for INSERT, DELETE, and UPDATE to avoid NEW/OLD reference issues
DROP TRIGGER IF EXISTS trigger_refresh_recommendations_on_relationship_insert ON public.relationships;
DROP TRIGGER IF EXISTS trigger_refresh_recommendations_on_relationship_delete ON public.relationships;
DROP TRIGGER IF EXISTS trigger_refresh_recommendations_on_relationship_update ON public.relationships;

CREATE TRIGGER trigger_refresh_recommendations_on_relationship_insert
  AFTER INSERT ON public.relationships
  FOR EACH ROW
  WHEN (NEW.related_entity_type = 'user')
  EXECUTE FUNCTION public.trigger_refresh_recommendations();

CREATE TRIGGER trigger_refresh_recommendations_on_relationship_delete
  AFTER DELETE ON public.relationships
  FOR EACH ROW
  WHEN (OLD.related_entity_type = 'user')
  EXECUTE FUNCTION public.trigger_refresh_recommendations();

CREATE TRIGGER trigger_refresh_recommendations_on_relationship_update
  AFTER UPDATE ON public.relationships
  FOR EACH ROW
  WHEN (NEW.related_entity_type = 'user' OR OLD.related_entity_type = 'user')
  EXECUTE FUNCTION public.trigger_refresh_recommendations();

-- Create triggers for recommendation updates on event interests
-- Separate triggers for INSERT, DELETE, and UPDATE to avoid NEW/OLD reference issues
DROP TRIGGER IF EXISTS trigger_refresh_recommendations_on_event_interest_insert ON public.relationships;
DROP TRIGGER IF EXISTS trigger_refresh_recommendations_on_event_interest_delete ON public.relationships;
DROP TRIGGER IF EXISTS trigger_refresh_recommendations_on_event_interest_update ON public.relationships;

CREATE TRIGGER trigger_refresh_recommendations_on_event_interest_insert
  AFTER INSERT ON public.relationships
  FOR EACH ROW
  WHEN (NEW.related_entity_type = 'event')
  EXECUTE FUNCTION public.trigger_refresh_recommendations();

CREATE TRIGGER trigger_refresh_recommendations_on_event_interest_delete
  AFTER DELETE ON public.relationships
  FOR EACH ROW
  WHEN (OLD.related_entity_type = 'event')
  EXECUTE FUNCTION public.trigger_refresh_recommendations();

CREATE TRIGGER trigger_refresh_recommendations_on_event_interest_update
  AFTER UPDATE ON public.relationships
  FOR EACH ROW
  WHEN (NEW.related_entity_type = 'event' OR OLD.related_entity_type = 'event')
  EXECUTE FUNCTION public.trigger_refresh_recommendations();

-- ============================================
-- 4.3.8 UPDATE ADDITIONAL NOTIFICATION FUNCTIONS
-- ============================================

-- Update notify_event_share function
DROP FUNCTION IF EXISTS public.notify_event_share() CASCADE;

CREATE OR REPLACE FUNCTION public.notify_event_share()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_sharer_name TEXT;
  v_sharer_avatar TEXT;
  v_event_title TEXT;
  v_event_artist TEXT;
  v_event_date TEXT;
  v_chat_participants UUID[];
BEGIN
  -- Only process event share messages
  IF NEW.message_type != 'event_share' OR NEW.shared_event_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Get sharer info
  SELECT name, avatar_url INTO v_sharer_name, v_sharer_avatar
  FROM public.users
  WHERE user_id = NEW.sender_id;

  -- Get event info
  SELECT title, artist_name, event_date::text
  INTO v_event_title, v_event_artist, v_event_date
  FROM public.events
  WHERE id = NEW.shared_event_id;

  -- Get all participants in this chat (except the sender)
  SELECT users INTO v_chat_participants
  FROM public.chats
  WHERE id = NEW.chat_id;

  -- Notify all participants except the sender
  IF v_chat_participants IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
    SELECT
      user_id,
      'event_share',
      'Event Shared 🎵',
      COALESCE(v_sharer_name, 'Someone') || ' shared "' || COALESCE(v_event_title, 'an event') || '" with you',
      jsonb_build_object(
        'sharer_id', NEW.sender_id,
        'sharer_name', v_sharer_name,
        'sharer_avatar', v_sharer_avatar,
        'event_id', NEW.shared_event_id,
        'event_title', v_event_title,
        'event_artist', v_event_artist,
        'event_date', v_event_date,
        'chat_id', NEW.chat_id,
        'message_id', NEW.id
      ),
      NEW.sender_id
    FROM unnest(v_chat_participants) AS user_id
    WHERE user_id != NEW.sender_id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Update notify_group_chat_invite function (only if event_groups table exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'event_groups'
  ) THEN
    -- Function only makes sense if event_groups table exists
    DROP FUNCTION IF EXISTS public.notify_group_chat_invite() CASCADE;

    EXECUTE '
    CREATE OR REPLACE FUNCTION public.notify_group_chat_invite()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $function$
    DECLARE
      v_event_title TEXT;
      v_adder_name TEXT;
    BEGIN
      -- Get event info if this is an event group
      SELECT e.title INTO v_event_title
      FROM public.event_groups eg
      LEFT JOIN public.events e ON eg.event_id = e.id
      WHERE eg.id = NEW.group_id;

      -- Get person who added them
      SELECT name INTO v_adder_name
      FROM public.users
      WHERE user_id = auth.uid();

      -- Notify the new member
      INSERT INTO public.notifications (user_id, type, title, message, data, actor_user_id)
      VALUES (
        NEW.user_id,
        ''group_chat_invite'',
        ''Added to Group Chat 💬'',
        COALESCE(v_adder_name, ''Someone'') || '' added you to a group for "'' || COALESCE(v_event_title, ''an event'') || ''"'',
        jsonb_build_object(
          ''group_id'', NEW.group_id,
          ''event_id'', (SELECT event_id FROM public.event_groups WHERE id = NEW.group_id),
          ''event_title'', v_event_title,
          ''adder_id'', auth.uid(),
          ''adder_name'', v_adder_name
        ),
        auth.uid()
      );

      RETURN NEW;
    END;
    $function$';
  END IF;
END $$;

-- Update update_event_promotion_fields function (only if event_promotions table exists)
-- Note: This function is only needed if event_promotions table still exists
-- If promotions were consolidated into monetization_tracking, this may not be needed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'event_promotions'
  ) THEN
    DROP FUNCTION IF EXISTS public.update_event_promotion_fields() CASCADE;

    EXECUTE '
    CREATE OR REPLACE FUNCTION public.update_event_promotion_fields()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $function$
    BEGIN
      -- Handle INSERT of new active promotions
      IF TG_OP = ''INSERT'' AND NEW.promotion_status = ''active'' THEN
        -- Set event as promoted immediately
        UPDATE public.events
        SET 
          promoted = true,
          promotion_tier = NEW.promotion_tier,
          promotion_start_date = NEW.starts_at,
          promotion_end_date = NEW.expires_at,
          updated_at = now()
        WHERE id = NEW.event_id;
      END IF;
      
      -- Handle UPDATE of promotion status
      IF TG_OP = ''UPDATE'' AND OLD.promotion_status != NEW.promotion_status THEN
        IF NEW.promotion_status = ''active'' THEN
          -- Set event as promoted
          UPDATE public.events
          SET 
            promoted = true,
            promotion_tier = NEW.promotion_tier,
            promotion_start_date = NEW.starts_at,
            promotion_end_date = NEW.expires_at,
            updated_at = now()
          WHERE id = NEW.event_id;
        ELSIF NEW.promotion_status IN (''expired'', ''paused'', ''rejected'', ''cancelled'') THEN
          -- Remove promotion from event
          UPDATE public.events
          SET 
            promoted = false,
            promotion_tier = NULL,
            promotion_start_date = NULL,
            promotion_end_date = NULL,
            updated_at = now()
          WHERE id = NEW.event_id;
        END IF;
      END IF;

      RETURN COALESCE(NEW, OLD);
    END;
    $function$';
  END IF;
END $$;

-- Recreate triggers for these functions
DROP TRIGGER IF EXISTS notify_event_share_trigger ON public.messages;
CREATE TRIGGER notify_event_share_trigger
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_event_share();

-- Create trigger for event_group_members only if the table and function exist
-- Note: This table may not exist in all consolidated schemas
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'event_group_members'
  ) AND EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.proname = 'notify_group_chat_invite'
  ) THEN
    DROP TRIGGER IF EXISTS notify_group_chat_invite_trigger ON public.event_group_members;
    CREATE TRIGGER notify_group_chat_invite_trigger
      AFTER INSERT ON public.event_group_members
      FOR EACH ROW
      EXECUTE FUNCTION public.notify_group_chat_invite();
  END IF;
END $$;

-- Create trigger for event_promotions only if the table and function exist
-- Note: event_promotions was consolidated into monetization_tracking table
-- This trigger may not be needed if promotions are handled differently now
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'event_promotions'
  ) AND EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' 
    AND p.proname = 'update_event_promotion_fields'
  ) THEN
    DROP TRIGGER IF EXISTS trigger_update_event_promotion_fields ON public.event_promotions;
    CREATE TRIGGER trigger_update_event_promotion_fields
      AFTER INSERT OR UPDATE OF promotion_status ON public.event_promotions
      FOR EACH ROW
      EXECUTE FUNCTION public.update_event_promotion_fields();
  END IF;
END $$;

-- ============================================
-- VERIFICATION QUERIES
-- ============================================

-- First, verify that functions don't reference old tables
-- Check function definitions (not just trigger definitions)
-- Only check for actual table references (FROM/UPDATE/INSERT INTO), not engagement type strings
SELECT 
  'Functions referencing old tables' as status,
  p.proname as function_name
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND (
    -- Check for actual table references, not just string matches
    (pg_get_functiondef(p.oid) LIKE '%FROM%profiles%' OR pg_get_functiondef(p.oid) LIKE '%FROM public.profiles%')
    OR (pg_get_functiondef(p.oid) LIKE '%FROM%jambase_events%' OR pg_get_functiondef(p.oid) LIKE '%FROM public.jambase_events%')
    OR (pg_get_functiondef(p.oid) LIKE '%UPDATE%profiles%' OR pg_get_functiondef(p.oid) LIKE '%UPDATE public.profiles%')
    OR (pg_get_functiondef(p.oid) LIKE '%UPDATE%jambase_events%' OR pg_get_functiondef(p.oid) LIKE '%UPDATE public.jambase_events%')
    OR (pg_get_functiondef(p.oid) LIKE '%INSERT INTO%profiles%' OR pg_get_functiondef(p.oid) LIKE '%INSERT INTO public.profiles%')
    OR (pg_get_functiondef(p.oid) LIKE '%INSERT INTO%jambase_events%' OR pg_get_functiondef(p.oid) LIKE '%INSERT INTO public.jambase_events%')
    OR (pg_get_functiondef(p.oid) LIKE '%FROM%user_reviews%' OR pg_get_functiondef(p.oid) LIKE '%FROM public.user_reviews%')
    OR (pg_get_functiondef(p.oid) LIKE '%UPDATE%user_reviews%' OR pg_get_functiondef(p.oid) LIKE '%UPDATE public.user_reviews%')
    OR (pg_get_functiondef(p.oid) LIKE '%FROM%review_likes%' OR pg_get_functiondef(p.oid) LIKE '%FROM public.review_likes%')
    OR (pg_get_functiondef(p.oid) LIKE '%FROM%comment_likes%' OR pg_get_functiondef(p.oid) LIKE '%FROM public.comment_likes%')
    OR (pg_get_functiondef(p.oid) LIKE '%FROM%user_jambase_events%' OR pg_get_functiondef(p.oid) LIKE '%FROM public.user_jambase_events%')
  )
  AND p.proname IN ('update_review_counts', 'update_comment_likes_count', 'notify_friends_event_interest', 'notify_friend_request', 'notify_friend_accepted', 'notify_event_share', 'notify_group_chat_invite', 'update_event_promotion_fields');

-- Verify all triggers updated (check both trigger definitions and function definitions)
SELECT 
  'Triggers updated' as status,
  COUNT(*) as trigger_count
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND (
    pg_get_triggerdef(t.oid) LIKE '%users_new%'
    OR pg_get_triggerdef(t.oid) LIKE '%events_new%'
    OR pg_get_triggerdef(t.oid) LIKE '%artists_new%'
    OR pg_get_triggerdef(t.oid) LIKE '%venues_new%'
    OR pg_get_triggerdef(t.oid) LIKE '%relationships_new%'
    OR pg_get_triggerdef(t.oid) LIKE '%reviews_new%'
    OR pg_get_triggerdef(t.oid) LIKE '%comments_new%'
    OR pg_get_triggerdef(t.oid) LIKE '%engagements_new%'
    OR pg_get_triggerdef(t.oid) LIKE '%interactions_new%'
    OR pg_get_triggerdef(t.oid) LIKE '%analytics_daily_new%'
    OR pg_get_triggerdef(t.oid) LIKE '%user_preferences_new%'
    OR pg_get_functiondef(p.oid) LIKE '%reviews_new%'
    OR pg_get_functiondef(p.oid) LIKE '%comments_new%'
    OR pg_get_functiondef(p.oid) LIKE '%engagements_new%'
    OR pg_get_functiondef(p.oid) LIKE '%users_new%'
    OR pg_get_functiondef(p.oid) LIKE '%events_new%'
  );

-- List all triggers that still reference old table names
-- Check ONLY function definitions for actual SQL table references (FROM/UPDATE/INSERT INTO/DELETE FROM)
-- Do NOT check trigger definitions as they may contain trigger names that match old table names
SELECT 
  'Triggers still referencing old tables' as status,
  t.tgname as trigger_name,
  c.relname as table_name,
  p.proname as function_name
FROM pg_trigger t
JOIN pg_class c ON t.tgrelid = c.oid
JOIN pg_namespace n ON c.relnamespace = n.oid
JOIN pg_proc p ON t.tgfoid = p.oid
WHERE n.nspname = 'public'
  AND NOT t.tgisinternal
  AND (
    -- Check function definition for actual SQL table references only
    -- Check for FROM clauses
    (pg_get_functiondef(p.oid) LIKE '%FROM public.profiles%' OR pg_get_functiondef(p.oid) LIKE '% FROM profiles%')
    OR (pg_get_functiondef(p.oid) LIKE '%FROM public.jambase_events%' OR pg_get_functiondef(p.oid) LIKE '% FROM jambase_events%')
    OR (pg_get_functiondef(p.oid) LIKE '%FROM public.user_reviews%' OR pg_get_functiondef(p.oid) LIKE '% FROM user_reviews%')
    OR (pg_get_functiondef(p.oid) LIKE '%FROM public.review_likes%' OR pg_get_functiondef(p.oid) LIKE '% FROM review_likes%')
    OR (pg_get_functiondef(p.oid) LIKE '%FROM public.comment_likes%' OR pg_get_functiondef(p.oid) LIKE '% FROM comment_likes%')
    OR (pg_get_functiondef(p.oid) LIKE '%FROM public.user_jambase_events%' OR pg_get_functiondef(p.oid) LIKE '% FROM user_jambase_events%')
    -- Check for UPDATE clauses
    OR (pg_get_functiondef(p.oid) LIKE '%UPDATE public.profiles%' OR pg_get_functiondef(p.oid) LIKE '% UPDATE profiles%')
    OR (pg_get_functiondef(p.oid) LIKE '%UPDATE public.jambase_events%' OR pg_get_functiondef(p.oid) LIKE '% UPDATE jambase_events%')
    OR (pg_get_functiondef(p.oid) LIKE '%UPDATE public.user_reviews%' OR pg_get_functiondef(p.oid) LIKE '% UPDATE user_reviews%')
    OR (pg_get_functiondef(p.oid) LIKE '%UPDATE public.review_likes%' OR pg_get_functiondef(p.oid) LIKE '% UPDATE review_likes%')
    OR (pg_get_functiondef(p.oid) LIKE '%UPDATE public.comment_likes%' OR pg_get_functiondef(p.oid) LIKE '% UPDATE comment_likes%')
    OR (pg_get_functiondef(p.oid) LIKE '%UPDATE public.user_jambase_events%' OR pg_get_functiondef(p.oid) LIKE '% UPDATE user_jambase_events%')
    -- Check for INSERT INTO clauses
    OR (pg_get_functiondef(p.oid) LIKE '%INSERT INTO public.profiles%' OR pg_get_functiondef(p.oid) LIKE '%INSERT INTO profiles%')
    OR (pg_get_functiondef(p.oid) LIKE '%INSERT INTO public.jambase_events%' OR pg_get_functiondef(p.oid) LIKE '%INSERT INTO jambase_events%')
    OR (pg_get_functiondef(p.oid) LIKE '%INSERT INTO public.user_reviews%' OR pg_get_functiondef(p.oid) LIKE '%INSERT INTO user_reviews%')
    -- Check for DELETE FROM clauses
    OR (pg_get_functiondef(p.oid) LIKE '%DELETE FROM public.profiles%' OR pg_get_functiondef(p.oid) LIKE '%DELETE FROM profiles%')
    OR (pg_get_functiondef(p.oid) LIKE '%DELETE FROM public.jambase_events%' OR pg_get_functiondef(p.oid) LIKE '%DELETE FROM jambase_events%')
    OR (pg_get_functiondef(p.oid) LIKE '%DELETE FROM public.user_reviews%' OR pg_get_functiondef(p.oid) LIKE '%DELETE FROM user_reviews%')
  );

