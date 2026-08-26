-- =============================================================================
-- Chat feature: reply / quote a message
-- 2026-08-25
--
-- Adds one nullable self-reference to public.messages. A reply points at the
-- message it answers; the client renders a quoted preview above the bubble.
--
-- ON DELETE SET NULL is deliberate: deleting a quoted message must not cascade
-- away every reply to it. The reply survives, it just loses its quote.
--
-- SAFETY: additive only. One nullable column plus one partial index. No data is
-- modified, no existing column or policy changes, and existing RLS on `messages`
-- already covers the column (policies are row-level, not column-level).
-- Idempotent. Review, then apply yourself.
-- =============================================================================
SET statement_timeout = '120s';

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS reply_to_id uuid
  REFERENCES public.messages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.messages.reply_to_id IS
  'Message this one replies to. NULL for normal messages, and reset to NULL if the quoted message is deleted.';

-- Partial: the overwhelming majority of rows are not replies, so indexing only
-- the ones that are keeps this small. Supports "load the quoted messages for
-- this page of the thread" and "how many replies does this message have".
CREATE INDEX IF NOT EXISTS messages_reply_to_id_idx
  ON public.messages (reply_to_id)
  WHERE reply_to_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- Verification (read-only — run after applying)
-- -----------------------------------------------------------------------------
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'messages' AND column_name = 'reply_to_id';
--
-- SELECT indexname FROM pg_indexes
-- WHERE schemaname = 'public' AND tablename = 'messages' AND indexname = 'messages_reply_to_id_idx';
