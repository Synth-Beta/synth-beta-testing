-- =============================================================================
-- 01 — Narrow + dedup the friend "event interest" notification
-- =============================================================================
-- Fix A of the "I'm interested" bug-fix pass (Phase 0).
-- Design doc: docs/superpowers/specs/2026-08-30-going-rsvp-design.md
--
-- REVIEW THIS, THEN APPLY IT YOURSELF. Nothing here is auto-applied.
--
-- Fixes three bugs in public.notify_friend_event_interest():
--
--   BUG 4 — wrong verb. The gate admits 'interested', 'going' and 'maybe', but
--     the message text is hardcoded ' is interested in "' and the type is
--     hardcoded 'event_interest'. A user marking themselves *going* notifies
--     their friends as "interested". Fixed by removing the wrong case: only a
--     genuine new 'interested' notifies. Going is carried by the digest
--     (friends_event_interest_summary), per the design doc.
--
--   BUG 5 — trigger fire condition is unknown from the repo. There is no
--     CREATE TRIGGER for this function anywhere in the codebase; migration
--     20260821010000 only replaced the function body. If the trigger is
--     AFTER INSERT, an interested->going upgrade emits nothing; if it is
--     AFTER INSERT OR UPDATE, every toggle re-notifies. The `TG_OP <> 'INSERT'`
--     clause below makes this function correct under BOTH configurations, so
--     the unknown stops mattering. STEP 0 still tells you which it is.
--
--   BUG 6 — re-heart spam. Un-hearting DELETEs the row, so re-hearting is a
--     fresh INSERT and fires a fresh notification to every friend. Today the
--     only protection is queue_or_send_notification()'s burst throttle
--     (2 per recipient per type per 10 min, then queued) — which delays the
--     spam rather than preventing it, and is per-type, not per-event. Fixed
--     with a per-(friend, event) dedup window below.
--
-- SCOPE: this file changes exactly one function. queue_or_send_notification()
-- is deliberately left alone — the repo only proves one caller, but it cannot
-- prove what else calls it in the live database, so the dedup is scoped to
-- this trigger rather than pushed down into the shared helper.
--
-- Everything not called out above (event/user lookups, the friend loop, the
-- message text, the data payload shape, SECURITY DEFINER, search_path) is
-- copied verbatim from the live definition in
-- supabase/migrations/20260821010000_wire_event_interest_notifications_to_queue.sql
-- =============================================================================


-- ---------------------------------------------------------------------------
-- STEP 0 — read-only pre-flight. Run these first, they change nothing.
-- ---------------------------------------------------------------------------

-- 0a. How is the trigger actually configured? (answers BUG 5)
--     Expect one row. Note whether it says INSERT or INSERT OR UPDATE.
SELECT tgname, pg_get_triggerdef(oid) AS triggerdef
FROM pg_trigger
WHERE tgrelid = 'public.user_event_relationships'::regclass
  AND NOT tgisinternal;

-- 0b. Do going/maybe rows already exist? This is what decides whether BUG 1
--     (the 8 narrow `.eq('interested')` read sites in the app) is currently
--     hurting real users or is still only latent.
SELECT relationship_type, count(*) AS rows
FROM public.user_event_relationships
GROUP BY 1
ORDER BY 2 DESC;

-- 0c. How much duplicate notification volume is already out there? Each row
--     returned is one friend who got told about the same event more than once.
SELECT user_id, data->>'event_id' AS event_id, count(*) AS times_notified
FROM public.notifications
WHERE type = 'event_interest'
  AND created_at > now() - interval '90 days'
GROUP BY 1, 2
HAVING count(*) > 1
ORDER BY 3 DESC
LIMIT 50;


-- ---------------------------------------------------------------------------
-- STEP 1 — the fix.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_friend_event_interest()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  friend_record RECORD;
  event_title TEXT;
  user_name TEXT;
  event_venue TEXT;
  event_date TEXT;
  event_artist TEXT;
  event_id UUID;
