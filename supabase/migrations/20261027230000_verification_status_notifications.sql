-- Notify users when their account verification status becomes verified.
-- Covers every write path into user_verifications (trust-score upsert, admin
-- manual verify, account-type auto-verify) via a single AFTER trigger.
--
-- Widening notifications_type_check only (same list as 20261027220000 + verification_status).

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'friend_request', 'friend_accepted', 'match', 'message', 'chat_message',
  'review_liked', 'review_commented', 'comment_replied', 'event_interest',
  'artist_followed', 'artist_new_event', 'venue_new_event', 'bucket_list_new_event',
  'friend_tagged_in_review', 'follows_new_events_summary', 'friends_event_interest_summary',
  'bucket_list_new_events_summary', 'event_reminder_1_week', 'event_reminder_3_days',
  'event_reminder_1_day', 'event_reminder_day_after',
  'reengagement', 'week1_nudge',
  'stamp_unlocked', 'achievement_unlocked',
  'verification_status'
]::text[]));

CREATE OR REPLACE FUNCTION public.create_verification_status_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Only when verification flips on (insert already verified, or false → true).
  IF NOT COALESCE(NEW.verified, false) THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.verified, false) THEN
    RETURN NEW;
  END IF;

  -- Dedupe: at most one unread verification_status notification.
  IF EXISTS (
    SELECT 1
    FROM public.notifications n
    WHERE n.user_id = NEW.user_id
      AND n.type = 'verification_status'
      AND n.is_read = false
  ) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.user_id,
    'verification_status',
    'You''re verified! ✨',
    'Your Synth account is now verified. You''ve earned the community trust badge.',
    jsonb_build_object(
      'verified', true,
      'verification_level', NEW.verification_level,
      'trust_score', NEW.trust_score,
      'verified_at', NEW.verified_at
    )
  );

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'create_verification_status_notification failed for user %: %', NEW.user_id, SQLERRM;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_verification_status_notification ON public.user_verifications;
CREATE TRIGGER trg_verification_status_notification
  AFTER INSERT OR UPDATE OF verified ON public.user_verifications
  FOR EACH ROW
  EXECUTE FUNCTION public.create_verification_status_notification();

REVOKE ALL ON FUNCTION public.create_verification_status_notification() FROM PUBLIC, anon;
