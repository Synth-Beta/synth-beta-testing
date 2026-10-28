-- Notify users when they unlock a passport stamp or achievement tier.
-- If they are the first Synth user ever to receive that stamp/achievement,
-- phrase the notification accordingly.
--
-- Hooks:
--   * AFTER INSERT on passport_entries → stamp_unlocked
--   * AFTER INSERT OR UPDATE on user_achievement_progress → achievement_unlocked
--     only when highest_tier_achieved increases (null→bronze, bronze→silver, etc.)
--
-- Backfills can silence these with:
--   SET LOCAL synth.skip_passport_notifications = '1';
--
-- Safe to re-run. Never blocks stamp/achievement writes (errors → WARNING).

-- ---------------------------------------------------------------------------
-- Notification types (widening only; same list as 20261017140000 + new two)
-- ---------------------------------------------------------------------------
ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check CHECK (type = ANY (ARRAY[
  'friend_request', 'friend_accepted', 'match', 'message', 'chat_message',
  'review_liked', 'review_commented', 'comment_replied', 'event_interest',
  'artist_followed', 'artist_new_event', 'venue_new_event', 'bucket_list_new_event',
  'friend_tagged_in_review', 'follows_new_events_summary', 'friends_event_interest_summary',
  'bucket_list_new_events_summary', 'event_reminder_1_week', 'event_reminder_3_days',
  'event_reminder_1_day', 'event_reminder_day_after',
  'reengagement', 'week1_nudge',
  'stamp_unlocked', 'achievement_unlocked'
]::text[]));

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.achievement_tier_rank(p_tier text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE lower(coalesce(p_tier, ''))
    WHEN 'bronze' THEN 1
    WHEN 'silver' THEN 2
    WHEN 'gold' THEN 3
    ELSE 0
  END;
$$;

CREATE OR REPLACE FUNCTION public.passport_notifications_suppressed()
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RETURN coalesce(nullif(current_setting('synth.skip_passport_notifications', true), ''), '0') IN ('1', 'true', 'on');
EXCEPTION WHEN others THEN
  RETURN false;
END;
$$;

-- ---------------------------------------------------------------------------
-- Stamp unlock notifications
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_stamp_unlocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_first boolean := false;
  v_title text;
  v_message text;
  v_entity text;
  v_type_label text;
BEGIN
  IF public.passport_notifications_suppressed() THEN
    RETURN NEW;
  END IF;

  v_entity := coalesce(nullif(trim(NEW.entity_name), ''), 'a new place');
  v_type_label := CASE NEW.type
    WHEN 'artist' THEN 'artist'
    WHEN 'venue' THEN 'venue'
    WHEN 'city' THEN 'city'
    WHEN 'scene' THEN 'scene'
    WHEN 'era' THEN 'era'
    ELSE 'passport'
  END;

  -- First Synth user ever for this stamp entity (exclude this row).
  -- Match on entity_uuid when present, else entity_id (cities/scenes often lack uuid).
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.passport_entries pe
    WHERE pe.id IS DISTINCT FROM NEW.id
      AND pe.type = NEW.type
      AND (
        (NEW.entity_uuid IS NOT NULL AND pe.entity_uuid = NEW.entity_uuid)
        OR (
          NEW.entity_id IS NOT NULL
          AND pe.entity_id IS NOT DISTINCT FROM NEW.entity_id
        )
      )
  ) INTO v_is_first;

  IF v_is_first THEN
    v_title := 'First on Synth!';
    v_message := 'You''re the first to unlock the ' || v_entity || ' ' || v_type_label || ' stamp';
  ELSE
    v_title := 'New stamp unlocked';
    v_message := 'You unlocked the ' || v_entity || ' ' || v_type_label || ' stamp';
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.user_id,
    'stamp_unlocked',
    v_title,
    v_message,
    jsonb_build_object(
      'stamp_id', NEW.id,
      'stamp_type', NEW.type,
      'entity_id', NEW.entity_id,
      'entity_uuid', NEW.entity_uuid,
      'entity_name', NEW.entity_name,
      'is_first', v_is_first,
      'passport_section', 'stamps'
    )
  );

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'notify_stamp_unlocked failed for passport_entries %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_stamp_unlocked ON public.passport_entries;
CREATE TRIGGER trg_notify_stamp_unlocked
  AFTER INSERT ON public.passport_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_stamp_unlocked();

-- ---------------------------------------------------------------------------
-- Achievement unlock notifications (new / higher tier only)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_achievement_unlocked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old_rank integer := 0;
  v_new_rank integer := 0;
  v_is_first boolean := false;
  v_name text;
  v_key text;
  v_tier text;
  v_tier_label text;
  v_title text;
  v_message text;
