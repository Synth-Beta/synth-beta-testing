-- =============================================================================
-- Chat feature: emoji reactions on messages
-- 2026-08-25
--
-- Design notes:
--
-- * A TABLE, not a jsonb column on `messages`. Two people tapping the same
--   message at the same moment would last-write-wins a jsonb blob and silently
--   drop one reaction. A row per (message, user, emoji) cannot lose a write, and
--   the primary key makes double-tap idempotent instead of duplicating.
--
-- * `chat_id` is denormalised on purpose. Supabase `postgres_changes` filters on
--   exactly one column, so without chat_id on the row a client cannot subscribe
--   to "reactions in this chat" and would need a second channel keyed per
--   message. It is kept honest by a trigger, not by client code.
--
-- * Emoji is capped at 16 characters. A single emoji can be several codepoints
--   (skin tone, ZWJ sequences like family emoji), so 1-2 chars is too tight —
--   but this is a reaction column, not a message body.
--
-- SAFETY: creates one new table, its policies, one trigger and one publication
-- entry. Touches no existing table, column, policy or row. Idempotent.
-- Review, then apply yourself.
-- =============================================================================
SET statement_timeout = '120s';

-- ---- Table ------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid        NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  chat_id    uuid        NOT NULL REFERENCES public.chats(id)    ON DELETE CASCADE,
  user_id    uuid        NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  emoji      text        NOT NULL CHECK (char_length(emoji) BETWEEN 1 AND 16),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (message_id, user_id, emoji)
);

COMMENT ON TABLE public.message_reactions IS
  'Emoji reactions on chat messages. One row per (message, user, emoji) — re-tapping the same emoji deletes the row rather than inserting a duplicate.';
COMMENT ON COLUMN public.message_reactions.chat_id IS
  'Denormalised from messages.chat_id so Realtime postgres_changes can filter per chat (it supports only one filter column). Enforced by trigger, not by the client.';

-- Reading a thread fetches reactions for a page of messages at a time.
CREATE INDEX IF NOT EXISTS message_reactions_message_id_idx
  ON public.message_reactions (message_id);

-- Realtime subscription filter: chat_id=eq.<uuid>
CREATE INDEX IF NOT EXISTS message_reactions_chat_id_idx
  ON public.message_reactions (chat_id);

-- ---- Keep chat_id honest ----------------------------------------------------
-- The client sends chat_id, but the row is only trustworthy if the database
-- derives it. This overwrites whatever was supplied with the message's real chat.
CREATE OR REPLACE FUNCTION public.set_message_reaction_chat_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  SELECT m.chat_id INTO NEW.chat_id
  FROM public.messages m
  WHERE m.id = NEW.message_id;

  IF NEW.chat_id IS NULL THEN
    RAISE EXCEPTION 'message % does not exist', NEW.message_id;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS set_message_reaction_chat_id_trg ON public.message_reactions;
CREATE TRIGGER set_message_reaction_chat_id_trg
  BEFORE INSERT OR UPDATE ON public.message_reactions
  FOR EACH ROW EXECUTE FUNCTION public.set_message_reaction_chat_id();

-- ---- RLS --------------------------------------------------------------------
-- Same shape as messages_select_policy: participant-scoped via the existing
-- SECURITY DEFINER helper (avoids the chat_participants RLS recursion that
-- migration 20260120120201 was written to fix).
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "message_reactions_select" ON public.message_reactions;
CREATE POLICY "message_reactions_select" ON public.message_reactions
  FOR SELECT TO public
  USING (is_user_chat_participant(chat_id, (SELECT auth.uid())));

-- Insert and delete are restricted to the acting user's own reactions: you may
-- react as yourself in a chat you belong to, and remove only your own.
DROP POLICY IF EXISTS "message_reactions_insert" ON public.message_reactions;
CREATE POLICY "message_reactions_insert" ON public.message_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND is_user_chat_participant(chat_id, (SELECT auth.uid()))
  );

DROP POLICY IF EXISTS "message_reactions_delete" ON public.message_reactions;
CREATE POLICY "message_reactions_delete" ON public.message_reactions
  FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

-- No UPDATE policy on purpose: changing a reaction is a delete plus an insert.

-- ---- Realtime ---------------------------------------------------------------
-- Without this the table is invisible to postgres_changes — see
-- supabase/realtime-publication-fix-2026-07-26 for how that failed silently before.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'message_reactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
  END IF;
END $$;

-- Reaction rows carry no message content, so REPLICA IDENTITY FULL is safe here
-- and is required for DELETE events to carry enough data for clients to un-render
-- the removed reaction (the default only ships the primary key... which is in fact
-- sufficient here, but FULL keeps chat_id available for the subscription filter).
ALTER TABLE public.message_reactions REPLICA IDENTITY FULL;

-- -----------------------------------------------------------------------------
-- Verification (read-only — run after applying)
-- -----------------------------------------------------------------------------
-- SELECT tablename, policyname, cmd FROM pg_policies
-- WHERE schemaname = 'public' AND tablename = 'message_reactions' ORDER BY cmd;
--
-- SELECT tablename FROM pg_publication_tables
-- WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions';
--
-- SELECT relreplident FROM pg_class WHERE relname = 'message_reactions';  -- expect 'f'
