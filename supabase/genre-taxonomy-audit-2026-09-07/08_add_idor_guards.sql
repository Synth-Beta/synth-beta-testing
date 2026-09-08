-- =============================================================================
-- Add ownership guards to the SECURITY DEFINER functions that trust a
-- caller-supplied user_id. 2026-09-07.
-- =============================================================================
-- REVIEW THIS, THEN RUN IT YOURSELF. Nothing here is auto-applied.
-- Run 06 first (applied 2026-09-07: 218 functions, anon EXECUTE removed).
--
-- WHAT THIS FIXES. 06 removed the unauthenticated surface. It did nothing about
-- the underlying flaw: these run SECURITY DEFINER (RLS bypassed) and take a
-- user_id as a PARAMETER without comparing it to auth.uid(), so any signed-in
-- user can act as any other. The bodies below are the live definitions from
-- pg_get_functiondef, BYTE-IDENTICAL except for the guard prepended to each.
--
-- THE GUARD, and why it is shaped this way:
--     IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
--       RAISE EXCEPTION '...' USING ERRCODE = '42501';
--     END IF;
-- A caller holding a JWT must be acting on itself. service_role and pg_cron
-- have no auth.uid() and stay unrestricted deliberately -- the Express backend
-- and scheduled jobs depend on that. anon cannot reach any of these since 06.
-- 42501 maps to HTTP 403 and surfaces as error.code '42501' in supabase-js, so
-- a denial is distinguishable from an empty result -- which is how this whole
-- class of bug stayed invisible.
--
-- ACL NOTE: CREATE OR REPLACE preserves an existing function's ACL, so these
-- seven keep their post-06 grants (no anon). The one NEW function below does
-- NOT -- Postgres grants EXECUTE to PUBLIC on creation -- so it is explicitly
-- revoked right after. Do not omit that.
--
-- VERIFIED CALLERS (all already pass the caller's own id, so no guard here
-- changes app behaviour):
--   save_review_draft / get_user_draft_reviews / delete_review_draft /
--   publish_review_draft      -> src/services/draftReviewService.ts
--   join_verified_chat        -> src/services/verifiedChatService.ts:64
--   add_user_to_verified_chat -> no caller in src/, mobile/, packages/,
--                                backend/, api/ or scripts/
--   get_all_profiles_for_analytics -> src/services/analyticsDataService.ts:32
--
-- NOT TOUCHED HERE -- broken rather than exposed, confirmed live 2026-09-07:
--   get_pending_flags_simple()  -> 42P01 relation "public.profiles" does not exist
--   get_user_account_info(uuid) -> 42P01, same
--   get_users_for_admin()       -> unimplemented stub, returns 0 rows
-- =============================================================================


-- ── Helper: admin test, matching what the app already uses ─────────────────
-- src/hooks/useAccountType.ts treats account_type = 'admin' as admin, read from
-- the users_complete view; public.users is that view's base table. 4 admins.
CREATE OR REPLACE FUNCTION public.is_current_user_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.user_id = auth.uid()
      AND u.account_type = 'admin'
  );
$function$;

-- NEW function => Postgres grants EXECUTE to PUBLIC on creation. Undo it.
REVOKE EXECUTE ON FUNCTION public.is_current_user_admin() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_current_user_admin() TO authenticated, service_role;


-- ── 1. get_user_draft_reviews — reads anyone's unpublished drafts ──────────
CREATE OR REPLACE FUNCTION public.get_user_draft_reviews(p_user_id uuid)
 RETURNS TABLE(id uuid, event_id uuid, draft_data jsonb, last_saved_at timestamp with time zone, event_title text, artist_name text, venue_name text, event_date timestamp with time zone)
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
    COALESCE(
      r.draft_data->>'eventTitle',
      e.title
    ) as event_title,
    COALESCE(
      r.draft_data->'selectedArtist'->>'name',
      a.name  -- Get artist name from artists table, not events.artist_name
    ) as artist_name,
    COALESCE(
      r.draft_data->'selectedVenue'->>'name',
      v.name  -- Get venue name from venues table, not events.venue_name
    ) as venue_name,
    -- Prefer eventDate from draft_data, fallback to event's event_date
    COALESCE(
      CASE
        WHEN r.draft_data->>'eventDate' IS NOT NULL
        THEN (r.draft_data->>'eventDate' || 'T20:00:00Z')::TIMESTAMP WITH TIME ZONE
        ELSE NULL
      END,
      e.event_date
    ) as event_date
  FROM public.reviews r
  LEFT JOIN public.events e ON r.event_id = e.id
  LEFT JOIN public.artists a ON e.artist_id = a.id  -- Join with artists table to get artist name
  LEFT JOIN public.venues v ON e.venue_id = v.id     -- Join with venues table to get venue name
  WHERE r.user_id = p_user_id
    AND r.is_draft = true
    -- CRITICAL: Exclude drafts for events that already have published reviews
    -- This prevents drafts from showing in "Unreviewed" when review is already submitted
    AND NOT EXISTS (
      SELECT 1
      FROM public.reviews r2
      WHERE r2.user_id = r.user_id
        AND r2.event_id = r.event_id
        AND r2.is_draft = false
        AND r2.review_text IS NOT NULL
        AND r2.review_text != 'ATTENDANCE_ONLY'
    )
  ORDER BY r.last_saved_at DESC;