BEGIN
  -- CHANGED (bugs 4 + 5): was
  --   IF NEW.relationship_type NOT IN ('interested', 'going', 'maybe') THEN
  -- Only a genuine NEW interest notifies. interested->going and going->interested
  -- are UPDATEs and stay silent regardless of how the trigger is declared.
  IF TG_OP <> 'INSERT' OR NEW.relationship_type <> 'interested' THEN
    RETURN NEW;
  END IF;

  SELECT
    e.id,
    e.title,
    COALESCE(
      (SELECT v.name FROM public.venues v WHERE v.id = e.venue_id),
      e.venue_city || ', ' || e.venue_state,
      'Unknown Venue'
    ) as venue_name,
    e.event_date::text,
    COALESCE(
      (SELECT a.name FROM public.artists a WHERE a.id = e.artist_id),
      ''
    ) as artist_name
  INTO event_id, event_title, event_venue, event_date, event_artist
  FROM public.events e
  WHERE e.id = NEW.event_id;

  SELECT name INTO user_name
  FROM public.users
  WHERE user_id = NEW.user_id;

  IF event_title IS NULL OR user_name IS NULL THEN
    RETURN NEW;
  END IF;

  FOR friend_record IN
    SELECT
      CASE
        WHEN ur.user_id = NEW.user_id THEN ur.related_user_id
        ELSE ur.user_id
      END as friend_id
    FROM public.user_relationships ur
    WHERE (
      (ur.user_id = NEW.user_id AND ur.related_user_id != NEW.user_id)
      OR (ur.related_user_id = NEW.user_id AND ur.user_id != NEW.user_id)
    )
    AND ur.relationship_type = 'friend'
    AND ur.status = 'accepted'
  LOOP
    -- ADDED (bug 6): per-(friend, event) dedup. Skip this friend if they have
    -- already been told about this event in the last 30 days, or if a
    -- notification about it is still sitting undelivered in the queue.
    -- Un-heart/re-heart therefore stops re-notifying.
    IF EXISTS (
      SELECT 1
      FROM public.notifications n
      WHERE n.user_id = friend_record.friend_id
        AND n.type = 'event_interest'
        AND n.data->>'event_id' = event_id::text
        AND n.created_at > now() - interval '30 days'
    ) OR EXISTS (
      SELECT 1
      FROM public.notification_queue q
      WHERE q.user_id = friend_record.friend_id
        AND q.type = 'event_interest'
        AND q.data->>'event_id' = event_id::text
        AND q.delivered_at IS NULL
    ) THEN
      CONTINUE;
    END IF;

    PERFORM public.queue_or_send_notification(
      friend_record.friend_id,
      'event_interest',
      'Friend Interested in Event!',
      COALESCE(user_name, 'Your friend') || ' is interested in "' || event_title || '" at ' || COALESCE(event_venue, 'a venue'),
      jsonb_build_object(
        'interested_user_id', NEW.user_id,
        'event_id', event_id,
        'event_title', event_title,
        'event_venue', event_venue,
        'event_date', event_date,
        'event_artist', event_artist,
        'user_name', user_name
      ),
      NEW.user_id
    );
  END LOOP;

  RETURN NEW;
END;
$function$;


-- ---------------------------------------------------------------------------
-- STEP 2 — verify the function picked up the change.
-- ---------------------------------------------------------------------------
-- Expect to see the TG_OP gate and both EXISTS blocks in the output.
SELECT pg_get_functiondef(oid)
FROM pg_proc
WHERE proname = 'notify_friend_event_interest';


-- ---------------------------------------------------------------------------
-- NOTES
-- ---------------------------------------------------------------------------
-- INDEX: the dedup EXISTS filters on (user_id, type, created_at) first, which
-- is the same access path queue_or_send_notification() already uses for its
-- burst check, so no new index is needed — the data->>'event_id' comparison
-- runs over the handful of rows that survive that filter. If STEP 0c shows a
-- very large per-user event_interest history, revisit.
--
-- ROLLBACK: re-run the CREATE OR REPLACE from
-- supabase/migrations/20260821010000_wire_event_interest_notifications_to_queue.sql
-- (lines 114-190) to restore the previous behaviour exactly.
--
-- EDITOR: this file is safe to paste whole (single CREATE OR REPLACE plus
-- read-only SELECTs). If the editor times out, run STEP 0 queries one at a
-- time and STEP 1 on its own.
