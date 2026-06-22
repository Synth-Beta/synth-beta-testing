-- Security hardening PHASE 1 — safe to run BEFORE app store / web deploy updates.
-- Does NOT lock down chats INSERT or private chat-images (those need new app code).
-- Run 20260607130000_security_rls_hardening_phase2.sql AFTER app with RPC + signed URLs ships.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) RPC for genre group chats (additive — old app keeps direct INSERT; new app uses RPC)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_or_create_genre_chat(
  p_genre_id text,
  p_chat_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_chat_id uuid;
BEGIN
  IF p_genre_id IS NULL OR length(trim(p_genre_id)) = 0 THEN
    RAISE EXCEPTION 'genre_id is required';
  END IF;
  IF p_chat_name IS NULL OR length(trim(p_chat_name)) = 0 THEN
    RAISE EXCEPTION 'chat_name is required';
  END IF;

  SELECT id INTO v_chat_id
  FROM public.chats
  WHERE entity_type = 'genre'
    AND entity_id = p_genre_id
    AND is_group_chat = true
  LIMIT 1;

  IF v_chat_id IS NOT NULL THEN
    RETURN v_chat_id;
  END IF;

  BEGIN
    INSERT INTO public.chats (chat_name, is_group_chat, entity_type, entity_id)
    VALUES (trim(p_chat_name), true, 'genre', trim(p_genre_id))
    RETURNING id INTO v_chat_id;
  EXCEPTION
    WHEN unique_violation THEN
      SELECT id INTO v_chat_id
      FROM public.chats
      WHERE entity_type = 'genre'
        AND entity_id = trim(p_genre_id)
        AND is_group_chat = true
      LIMIT 1;
  END;

  IF v_chat_id IS NULL THEN
    RAISE EXCEPTION 'Failed to get or create genre chat for %', p_genre_id;
  END IF;

  RETURN v_chat_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_or_create_genre_chat(text, text) TO authenticated;

COMMENT ON FUNCTION public.get_or_create_genre_chat(text, text) IS
  'Returns existing genre community chat or creates one. Phase 2 locks direct client INSERT on chats.';

-- ---------------------------------------------------------------------------
-- 2) user_preferences — enable RLS (was missing entirely)
-- Old app only reads own row for feeds/settings; match compat may default if cross-user read fails.
-- ---------------------------------------------------------------------------

ALTER TABLE IF EXISTS public.user_preferences ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'user_preferences'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_preferences', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users can view their own preferences"
  ON public.user_preferences FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users can insert their own preferences"
  ON public.user_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update their own preferences"
  ON public.user_preferences FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can delete their own preferences"
  ON public.user_preferences FOR DELETE TO authenticated
  USING (user_id = auth.uid());

REVOKE ALL ON public.user_preferences FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_preferences TO authenticated;
GRANT ALL ON public.user_preferences TO service_role;

-- ---------------------------------------------------------------------------
-- 3) users — hide bot accounts from client SELECT (RESTRICTIVE policy)
-- Does not block chat creation. Bot senders in genre chats may show without profile in old app.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "Bot users hidden from client SELECT" ON public.users;

CREATE POLICY "Bot users hidden from client SELECT"
  ON public.users
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated, anon
  USING (COALESCE(is_bot, false) = false);

CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT
    user_id AS id,
    user_id,
    name AS display_name,
    username,
    avatar_url,
    bio,
    is_bot
  FROM public.users
  WHERE COALESCE(is_bot, false) = false;

COMMENT ON VIEW public.public_profiles IS
  'Client-safe profile fields only. Prefer over direct users SELECT for discovery UIs.';

ALTER VIEW public.public_profiles SET (security_invoker = true);

GRANT SELECT ON public.public_profiles TO authenticated, anon;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'analytics_users' AND c.relkind = 'v'
  ) THEN
    ALTER VIEW public.analytics_users SET (security_invoker = true);
  END IF;
END $$;

COMMENT ON COLUMN public.users.is_bot IS
  'Bot seed accounts. Exclude from analytics. Block normal client login via Auth Hook when true.';

-- NOTE: chats INSERT lockdown, users.email revoke, and private chat-images bucket
-- are in 20260607130000_security_rls_hardening_phase2.sql (run after app update).

COMMIT;