BEGIN
  IF public.passport_notifications_suppressed() THEN
    RETURN NEW;
  END IF;

  v_new_rank := public.achievement_tier_rank(NEW.highest_tier_achieved);
  IF TG_OP = 'UPDATE' THEN
    v_old_rank := public.achievement_tier_rank(OLD.highest_tier_achieved);
  END IF;

  -- Only fire when the user newly reaches a tier, or climbs to a higher one.
  IF v_new_rank = 0 OR v_new_rank <= v_old_rank THEN
    RETURN NEW;
  END IF;

  v_tier := lower(NEW.highest_tier_achieved);
  v_tier_label := initcap(v_tier);

  SELECT a.name, a.achievement_key
  INTO v_name, v_key
  FROM public.achievements a
  WHERE a.id = NEW.achievement_id;

  v_name := coalesce(nullif(trim(v_name), ''), coalesce(v_key, 'an achievement'));

  -- First Synth user ever to unlock this achievement (any tier).
  SELECT NOT EXISTS (
    SELECT 1
    FROM public.user_achievement_progress uap
    WHERE uap.achievement_id = NEW.achievement_id
      AND uap.user_id IS DISTINCT FROM NEW.user_id
      AND public.achievement_tier_rank(uap.highest_tier_achieved) > 0
  ) INTO v_is_first;

  IF v_is_first AND v_old_rank = 0 THEN
    v_title := 'First on Synth!';
    v_message := 'You''re the first to unlock ' || v_name;
  ELSE
    v_title := 'Achievement unlocked';
    v_message := 'You unlocked ' || v_name || ' — ' || v_tier_label;
  END IF;

  INSERT INTO public.notifications (user_id, type, title, message, data)
  VALUES (
    NEW.user_id,
    'achievement_unlocked',
    v_title,
    v_message,
    jsonb_build_object(
      'achievement_id', NEW.achievement_id,
      'achievement_key', v_key,
      'achievement_name', v_name,
      'tier', v_tier,
      'is_first', v_is_first AND v_old_rank = 0,
      'passport_section', 'achievements'
    )
  );

  RETURN NEW;
EXCEPTION WHEN others THEN
  RAISE WARNING 'notify_achievement_unlocked failed for user % achievement %: %',
    NEW.user_id, NEW.achievement_id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_achievement_unlocked ON public.user_achievement_progress;
CREATE TRIGGER trg_notify_achievement_unlocked
  AFTER INSERT OR UPDATE OF highest_tier_achieved ON public.user_achievement_progress
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_achievement_unlocked();

-- ---------------------------------------------------------------------------
-- Quiet stamp backfills (historical unlock_* loops)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.backfill_passport_stamps()
 RETURNS TABLE(reviews_processed integer, stamps_before integer, stamps_after integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  r             RECORD;
  v_before      integer;
  v_after       integer;
  v_count       integer := 0;
  v_artist_name text;
  v_venue_name  text;
  v_city        text;
  v_state       text;
BEGIN
  PERFORM set_config('synth.skip_passport_notifications', '1', true);

  SELECT count(*) INTO v_before FROM public.passport_entries;

  FOR r IN
    SELECT user_id, artist_id, venue_id
    FROM public.reviews
    WHERE is_draft = false
      AND (artist_id IS NOT NULL OR venue_id IS NOT NULL)
  LOOP
    v_artist_name := NULL; v_venue_name := NULL; v_city := NULL; v_state := NULL;

    IF r.artist_id IS NOT NULL THEN
      SELECT a.name INTO v_artist_name FROM public.artists a WHERE a.id = r.artist_id;
      IF v_artist_name IS NOT NULL THEN
        PERFORM public.unlock_passport_artist(r.user_id, r.artist_id::text, v_artist_name);
      END IF;
    END IF;

    IF r.venue_id IS NOT NULL THEN
      SELECT v.name, v.city, v.state INTO v_venue_name, v_city, v_state
      FROM public.venues v WHERE v.id = r.venue_id;

      IF v_venue_name IS NOT NULL THEN
        PERFORM public.unlock_passport_venue(r.user_id, r.venue_id::text, v_venue_name);
      END IF;
      IF v_city IS NOT NULL AND lower(trim(v_city)) <> 'unknown' AND trim(v_city) <> '' THEN
        PERFORM public.unlock_passport_city(r.user_id, v_city, v_state);
      END IF;
    END IF;

    v_count := v_count + 1;
  END LOOP;

  SELECT count(*) INTO v_after FROM public.passport_entries;
  reviews_processed := v_count;
  stamps_before := v_before;
  stamps_after := v_after;
  RETURN NEXT;
END;
$function$;
