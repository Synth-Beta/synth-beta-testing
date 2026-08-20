-- Newsletter sending infrastructure: unsubscribe records + idempotent send jobs.

CREATE TABLE IF NOT EXISTS public.newsletter_unsubscribes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  user_id UUID NULL,
  source TEXT NOT NULL DEFAULT 'email_link',
  reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS newsletter_unsubscribes_email_unique_idx
  ON public.newsletter_unsubscribes (email);

CREATE INDEX IF NOT EXISTS newsletter_unsubscribes_user_id_idx
  ON public.newsletter_unsubscribes (user_id);

CREATE TABLE IF NOT EXISTS public.newsletter_send_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id TEXT NOT NULL UNIQUE,
  newsletter_slug TEXT NOT NULL,
  send_type TEXT NOT NULL CHECK (send_type IN ('test', 'batch')),
  initiated_by UUID NOT NULL,
  target_email TEXT NULL,
  status TEXT NOT NULL CHECK (status IN ('processing', 'completed', 'failed')),
  total_recipients INTEGER NOT NULL DEFAULT 0,
  success_count INTEGER NOT NULL DEFAULT 0,
  failure_count INTEGER NOT NULL DEFAULT 0,
  error_message TEXT NULL,
  resend_batch_id TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS newsletter_send_jobs_slug_idx
  ON public.newsletter_send_jobs (newsletter_slug);

CREATE INDEX IF NOT EXISTS newsletter_send_jobs_created_at_idx
  ON public.newsletter_send_jobs (created_at DESC);

CREATE OR REPLACE FUNCTION public.update_newsletter_send_jobs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS newsletter_send_jobs_updated_at_trigger ON public.newsletter_send_jobs;
CREATE TRIGGER newsletter_send_jobs_updated_at_trigger
BEFORE UPDATE ON public.newsletter_send_jobs
FOR EACH ROW
EXECUTE FUNCTION public.update_newsletter_send_jobs_updated_at();

ALTER TABLE public.newsletter_unsubscribes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.newsletter_send_jobs ENABLE ROW LEVEL SECURITY;

-- Keep these server-managed via Edge Functions + service role.
DROP POLICY IF EXISTS "No direct select on newsletter_unsubscribes" ON public.newsletter_unsubscribes;
CREATE POLICY "No direct select on newsletter_unsubscribes"
  ON public.newsletter_unsubscribes
  FOR SELECT
  USING (false);

DROP POLICY IF EXISTS "No direct insert on newsletter_unsubscribes" ON public.newsletter_unsubscribes;
CREATE POLICY "No direct insert on newsletter_unsubscribes"
  ON public.newsletter_unsubscribes
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No direct update on newsletter_unsubscribes" ON public.newsletter_unsubscribes;
CREATE POLICY "No direct update on newsletter_unsubscribes"
  ON public.newsletter_unsubscribes
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No direct delete on newsletter_unsubscribes" ON public.newsletter_unsubscribes;
CREATE POLICY "No direct delete on newsletter_unsubscribes"
  ON public.newsletter_unsubscribes
  FOR DELETE
  USING (false);

DROP POLICY IF EXISTS "No direct select on newsletter_send_jobs" ON public.newsletter_send_jobs;
CREATE POLICY "No direct select on newsletter_send_jobs"
  ON public.newsletter_send_jobs
  FOR SELECT
  USING (false);

DROP POLICY IF EXISTS "No direct insert on newsletter_send_jobs" ON public.newsletter_send_jobs;
CREATE POLICY "No direct insert on newsletter_send_jobs"
  ON public.newsletter_send_jobs
  FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "No direct update on newsletter_send_jobs" ON public.newsletter_send_jobs;
CREATE POLICY "No direct update on newsletter_send_jobs"
  ON public.newsletter_send_jobs
  FOR UPDATE
  USING (false);

DROP POLICY IF EXISTS "No direct delete on newsletter_send_jobs" ON public.newsletter_send_jobs;
CREATE POLICY "No direct delete on newsletter_send_jobs"
  ON public.newsletter_send_jobs
  FOR DELETE
  USING (false);
