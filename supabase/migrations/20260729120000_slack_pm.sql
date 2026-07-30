-- Synth Slack PM: org-wide tasks, projects, subtasks, meeting notes
-- Used by api/slack-pm/* (classic Slack app → Vercel → service role)

CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN
  CREATE TYPE public.pm_task_status AS ENUM (
    'todo',
    'active',
    'in_progress',
    'blocked',
    'stalled',
    'complete'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.pm_workspaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slack_team_id text NOT NULL UNIQUE,
  name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pm_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  slack_user_id text NOT NULL,
  display_name text,
  real_name text,
  email text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slack_user_id)
);

CREATE TABLE IF NOT EXISTS public.pm_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  short_code text NOT NULL,
  name text NOT NULL,
  description text,
  created_by_slack_user_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, short_code),
  UNIQUE (workspace_id, name)
);

CREATE TABLE IF NOT EXISTS public.pm_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  project_id uuid REFERENCES public.pm_projects(id) ON DELETE SET NULL,
  parent_task_id uuid REFERENCES public.pm_tasks(id) ON DELETE CASCADE,
  short_code text NOT NULL,
  title text NOT NULL,
  description text,
  status public.pm_task_status NOT NULL DEFAULT 'todo',
  assignee_slack_user_id text,
  created_by_slack_user_id text,
  due_at timestamptz,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'meeting', 'system')),
  meeting_note_id uuid,
  last_status_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, short_code)
);

CREATE TABLE IF NOT EXISTS public.pm_meeting_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.pm_workspaces(id) ON DELETE CASCADE,
  title text,
  raw_text text NOT NULL,
  channel_id text,
  slack_user_id text,
  extraction jsonb,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'proposed', 'confirmed', 'discarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.pm_tasks
  DROP CONSTRAINT IF EXISTS pm_tasks_meeting_note_id_fkey;
ALTER TABLE public.pm_tasks
  ADD CONSTRAINT pm_tasks_meeting_note_id_fkey
  FOREIGN KEY (meeting_note_id) REFERENCES public.pm_meeting_notes(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS pm_tasks_workspace_status_idx
  ON public.pm_tasks (workspace_id, status);
CREATE INDEX IF NOT EXISTS pm_tasks_assignee_idx
  ON public.pm_tasks (workspace_id, assignee_slack_user_id)
  WHERE assignee_slack_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pm_tasks_project_idx
  ON public.pm_tasks (workspace_id, project_id)
  WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pm_tasks_parent_idx
  ON public.pm_tasks (parent_task_id)
  WHERE parent_task_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS pm_projects_workspace_idx
  ON public.pm_projects (workspace_id);
CREATE INDEX IF NOT EXISTS pm_members_workspace_idx
  ON public.pm_members (workspace_id);

CREATE OR REPLACE FUNCTION public.pm_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pm_workspaces_updated_at ON public.pm_workspaces;
CREATE TRIGGER pm_workspaces_updated_at
  BEFORE UPDATE ON public.pm_workspaces
  FOR EACH ROW EXECUTE FUNCTION public.pm_set_updated_at();

DROP TRIGGER IF EXISTS pm_members_updated_at ON public.pm_members;
CREATE TRIGGER pm_members_updated_at
  BEFORE UPDATE ON public.pm_members
  FOR EACH ROW EXECUTE FUNCTION public.pm_set_updated_at();

DROP TRIGGER IF EXISTS pm_projects_updated_at ON public.pm_projects;
CREATE TRIGGER pm_projects_updated_at
  BEFORE UPDATE ON public.pm_projects
  FOR EACH ROW EXECUTE FUNCTION public.pm_set_updated_at();

DROP TRIGGER IF EXISTS pm_tasks_updated_at ON public.pm_tasks;
CREATE TRIGGER pm_tasks_updated_at
  BEFORE UPDATE ON public.pm_tasks
  FOR EACH ROW EXECUTE FUNCTION public.pm_set_updated_at();

DROP TRIGGER IF EXISTS pm_meeting_notes_updated_at ON public.pm_meeting_notes;
CREATE TRIGGER pm_meeting_notes_updated_at
  BEFORE UPDATE ON public.pm_meeting_notes
  FOR EACH ROW EXECUTE FUNCTION public.pm_set_updated_at();

-- Short codes: T-A1B2 / P-ONBOARD
CREATE OR REPLACE FUNCTION public.pm_next_task_code(p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  code text;
  n int := 0;
BEGIN
  LOOP
    code := 'T-' || upper(substr(encode(gen_random_bytes(3), 'hex'), 1, 4));
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.pm_tasks WHERE workspace_id = p_workspace_id AND short_code = code
    );
    n := n + 1;
    IF n > 20 THEN
      RAISE EXCEPTION 'Could not allocate task short_code';
    END IF;
  END LOOP;
  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION public.pm_project_code_from_name(p_name text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT 'P-' || upper(regexp_replace(left(trim(p_name), 12), '[^a-zA-Z0-9]+', '', 'g'));
$$;

ALTER TABLE public.pm_workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pm_meeting_notes ENABLE ROW LEVEL SECURITY;

-- Service role (Vercel) bypasses RLS. No public policies — Slack bot is the only writer/reader.
REVOKE ALL ON public.pm_workspaces FROM anon, authenticated;
REVOKE ALL ON public.pm_members FROM anon, authenticated;
REVOKE ALL ON public.pm_projects FROM anon, authenticated;
REVOKE ALL ON public.pm_tasks FROM anon, authenticated;
REVOKE ALL ON public.pm_meeting_notes FROM anon, authenticated;

GRANT ALL ON public.pm_workspaces TO service_role;
GRANT ALL ON public.pm_members TO service_role;
GRANT ALL ON public.pm_projects TO service_role;
GRANT ALL ON public.pm_tasks TO service_role;
GRANT ALL ON public.pm_meeting_notes TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_next_task_code(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.pm_project_code_from_name(text) TO service_role;
