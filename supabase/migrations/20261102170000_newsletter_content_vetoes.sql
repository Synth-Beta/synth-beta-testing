-- Permanent and per-user newsletter content vetoes from Proofread.
-- Global (bad) rows are never reused by compose/cron. User (unfit) rows
-- only block that recipient. Service role / Edge Function only.

CREATE TABLE IF NOT EXISTS public.newsletter_content_vetoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_key TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('event', 'news', 'listen', 'account')),
  scope TEXT NOT NULL CHECK (scope IN ('global', 'user')),
  user_id UUID NULL REFERENCES public.users(user_id) ON DELETE CASCADE,
  reason TEXT NOT NULL CHECK (reason IN ('bad', 'unfit')),
  label TEXT NOT NULL DEFAULT '',
  created_by UUID NULL REFERENCES public.users(user_id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT newsletter_content_vetoes_scope_user CHECK (
    (scope = 'global' AND user_id IS NULL AND reason = 'bad')
    OR (scope = 'user' AND user_id IS NOT NULL AND reason = 'unfit')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_content_vetoes_unique_key
  ON public.newsletter_content_vetoes (
    content_key,
    scope,
    COALESCE(user_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

CREATE INDEX IF NOT EXISTS newsletter_content_vetoes_user_idx
  ON public.newsletter_content_vetoes (user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS newsletter_content_vetoes_global_idx
  ON public.newsletter_content_vetoes (content_key)
  WHERE scope = 'global';

ALTER TABLE public.newsletter_content_vetoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "No direct select on newsletter_content_vetoes" ON public.newsletter_content_vetoes;
CREATE POLICY "No direct select on newsletter_content_vetoes"
  ON public.newsletter_content_vetoes FOR SELECT USING (false);

DROP POLICY IF EXISTS "No direct insert on newsletter_content_vetoes" ON public.newsletter_content_vetoes;
CREATE POLICY "No direct insert on newsletter_content_vetoes"
  ON public.newsletter_content_vetoes FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "No direct update on newsletter_content_vetoes" ON public.newsletter_content_vetoes;
CREATE POLICY "No direct update on newsletter_content_vetoes"
  ON public.newsletter_content_vetoes FOR UPDATE USING (false);

DROP POLICY IF EXISTS "No direct delete on newsletter_content_vetoes" ON public.newsletter_content_vetoes;
CREATE POLICY "No direct delete on newsletter_content_vetoes"
  ON public.newsletter_content_vetoes FOR DELETE USING (false);
