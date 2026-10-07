-- Exact rendered newsletter drafts. Approval is tied to content_hash.
-- A send may only use a row whose status is approved and whose
-- approved_content_hash still matches content_hash.

CREATE TABLE IF NOT EXISTS public.newsletter_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_date DATE NOT NULL,
  user_id UUID NOT NULL,
  email TEXT NOT NULL,
  subject TEXT NOT NULL,
  preheader TEXT NOT NULL,
  html TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('needs_approval', 'approved', 'sent')),
  approved_content_hash TEXT NULL,
  approved_by UUID NULL,
  approved_at TIMESTAMPTZ NULL,
  sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (edition_date, user_id),
  UNIQUE (edition_date, email)
);

CREATE INDEX IF NOT EXISTS newsletter_drafts_edition_status_idx
  ON public.newsletter_drafts (edition_date, status);

CREATE OR REPLACE FUNCTION public.update_newsletter_drafts_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS newsletter_drafts_updated_at_trigger ON public.newsletter_drafts;
CREATE TRIGGER newsletter_drafts_updated_at_trigger
BEFORE UPDATE ON public.newsletter_drafts
FOR EACH ROW
EXECUTE FUNCTION public.update_newsletter_drafts_updated_at();

ALTER TABLE public.newsletter_drafts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct select on newsletter_drafts" ON public.newsletter_drafts;
CREATE POLICY "No direct select on newsletter_drafts"
  ON public.newsletter_drafts FOR SELECT USING (false);

DROP POLICY IF EXISTS "No direct insert on newsletter_drafts" ON public.newsletter_drafts;
CREATE POLICY "No direct insert on newsletter_drafts"
  ON public.newsletter_drafts FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "No direct update on newsletter_drafts" ON public.newsletter_drafts;
CREATE POLICY "No direct update on newsletter_drafts"
  ON public.newsletter_drafts FOR UPDATE USING (false);

DROP POLICY IF EXISTS "No direct delete on newsletter_drafts" ON public.newsletter_drafts;
CREATE POLICY "No direct delete on newsletter_drafts"
  ON public.newsletter_drafts FOR DELETE USING (false);
