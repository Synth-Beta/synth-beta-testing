-- Review status for unique newsletter content cards (sections) across drafts.
-- Pending / approved / rejected are global for a content key. Service role / Edge Function only.

CREATE TABLE IF NOT EXISTS public.newsletter_section_statuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('event', 'news', 'listen', 'account')),
  label TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected')),
  updated_by UUID NULL REFERENCES public.users(user_id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT newsletter_section_statuses_content_key_unique UNIQUE (content_key)
);

CREATE INDEX IF NOT EXISTS newsletter_section_statuses_status_idx
  ON public.newsletter_section_statuses (status, updated_at DESC);

ALTER TABLE public.newsletter_section_statuses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct select on newsletter_section_statuses" ON public.newsletter_section_statuses;
CREATE POLICY "No direct select on newsletter_section_statuses"
  ON public.newsletter_section_statuses FOR SELECT USING (false);

DROP POLICY IF EXISTS "No direct insert on newsletter_section_statuses" ON public.newsletter_section_statuses;
CREATE POLICY "No direct insert on newsletter_section_statuses"
  ON public.newsletter_section_statuses FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "No direct update on newsletter_section_statuses" ON public.newsletter_section_statuses;
CREATE POLICY "No direct update on newsletter_section_statuses"
  ON public.newsletter_section_statuses FOR UPDATE USING (false);

DROP POLICY IF EXISTS "No direct delete on newsletter_section_statuses" ON public.newsletter_section_statuses;
CREATE POLICY "No direct delete on newsletter_section_statuses"
  ON public.newsletter_section_statuses FOR DELETE USING (false);