END;
$function$;


-- ── 2. save_review_draft — writes a draft as another user ──────────────────
CREATE OR REPLACE FUNCTION public.save_review_draft(p_user_id uuid, p_event_id uuid, p_draft_data jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  draft_id UUID;
  published_review_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: cannot save a draft for another user' USING ERRCODE = '42501';
  END IF;

  -- CRITICAL: Check if a published review already exists for this event
  -- If it does, don't create or update drafts - the review is already complete
  SELECT id INTO published_review_id
  FROM public.reviews
  WHERE user_id = p_user_id
    AND event_id = p_event_id
    AND is_draft = false;

  IF published_review_id IS NOT NULL THEN
    -- Published review exists - don't create/update drafts
    -- Return NULL to indicate draft save was blocked
    RETURN NULL;
  END IF;

  -- Try to find existing draft
  SELECT id INTO draft_id
  FROM public.reviews
  WHERE user_id = p_user_id
    AND event_id = p_event_id
    AND is_draft = true;

  IF draft_id IS NOT NULL THEN
    -- Update existing draft
    UPDATE public.reviews
    SET
      draft_data = p_draft_data,
      last_saved_at = now(),
      updated_at = now()
    WHERE id = draft_id;
  ELSE
    -- Create new draft (private by default)
    INSERT INTO public.reviews (
      user_id,
      event_id,
      is_draft,
      draft_data,
      last_saved_at,
      rating, -- NULL for drafts
      is_public, -- Keep drafts private
      created_at,
      updated_at
    ) VALUES (
      p_user_id,
      p_event_id,
      true,
      p_draft_data,
      now(),
      NULL, -- No rating for drafts
      false, -- Drafts are private
      now(),
      now()
    ) RETURNING id INTO draft_id;
  END IF;

  RETURN draft_id;
END;
$function$;


-- ── 3. delete_review_draft — deletes another user's draft ──────────────────
CREATE OR REPLACE FUNCTION public.delete_review_draft(p_draft_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: cannot delete another users draft' USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.reviews
  WHERE id = p_draft_id
    AND user_id = p_user_id
    AND is_draft = true;

  RETURN FOUND;
END;
$function$;


-- ── 4. publish_review_draft — THE WORST ONE ───────────────────────────────
-- The original WHERE is `id = p_draft_id AND is_draft = true` with NO user
-- predicate at all -- not even a caller-supplied one, since this function takes
-- no user parameter. Any signed-in user could publish any other user's private
-- draft, overwrite its entire contents with arbitrary p_final_data, and flip
-- is_public to true. Guarded on draft ownership.
CREATE OR REPLACE FUNCTION public.publish_review_draft(p_draft_id uuid, p_final_data jsonb, p_is_public boolean DEFAULT true)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  final_id UUID;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.reviews r
    WHERE r.id = p_draft_id
      AND r.user_id = auth.uid()
      AND r.is_draft = true
  ) THEN
    RAISE EXCEPTION 'forbidden: draft does not belong to the caller' USING ERRCODE = '42501';
  END IF;

  -- Update the draft to published status with final data
  UPDATE public.reviews
  SET
    is_draft = false,
    draft_data = NULL,
    -- Handle the three separate rating columns
    performance_rating = COALESCE((p_final_data->>'performanceRating')::DECIMAL(2,1), 1.0),
    venue_rating_new = COALESCE((p_final_data->>'venueRating')::DECIMAL(2,1), 1.0),
    overall_experience_rating = COALESCE((p_final_data->>'overallExperienceRating')::DECIMAL(2,1), 1.0),
    -- Calculate overall rating from the three categories
    rating = ROUND((
      COALESCE((p_final_data->>'performanceRating')::DECIMAL(2,1), 1.0) +
      COALESCE((p_final_data->>'venueRating')::DECIMAL(2,1), 1.0) +
      COALESCE((p_final_data->>'overallExperienceRating')::DECIMAL(2,1), 1.0)
    ) / 3.0)::INTEGER,
    -- Handle review text (could be in different fields)
    review_text = COALESCE(
      p_final_data->>'reviewText',
      p_final_data->>'performanceReviewText',
      p_final_data->>'venueReviewText',
      p_final_data->>'overallExperienceReviewText'
    ),
    performance_review_text = p_final_data->>'performanceReviewText',
    venue_review_text = p_final_data->>'venueReviewText',
    overall_experience_review_text = p_final_data->>'overallExperienceReviewText',
    reaction_emoji = p_final_data->>'reactionEmoji',
    photos = CASE
      WHEN p_final_data->'photos' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(p_final_data->'photos'))
      ELSE NULL
    END,
    videos = CASE
      WHEN p_final_data->'videos' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(p_final_data->'videos'))
      ELSE NULL
    END,
    mood_tags = CASE
      WHEN p_final_data->'moodTags' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(p_final_data->'moodTags'))
      ELSE NULL
    END,
    genre_tags = CASE
      WHEN p_final_data->'genreTags' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(p_final_data->'genreTags'))
      ELSE NULL
    END,
    context_tags = CASE
      WHEN p_final_data->'contextTags' IS NOT NULL
      THEN ARRAY(SELECT jsonb_array_elements_text(p_final_data->'contextTags'))
      ELSE NULL
    END,
    -- Handle setlist data
    setlist = p_final_data->'selectedSetlist',
    custom_setlist = p_final_data->'customSetlist',
    is_public = p_is_public, -- Set public status when publishing
    updated_at = now()
  WHERE id = p_draft_id AND is_draft = true
  RETURNING id INTO final_id;

  RETURN final_id;
