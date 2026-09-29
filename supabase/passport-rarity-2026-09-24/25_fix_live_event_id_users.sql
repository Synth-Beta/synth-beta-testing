-- The last live event_id fallout. 2026-09-27. DDL ONLY -- safe as one run.
--
-- CORRECTION to my earlier read: the timeline is NOT starved.
-- auto_populate_passport_timeline uses LEFT JOIN events with
-- COALESCE(e.artist_id, r.artist_id), so it already falls back correctly. It
-- holds 10 rows because it only ever inserts ONE milestone per user -- their
-- first review -- and then CONTINUEs. 8 users ~= 8 rows plus 2. Working as
-- written. The sparse Timeline is a product gap; see the note at the bottom.
--
-- The three below DO have real defects, but all use LEFT JOIN, so they degrade
-- rather than return nothing. That is why nobody noticed.

-- 1. LIKE NOTIFICATION: reads "X liked your review of your review".
--    v_event_title came from COALESCE(ev.title, 'your review') via the dead
--    event_id join, then got interpolated into a message that already says
--    "your review". Resolve the show name from the review's own artist/venue.
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
  v_show_name   TEXT;
  v_actor_name  TEXT;
BEGIN
  IF NEW.engagement_type IS DISTINCT FROM 'like' THEN
    RETURN NEW;
  END IF;

  SELECT e.entity_type, e.entity_uuid
  INTO v_entity_type, v_review_id
  FROM public.entities e
  WHERE e.id = NEW.entity_id;

  IF v_entity_type IS DISTINCT FROM 'review' OR v_review_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Name the show from artist/venue on the review itself. NULL when neither
  -- resolves, so the message can omit the clause entirely.
  SELECT r.user_id,
         NULLIF(concat_ws(' @ ', a.name, v.name), '')
  INTO v_owner_id, v_show_name
  FROM public.reviews r
  LEFT JOIN public.artists a ON a.id = r.artist_id
  LEFT JOIN public.venues  v ON v.id = r.venue_id
  WHERE r.id = v_review_id;

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
    COALESCE(v_actor_name, 'Someone')
      || ' liked your review'
      || COALESCE(' of ' || v_show_name, ''),
    jsonb_build_object(
      'review_id', v_review_id,
      'actor_id', NEW.user_id,
      'actor_name', v_actor_name,
      'event_title', v_show_name
    ),
    v_review_id,
    NEW.user_id
  );

  RETURN NEW;
END;
$function$;


-- 2. COMMENT NOTIFICATION: the message never used v_event_title, so this was
--    cosmetic only -- data.event_title was always the literal 'your review'.
--    Same resolution for consistency, since clients read that payload.
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
  v_show_name   TEXT;
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

  SELECT r.user_id,
         NULLIF(concat_ws(' @ ', a.name, v.name), '')
  INTO v_owner_id, v_show_name
  FROM public.reviews r
  LEFT JOIN public.artists a ON a.id = r.artist_id
  LEFT JOIN public.venues  v ON v.id = r.venue_id
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
      'event_title', v_show_name,
      'comment_preview', v_preview
    ),
    v_review_id,
    NEW.id,
    NEW.user_id
  );

  RETURN NEW;
END;
$function$;


