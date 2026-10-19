-- Records Brevo acceptance separately from approval and from inbox delivery.
-- Existing status values are unchanged. A null delivery_state means the draft
-- has not been offered to Brevo. "accepted" means Brevo returned a message id.

ALTER TABLE public.newsletter_drafts
  ADD COLUMN IF NOT EXISTS brevo_message_id TEXT,
  ADD COLUMN IF NOT EXISTS delivery_state TEXT,
  ADD COLUMN IF NOT EXISTS delivery_error TEXT,
  ADD COLUMN IF NOT EXISTS send_claimed_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'newsletter_drafts_delivery_state_check'
  ) THEN
    ALTER TABLE public.newsletter_drafts
      ADD CONSTRAINT newsletter_drafts_delivery_state_check
      CHECK (delivery_state IS NULL OR delivery_state IN ('accepted', 'failed', 'uncertain'));
  END IF;
END $$;

ALTER TABLE public.newsletter_send_jobs
  ADD COLUMN IF NOT EXISTS brevo_message_id TEXT;

COMMENT ON COLUMN public.newsletter_drafts.brevo_message_id IS
  'Brevo message id after API acceptance. This is not an inbox delivery receipt.';
COMMENT ON COLUMN public.newsletter_drafts.delivery_state IS
  'accepted: Brevo accepted the message. failed: Brevo rejected it and a later send may retry. uncertain: the response was lost and must not be retried until reconciled in Brevo.';
COMMENT ON COLUMN public.newsletter_drafts.send_claimed_at IS
  'Set when a send starts. Cleared only after a definite rejection. Left in place when acceptance is unknown.';

-- Regeneration may replace unsent drafts, including definite send failures.
-- It must not overwrite a row Brevo already accepted or one whose acceptance is unknown.
CREATE OR REPLACE FUNCTION public.regenerate_newsletter_drafts(p_edition_date date, p_drafts jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item jsonb;
  changed integer;
  replaced integer := 0;
  kept integer := 0;
BEGIN
  IF jsonb_typeof(p_drafts) IS DISTINCT FROM 'array' OR jsonb_array_length(p_drafts) > 15 THEN
    RAISE EXCEPTION 'Expected an array of at most 15 drafts';
  END IF;
  FOR item IN SELECT value FROM jsonb_array_elements(p_drafts) LOOP
    INSERT INTO public.newsletter_drafts AS existing (
      edition_date, user_id, email, subject, preheader, html, content_hash,
      sources, retrieved_at, status, approved_content_hash, approved_by, approved_at, sent_at
    ) VALUES (
      p_edition_date, (item->>'user_id')::uuid, lower(trim(item->>'email')),
      item->>'subject', coalesce(item->>'preheader', ''), item->>'html', item->>'content_hash',
      coalesce(item->'sources', '[]'::jsonb), now(), 'needs_approval', NULL, NULL, NULL, NULL
    ) ON CONFLICT (edition_date, user_id) DO UPDATE SET
      email = EXCLUDED.email, subject = EXCLUDED.subject, preheader = EXCLUDED.preheader,
      html = EXCLUDED.html, content_hash = EXCLUDED.content_hash, sources = EXCLUDED.sources,
      retrieved_at = EXCLUDED.retrieved_at, status = 'needs_approval',
      approved_content_hash = NULL, approved_by = NULL, approved_at = NULL,
      send_claimed_at = NULL, brevo_message_id = NULL, delivery_state = NULL, delivery_error = NULL
    WHERE existing.status <> 'sent'
      AND existing.sent_at IS NULL
      AND existing.send_claimed_at IS NULL
      AND existing.brevo_message_id IS NULL
      AND (existing.delivery_state IS NULL OR existing.delivery_state = 'failed');
    GET DIAGNOSTICS changed = ROW_COUNT;
    IF changed = 1 THEN replaced := replaced + 1; ELSE kept := kept + 1; END IF;
  END LOOP;
  RETURN jsonb_build_object('replaced', replaced, 'kept', kept);
END;
$$;

REVOKE ALL ON FUNCTION public.regenerate_newsletter_drafts(date, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.regenerate_newsletter_drafts(date, jsonb) TO service_role;