END;
$function$;


-- ── 5. join_verified_chat — joins a chat as someone else ───────────────────
CREATE OR REPLACE FUNCTION public.join_verified_chat(p_chat_id uuid, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_is_member BOOLEAN;
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: cannot join a chat on behalf of another user' USING ERRCODE = '42501';
  END IF;

  -- Check if chat is verified
  IF NOT EXISTS (
    SELECT 1 FROM public.chats
    WHERE id = p_chat_id AND is_verified = true
  ) THEN
    RAISE EXCEPTION 'Chat % is not a verified chat', p_chat_id;
  END IF;

  -- Check if user is already a member using chat_participants
  SELECT EXISTS (
    SELECT 1 FROM public.chat_participants
    WHERE chat_id = p_chat_id AND user_id = p_user_id
  ) INTO v_is_member;

  -- If already a member, just return chat_id
  IF v_is_member THEN
    RETURN p_chat_id;
  END IF;

  -- Add user to chat_participants (trigger will sync to users array)
  INSERT INTO public.chat_participants (chat_id, user_id, joined_at)
  VALUES (p_chat_id, p_user_id, now())
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  RETURN p_chat_id;
END;
$function$;


-- ── 6. add_user_to_verified_chat — adds ANY user to ANY chat ──────────────
-- Weaker than join_verified_chat: it does not even check the chat is verified.
-- No application caller exists, so a self-only guard cannot break anything, and
-- service_role keeps unrestricted access for admin/backfill use.
CREATE OR REPLACE FUNCTION public.add_user_to_verified_chat(p_chat_id uuid, p_user_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'forbidden: cannot add another user to a chat' USING ERRCODE = '42501';
  END IF;

  -- Add user via chat_participants (the source of truth)
  -- ON CONFLICT DO NOTHING handles race conditions and existing members
  INSERT INTO public.chat_participants (chat_id, user_id, joined_at)
  VALUES (p_chat_id, p_user_id, now())
  ON CONFLICT (chat_id, user_id) DO NOTHING;

  -- Update chat's updated_at timestamp
  UPDATE public.chats
  SET updated_at = NOW()
  WHERE id = p_chat_id;

  RETURN p_chat_id;
END;
$function$;


-- ── 7. get_all_profiles_for_analytics — 133 rows of PII, admin-only ───────
-- Confirmed live: returns every user's name, avatar, account_type,
-- business_info, timestamps and subscription tier to any signed-in caller.
-- Called only from src/services/analyticsDataService.ts, an admin screen.
CREATE OR REPLACE FUNCTION public.get_all_profiles_for_analytics()
 RETURNS TABLE(user_id uuid, name text, avatar_url text, account_type text, business_info jsonb, created_at timestamp with time zone, updated_at timestamp with time zone, last_active_at timestamp with time zone, is_public_profile boolean, subscription_tier text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_current_user_admin() THEN
    RAISE EXCEPTION 'forbidden: admin only' USING ERRCODE = '42501';
  END IF;

  -- This function runs with elevated privileges to access all profiles
  -- Uses users_complete view to get subscription data
  RETURN QUERY
  SELECT
    u.user_id,
    u.name,
    u.avatar_url,
    u.account_type::text,
    u.business_info,
    u.created_at,
    u.updated_at,
    u.last_active_at,
    u.is_public_profile,
    COALESCE(us.subscription_tier::text, 'free') AS subscription_tier
  FROM public.users u
  LEFT JOIN public.user_subscriptions us ON u.user_id = us.user_id;
END;
$function$;


-- ── VERIFY ────────────────────────────────────────────────────────────────
-- All eight should report has_guard = true, and anon must still be false.
SELECT
  p.oid::regprocedure AS function_signature,
  p.prosrc ~* 'auth\.uid' AS has_guard,
  has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_can_execute,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authed_can_execute
FROM pg_proc p
WHERE p.pronamespace = 'public'::regnamespace
  AND p.proname IN (
    'get_user_draft_reviews','save_review_draft','delete_review_draft',
    'publish_review_draft','join_verified_chat','add_user_to_verified_chat',
    'get_all_profiles_for_analytics','is_current_user_admin'
  )
ORDER BY 1;
