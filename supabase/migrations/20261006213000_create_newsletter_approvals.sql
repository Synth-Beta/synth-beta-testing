-- Per-recipient approval required before a newsletter batch send.
-- Rows are written only by the newsletter-send edge function (service role).

CREATE TABLE IF NOT EXISTS public.newsletter_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  newsletter_slug TEXT NOT NULL,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'revoked')),
  approved_by UUID NOT NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (newsletter_slug, user_id)
);

CREATE INDEX IF NOT EXISTS newsletter_approvals_slug_status_idx
  ON public.newsletter_approvals (newsletter_slug, status);

CREATE OR REPLACE FUNCTION public.update_newsletter_approvals_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS newsletter_approvals_updated_at_trigger ON public.newsletter_approvals;
CREATE TRIGGER newsletter_approvals_updated_at_trigger
BEFORE UPDATE ON public.newsletter_approvals
FOR EACH ROW
EXECUTE FUNCTION public.update_newsletter_approvals_updated_at();

ALTER TABLE public.newsletter_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct select on newsletter_approvals" ON public.newsletter_approvals;
CREATE POLICY "No direct select on newsletter_approvals"
  ON public.newsletter_approvals
  FOR SELECT
  USING (false);

DROP POLICY IF EXISTS "No direct insert on newsletter_approvals" ON public.newsletter_approvals;
CREATE POLICY "No direct insert on newsletter_approvals"
  ON public.newsletter_approvals
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No direct update on newsletter_approvals" ON public.newsletter_approvals;
CREATE POLICY "No direct update on newsletter_approvals"
  ON public.newsletter_approvals
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No direct delete on newsletter_approvals" ON public.newsletter_approvals;
CREATE POLICY "No direct delete on newsletter_approvals"
  ON public.newsletter_approvals
  FOR DELETE
  USING (false);
