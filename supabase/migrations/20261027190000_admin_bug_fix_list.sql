-- Admin Bug Fix List: shared open/fixed tasks with claim + authorship.
-- Accessible only to account_type = 'admin' via RLS.

CREATE TABLE IF NOT EXISTS public.admin_bug_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  author_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  assignee_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open'
    CHECK (status = ANY (ARRAY['open', 'fixed']::text[])),
  created_at timestamptz NOT NULL DEFAULT now(),
  fixed_at timestamptz
);

CREATE INDEX IF NOT EXISTS admin_bug_tasks_status_created_idx
  ON public.admin_bug_tasks (status, created_at DESC);

CREATE INDEX IF NOT EXISTS admin_bug_tasks_assignee_status_idx
  ON public.admin_bug_tasks (assignee_id, status)
  WHERE assignee_id IS NOT NULL;

COMMENT ON TABLE public.admin_bug_tasks IS
  'Admin-only bug/task board: authorship, optional claim, open vs fixed.';

ALTER TABLE public.admin_bug_tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins select admin_bug_tasks"
  ON public.admin_bug_tasks
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = (SELECT auth.uid())
        AND u.account_type = 'admin'
    )
  );

CREATE POLICY "Admins insert admin_bug_tasks"
  ON public.admin_bug_tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    author_id = (SELECT auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = (SELECT auth.uid())
        AND u.account_type = 'admin'
    )
  );

CREATE POLICY "Admins update admin_bug_tasks"
  ON public.admin_bug_tasks
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = (SELECT auth.uid())
        AND u.account_type = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = (SELECT auth.uid())
        AND u.account_type = 'admin'
    )
  );

CREATE POLICY "Admins delete admin_bug_tasks"
  ON public.admin_bug_tasks
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.user_id = (SELECT auth.uid())
        AND u.account_type = 'admin'
    )
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_bug_tasks TO authenticated;
GRANT ALL ON public.admin_bug_tasks TO service_role;
