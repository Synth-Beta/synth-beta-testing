-- Threaded comment replies: store mention targets + fire comment_replied on
-- the unified `comments` table (legacy trigger only existed on deleted review_comments).
-- Also dedupe review_commented when the review owner is already notified via reply.

-- ── Mention targets (user ids referenced by @mentions in comment_text) ───────
ALTER TABLE public.comments
  ADD COLUMN IF NOT EXISTS mentioned_user_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_comments_parent_comment_id
  ON public.comments (parent_comment_id)
  WHERE parent_comment_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_comments_mentioned_user_ids
  ON public.comments USING GIN (mentioned_user_ids);

-- ── Reply notification (notify the person being replied to) ──────────────────
CREATE OR REPLACE FUNCTION public.create_comment_reply_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_type   text;
  v_review_id     uuid;
  v_event_title   text;
  v_actor_name    text;
  v_preview       text;
  v_target_id     uuid;
  v_parent_author uuid;
  v_targets       uuid[];
BEGIN
  -- Only replies
  IF NEW.parent_comment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT e.entity_type, e.entity_uuid
  INTO v_entity_type, v_review_id
  FROM public.entities e
  WHERE e.id = NEW.entity_id;

  -- Reply notifications are for review comment threads today
  IF v_entity_type IS DISTINCT FROM 'review' OR v_review_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(ev.title, 'a review')
  INTO v_event_title
  FROM public.reviews r
  LEFT JOIN public.events ev ON ev.id = r.event_id
  WHERE r.id = v_review_id;

  SELECT COALESCE(name, 'Someone') INTO v_actor_name
  FROM public.users WHERE user_id = NEW.user_id;

  v_preview := LEFT(COALESCE(NEW.comment_text, ''), 50);
  -- Strip mention tokens from preview for readability
  v_preview := regexp_replace(v_preview, '@\[[^\]]*\]\(user:[0-9a-f-]{36}\)', '@…', 'gi');
  IF LENGTH(COALESCE(NEW.comment_text, '')) > 50 THEN
    v_preview := v_preview || '...';
  END IF;

  -- Prefer explicit @mention targets (the person Reply was clicked on).
  -- Fall back to the parent comment author when mentions are missing.
  SELECT c.user_id INTO v_parent_author
  FROM public.comments c
  WHERE c.id = NEW.parent_comment_id;

  v_targets := COALESCE(
    ARRAY(
      SELECT DISTINCT m
      FROM unnest(COALESCE(NEW.mentioned_user_ids, '{}'::uuid[])) AS m
      WHERE m IS NOT NULL AND m <> NEW.user_id
    ),
    '{}'::uuid[]
  );

  IF COALESCE(array_length(v_targets, 1), 0) = 0
     AND v_parent_author IS NOT NULL
     AND v_parent_author <> NEW.user_id THEN
    v_targets := ARRAY[v_parent_author];
  END IF;

  FOREACH v_target_id IN ARRAY v_targets LOOP
    INSERT INTO public.notifications (
      user_id, type, title, message, data, review_id, comment_id, actor_user_id
    ) VALUES (
      v_target_id,
      'comment_replied',
      'Reply to Your Comment 🔄',
      COALESCE(v_actor_name, 'Someone') || ' replied to your comment: "' || v_preview || '"',
      jsonb_build_object(
        'review_id', v_review_id,
        'comment_id', NEW.id,
        'parent_comment_id', NEW.parent_comment_id,
        'actor_id', NEW.user_id,
        'actor_name', v_actor_name,
        'event_title', v_event_title,
        'comment_preview', v_preview
      ),
      v_review_id,
      NEW.id,
      NEW.user_id
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'create_comment_reply_notification failed for comment %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_comment_reply_notification ON public.comments;
DROP TRIGGER IF EXISTS create_comment_reply_notification_trigger ON public.comments;
CREATE TRIGGER trg_comment_reply_notification
  AFTER INSERT ON public.comments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_comment_reply_notification();

-- ── Review owner comment notif: skip when owner already gets comment_replied ─
CREATE OR REPLACE FUNCTION public.create_review_comment_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entity_type text;
  v_review_id   uuid;
  v_owner_id    uuid;
  v_event_title text;
  v_actor_name  text;
  v_preview     text;
  v_reply_targets uuid[];
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

  -- Dedupe: if this is a reply and the review owner is already a reply-notification
  -- target (mentioned or parent author), skip review_commented so they get one notif.
  IF NEW.parent_comment_id IS NOT NULL THEN
    v_reply_targets := COALESCE(
      ARRAY(
        SELECT DISTINCT m
        FROM unnest(COALESCE(NEW.mentioned_user_ids, '{}'::uuid[])) AS m
        WHERE m IS NOT NULL AND m <> NEW.user_id
      ),
      '{}'::uuid[]
    );
    IF COALESCE(array_length(v_reply_targets, 1), 0) = 0 THEN
      SELECT ARRAY[c.user_id]
      INTO v_reply_targets
      FROM public.comments c
      WHERE c.id = NEW.parent_comment_id
        AND c.user_id IS DISTINCT FROM NEW.user_id;
    END IF;

    IF v_owner_id = ANY (COALESCE(v_reply_targets, '{}'::uuid[])) THEN
      RETURN NEW;
    END IF;
  END IF;

  SELECT COALESCE(name, 'Someone') INTO v_actor_name
  FROM public.users WHERE user_id = NEW.user_id;

  v_preview := LEFT(COALESCE(NEW.comment_text, ''), 50);
  v_preview := regexp_replace(v_preview, '@\[[^\]]*\]\(user:[0-9a-f-]{36}\)', '@…', 'gi');
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
      'parent_comment_id', NEW.parent_comment_id,
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