-- 3. DRAFT LIST: the dedupe that is supposed to hide a draft once its review is
--    published matched `r2.event_id = r.event_id`. Both are NULL, NULL = NULL is
--    unknown, so NOT EXISTS was always true and the draft was NEVER hidden.
--    Latent today (0 drafts exist) but wrong the moment anyone saves one.
--    Now matches on artist/venue, which is what identifies a show here.
CREATE OR REPLACE FUNCTION public.get_user_draft_reviews(p_user_id uuid)
 RETURNS TABLE(id uuid, event_id uuid, draft_data jsonb,
               last_saved_at timestamp with time zone, event_title text,
               artist_name text, venue_name text,
               event_date timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: cannot read another users drafts' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    r.id,
    r.event_id,
    r.draft_data,
    r.last_saved_at,
    COALESCE(r.draft_data->>'eventTitle', e.title) AS event_title,
    -- Prefer the draft's own selection, then the review's artist, then the
    -- event's. events.artist_name does not exist; always join artists.
    COALESCE(r.draft_data->'selectedArtist'->>'name', ra.name, a.name) AS artist_name,
    COALESCE(r.draft_data->'selectedVenue'->>'name',  rv.name, v.name) AS venue_name,
    COALESCE(
      CASE
        WHEN r.draft_data->>'eventDate' IS NOT NULL
        THEN (r.draft_data->>'eventDate' || 'T20:00:00Z')::TIMESTAMP WITH TIME ZONE
        ELSE NULL
      END,
      e.event_date
    ) AS event_date
  FROM public.reviews r
  LEFT JOIN public.events  e  ON e.id  = r.event_id
  LEFT JOIN public.artists ra ON ra.id = r.artist_id
  LEFT JOIN public.venues  rv ON rv.id = r.venue_id
  LEFT JOIN public.artists a  ON a.id  = e.artist_id
  LEFT JOIN public.venues  v  ON v.id  = e.venue_id
  WHERE r.user_id = p_user_id
    AND r.is_draft = true
    -- Hide a draft once a published review exists for the same show. Keyed on
    -- artist/venue because event_id is always NULL; IS NOT DISTINCT FROM so two
    -- NULLs still count as equal where that is genuinely the case.
    AND NOT EXISTS (
      SELECT 1
      FROM public.reviews r2
      WHERE r2.user_id = r.user_id
        AND r2.is_draft = false
        AND r2.review_text IS NOT NULL
        AND r2.review_text <> 'ATTENDANCE_ONLY'
        AND r2.artist_id IS NOT DISTINCT FROM r.artist_id
        AND r2.venue_id  IS NOT DISTINCT FROM r.venue_id
        AND r.artist_id IS NOT NULL
    )
  ORDER BY r.last_saved_at DESC;
END;
$function$;


-- PRODUCT GAP, NOT A BUG ---------------------------------------------------
-- The Timeline only ever auto-adds a user's FIRST review, by design -- the
-- artist/venue milestones were removed because artist_follows / venue_follows
-- did not exist at the time. Both DO exist now (artist_follows is used by
-- artistFollowService).
--
-- auto_select_timeline_highlights(p_user_id, p_limit) already exists and has
-- ZERO callers -- same situation unlock_passport_entry and unlock_passport_scene
-- were in. That is the richer selector. Wiring it is the fix for a sparse
-- Timeline, and it is a product decision about which moments deserve a slot, so
-- I have not called it blind. Inspect first:
--   SELECT pg_get_functiondef(oid) FROM pg_proc
--   WHERE proname = 'auto_select_timeline_highlights';


-- DEAD CODE, SAFE TO DROP (19) ---------------------------------------------
-- No trigger, no function caller, no client reference. Verified by triage in 23
-- plus a client grep. Superseded by get_achievement_progress and feed v5.
-- Left commented: deleting is your call, and it is not needed for correctness.
--
-- DROP FUNCTION IF EXISTS public.detect_first_through_door(uuid);
-- DROP FUNCTION IF EXISTS public.detect_road_tripper(uuid);
-- DROP FUNCTION IF EXISTS public.detect_genre_blender(uuid);
-- DROP FUNCTION IF EXISTS public.detect_early_adopter(uuid);
-- DROP FUNCTION IF EXISTS public.calculate_all_achievements();
-- DROP FUNCTION IF EXISTS public.calculate_genre_curator(uuid);
-- DROP FUNCTION IF EXISTS public.calculate_genre_specialist(uuid);
-- DROP FUNCTION IF EXISTS public.calculate_bucket_list_starter(uuid);
-- DROP FUNCTION IF EXISTS public.calculate_intentional_explorer(uuid);
-- DROP FUNCTION IF EXISTS public.calculate_festival_attendance(uuid);
-- DROP FUNCTION IF EXISTS public.calculate_artist_devotee(uuid);
-- DROP FUNCTION IF EXISTS public.calculate_venue_regular(uuid);
-- DROP FUNCTION IF EXISTS public.calculate_new_blood(uuid);
-- DROP FUNCTION IF EXISTS public.calculate_return_engagement(uuid);
-- DROP FUNCTION IF EXISTS public.calculate_legacy_listener(uuid);
-- DROP FUNCTION IF EXISTS public.get_trending_events();
-- DROP FUNCTION IF EXISTS public.get_personalized_feed_v1;
-- DROP FUNCTION IF EXISTS public.get_personalized_feed_v2;
-- DROP FUNCTION IF EXISTS public.get_personalized_feed_v3;
-- Check exact signatures before dropping:
--   SELECT proname, pg_get_function_identity_arguments(oid) FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname='public'
--   AND proname IN ('calculate_all_achievements','get_trending_events');
