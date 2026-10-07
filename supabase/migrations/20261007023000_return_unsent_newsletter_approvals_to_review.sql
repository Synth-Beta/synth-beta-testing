-- The previous approval flag was not tied to rendered newsletter content.
-- Any approved row that has not been sent must be reviewed again before a send.
-- Sent history is left unchanged.

DO $$
BEGIN
  IF to_regclass('public.newsletter_approvals') IS NOT NULL THEN
    UPDATE public.newsletter_approvals
    SET status = 'revoked',
        updated_at = now()
    WHERE status = 'approved';
  END IF;

  IF to_regclass('public.newsletter_drafts') IS NOT NULL THEN
    UPDATE public.newsletter_drafts
    SET status = 'needs_approval',
        approved_content_hash = NULL,
        approved_by = NULL,
        approved_at = NULL
    WHERE status = 'approved'
      AND sent_at IS NULL;
  END IF;
END $$;
