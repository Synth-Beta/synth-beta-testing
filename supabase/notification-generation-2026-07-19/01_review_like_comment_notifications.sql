-- =============================================================================
-- 01 — Review LIKE + COMMENT notifications (rewritten for the CURRENT schema)
-- =============================================================================
-- WHY: create_review_like_notification / create_review_comment_notification existed
-- but were NEVER wired — and could not be, because they were written for a DELETED
-- schema: they read user_reviews, jambase_events, profiles (all gone) and expected a
-- NEW.review_id column on engagements/comments that does not exist. The current model
-- (from the working update_review_counts trigger) is polymorphic:
--   engagements/comments.entity_id -> entities(id) -> (entity_type, entity_uuid)
--   a review like:    entity_type='review', engagement_type='like', entity_uuid = reviews.id
--   a review comment: entity_type='review', entity_uuid = reviews.id
--   review owner = reviews.user_id ; actor name = users.name ; event title = events.title
-- The types 'review_liked' / 'review_commented' ARE already in notifications_type_check.
--
-- SAFETY: rewrites 2 SECURITY DEFINER functions + adds 2 AFTER INSERT triggers.
-- Both functions no-op unless the row is a review like/comment by someone other than
-- the review owner, so they can't break like/comment inserts. Idempotent/re-runnable.
-- Review, then apply yourself.
-- =============================================================================

-- ---- LIKES ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_review_like_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_type TEXT;
  v_review_id   UUID;
  v_owner_id    UUID;
  v_event_title TEXT;
  v_actor_name  TEXT;
BEGIN
  -- Only "like" engagements are relevant.
  IF NEW.engagement_type IS DISTINCT FROM 'like' THEN
    RETURN NEW;
  END IF;

  -- Resolve the polymorphic entity -> is it a review?
  SELECT e.entity_type, e.entity_uuid
  INTO v_entity_type, v_review_id
  FROM public.entities e
  WHERE e.id = NEW.entity_id;

  IF v_entity_type IS DISTINCT FROM 'review' OR v_review_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Review owner + event title.
  SELECT r.user_id, COALESCE(ev.title, 'your review')
  INTO v_owner_id, v_event_title
  FROM public.reviews r
  LEFT JOIN public.events ev ON ev.id = r.event_id
  WHERE r.id = v_review_id;

  -- Nobody to notify, or self-like -> skip.
  IF v_owner_id IS NULL OR v_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, 'Someone') INTO v_actor_name
  FROM public.users WHERE user_id = NEW.user_id;

  INSERT INTO public.notifications (user_id, type, title, message, data, review_id, actor_user_id)
  VALUES (
    v_owner_id,
    'review_liked',
    'Your Review Got a Like! ❤️',
    COALESCE(v_actor_name, 'Someone') || ' liked your review of ' || v_event_title,
    jsonb_build_object(
      'review_id', v_review_id,
      'actor_id', NEW.user_id,
      'actor_name', v_actor_name,
      'event_title', v_event_title
    ),
    v_review_id,
    NEW.user_id
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_review_like_notification ON public.engagements;
CREATE TRIGGER trg_review_like_notification
  AFTER INSERT ON public.engagements
  FOR EACH ROW
  EXECUTE FUNCTION public.create_review_like_notification();

-- ---- COMMENTS ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_review_comment_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_type TEXT;
  v_review_id   UUID;
  v_owner_id    UUID;
  v_event_title TEXT;
  v_actor_name  TEXT;
  v_preview     TEXT;
BEGIN
  SELECT e.entity_type, e.entity_uuid
  INTO v_entity_type, v_review_id
  FROM public.entities e
  WHERE e.id = NEW.entity_id;

  IF v_entity_type IS DISTINCT FROM 'review' OR v_review_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT r.user_id, COALESCE(ev.title, 'your review')
  INTO v_owner_id, v_event_title
  FROM public.reviews r
  LEFT JOIN public.events ev ON ev.id = r.event_id
  WHERE r.id = v_review_id;

  IF v_owner_id IS NULL OR v_owner_id = NEW.user_id THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(name, 'Someone') INTO v_actor_name
  FROM public.users WHERE user_id = NEW.user_id;

  v_preview := LEFT(COALESCE(NEW.comment_text, ''), 50);
  IF LENGTH(COALESCE(NEW.comment_text, '')) > 50 THEN
    v_preview := v_preview || '...';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data, review_id, comment_id, actor_user_id)
  VALUES (
    v_owner_id,
    'review_commented',
    'New Comment on Your Review 💬',
    COALESCE(v_actor_name, 'Someone') || ' commented on your review: "' || v_preview || '"',
    jsonb_build_object(
      'review_id', v_review_id,
      'comment_id', NEW.id,
      'actor_id', NEW.user_id,
      'actor_name', v_actor_name,
      'event_title', v_event_title,
      'comment_preview', v_preview
    ),
    v_review_id,
    NEW.id,
    NEW.user_id
  );

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_review_comment_notification ON public.comments;
CREATE TRIGGER trg_review_comment_notification
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_review_comment_notification();

-- ---- VERIFY -----------------------------------------------------------------
SELECT
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_review_like_notification')    AS like_trigger_expect_1,
  (SELECT count(*) FROM pg_trigger WHERE tgname='trg_review_comment_notification') AS comment_trigger_expect_1;

-- Smoke test (optional, in SQL editor): like one of your own reviews from another
-- account, then:  SELECT * FROM notifications WHERE type='review_liked' ORDER BY created_at DESC LIMIT 3;

-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_review_like_notification ON public.engagements;
--   DROP TRIGGER IF EXISTS trg_review_comment_notification ON public.comments;
-- (the functions can stay; they only run when their trigger fires)
