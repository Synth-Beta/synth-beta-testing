import type { SupabaseClient } from '@supabase/supabase-js';
import type { PmTaskStatus } from './client.js';

export type PmTask = {
  id: string;
  workspace_id: string;
  project_id: string | null;
  parent_task_id: string | null;
  short_code: string;
  title: string;
  description: string | null;
  status: PmTaskStatus;
  assignee_slack_user_id: string | null;
  created_by_slack_user_id: string | null;
  due_at: string | null;
  source: string;
  meeting_note_id: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at?: string;
};

export type PmProject = {
  id: string;
  workspace_id: string;
  short_code: string;
  name: string;
  description: string | null;
};

function projectCodeFromName(name: string): string {
  const cleaned = name.trim().replace(/[^a-zA-Z0-9]+/g, '').slice(0, 12).toUpperCase();
  return `P-${cleaned || 'PROJ'}`;
}

export async function createProject(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    name: string;
    description?: string;
    createdBy?: string;
  },
): Promise<PmProject> {
  let code = projectCodeFromName(params.name);
  const { data: clash } = await supabase
    .from('pm_projects')
    .select('id')
    .eq('workspace_id', params.workspaceId)
    .eq('short_code', code)
    .maybeSingle();
  if (clash) {
    code = `${code}${Math.floor(Math.random() * 90 + 10)}`.slice(0, 16);
  }

  const { data, error } = await supabase
    .from('pm_projects')
    .insert({
      workspace_id: params.workspaceId,
      short_code: code,
      name: params.name.trim(),
      description: params.description || null,
      created_by_slack_user_id: params.createdBy || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as PmProject;
}

export async function listProjects(supabase: SupabaseClient, workspaceId: string) {
  const { data, error } = await supabase
    .from('pm_projects')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('name');
  if (error) throw error;
  return (data || []) as PmProject[];
}

export async function findProject(
  supabase: SupabaseClient,
  workspaceId: string,
  nameOrCode: string,
): Promise<PmProject | null> {
  const q = nameOrCode.replace(/^#/, '').trim();
  const byCode = await supabase
    .from('pm_projects')
    .select('*')
    .eq('workspace_id', workspaceId)
    .ilike('short_code', q)
    .maybeSingle();
  if (byCode.data) return byCode.data as PmProject;

  const byName = await supabase
    .from('pm_projects')
    .select('*')
    .eq('workspace_id', workspaceId)
    .ilike('name', q)
    .maybeSingle();
  return (byName.data as PmProject) || null;
}

export async function createTask(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    title: string;
    assigneeSlackUserId?: string | null;
    createdBy?: string | null;
    projectId?: string | null;
    parentTaskId?: string | null;
    dueAt?: string | null;
    description?: string | null;
    source?: 'manual' | 'meeting' | 'system';
    meetingNoteId?: string | null;
    status?: PmTaskStatus;
  },
): Promise<PmTask> {
  const { data: codeData, error: codeError } = await supabase.rpc('pm_next_task_code', {
    p_workspace_id: params.workspaceId,
  });
  if (codeError) throw codeError;
  const shortCode = String(codeData);

  const { data, error } = await supabase
    .from('pm_tasks')
    .insert({
      workspace_id: params.workspaceId,
      project_id: params.projectId || null,
      parent_task_id: params.parentTaskId || null,
      short_code: shortCode,
      title: params.title.trim(),
      description: params.description || null,
      status: params.status || 'todo',
      assignee_slack_user_id: params.assigneeSlackUserId || null,
      created_by_slack_user_id: params.createdBy || null,
      due_at: params.dueAt || null,
      source: params.source || 'manual',
      meeting_note_id: params.meetingNoteId || null,
      last_status_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as PmTask;
}

export async function getTaskByCode(
  supabase: SupabaseClient,
  workspaceId: string,
  code: string,
): Promise<PmTask | null> {
  const shortCode = code.trim().toUpperCase();
  const { data } = await supabase
    .from('pm_tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .ilike('short_code', shortCode)
    .maybeSingle();
  return (data as PmTask) || null;
}

export async function setTaskStatus(
  supabase: SupabaseClient,
  task: PmTask,
  status: PmTaskStatus,
): Promise<PmTask> {
  const patch: Record<string, unknown> = {
    status,
    last_status_at: new Date().toISOString(),
  };
  if (status === 'complete') patch.completed_at = new Date().toISOString();
  else patch.completed_at = null;

  const { data, error } = await supabase
    .from('pm_tasks')
    .update(patch)
    .eq('id', task.id)
    .select('*')
    .single();
  if (error) throw error;
  return data as PmTask;
}

export async function listTasks(
  supabase: SupabaseClient,
  params: {
    workspaceId: string;
    assigneeSlackUserId?: string | null;
    projectId?: string | null;
    includeComplete?: boolean;
    limit?: number;
  },
): Promise<PmTask[]> {
  let q = supabase
    .from('pm_tasks')
    .select('*')
    .eq('workspace_id', params.workspaceId)
    .order('updated_at', { ascending: false })
    .limit(params.limit ?? 40);

  if (params.assigneeSlackUserId) {
    q = q.eq('assignee_slack_user_id', params.assigneeSlackUserId);
  }
  if (params.projectId) {
    q = q.eq('project_id', params.projectId);
  }
  if (!params.includeComplete) {
    q = q.neq('status', 'complete');
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data || []) as PmTask[];
}

export function formatTaskLine(task: PmTask, opts?: { mention?: boolean }): string {
  const who = task.assignee_slack_user_id
    ? opts?.mention === false
      ? task.assignee_slack_user_id
      : `<@${task.assignee_slack_user_id}>`
    : '_unassigned_';
  const due = task.due_at ? ` · due ${task.due_at.slice(0, 10)}` : '';
  const parent = task.parent_task_id ? '↳ ' : '';
  return `${parent}\`${task.short_code}\` *${task.status}* — ${task.title} (${who})${due}`;
}

function titleKey(title: string, parentTaskId: string | null): string {
  return `${(parentTaskId || 'root').toLowerCase()}::${title.trim().toLowerCase()}`;
}

/** Prefer assigned + earliest-created as the survivor when deduping. */
function pickKeeper(group: PmTask[]): PmTask {
  return [...group].sort((a, b) => {
    const aAssigned = a.assignee_slack_user_id ? 0 : 1;
    const bAssigned = b.assignee_slack_user_id ? 0 : 1;
    if (aAssigned !== bAssigned) return aAssigned - bAssigned;
    return a.created_at.localeCompare(b.created_at);
  })[0];
}

export type CleanupDupPreview = {
  title: string;
  keep: PmTask;
  drop: PmTask[];
};

/**
 * Find open tasks with the same title (case-insensitive) under the same parent.
 * Does not mutate unless `apply` is true (then duplicates are marked complete).
 */
export async function cleanupDuplicateOpenTasks(
  supabase: SupabaseClient,
  workspaceId: string,
  opts?: { apply?: boolean },
): Promise<{ groups: CleanupDupPreview[]; completedCodes: string[] }> {
  const { data, error } = await supabase
    .from('pm_tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .neq('status', 'complete')
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;

  const byKey = new Map<string, PmTask[]>();
  for (const row of (data || []) as PmTask[]) {
    const key = titleKey(row.title, row.parent_task_id);
    const list = byKey.get(key) || [];
    list.push(row);
    byKey.set(key, list);
  }

  const groups: CleanupDupPreview[] = [];
  for (const list of byKey.values()) {
    if (list.length < 2) continue;
    const keep = pickKeeper(list);
    const drop = list.filter((t) => t.id !== keep.id);
    groups.push({ title: keep.title, keep, drop });
  }

  const completedCodes: string[] = [];
  if (opts?.apply && groups.length) {
    const now = new Date().toISOString();
    for (const g of groups) {
      // If keeper is unassigned, inherit an assignee from a duplicate when possible
      if (!g.keep.assignee_slack_user_id) {
        const donor = g.drop.find((t) => t.assignee_slack_user_id);
        if (donor?.assignee_slack_user_id) {
          await supabase
            .from('pm_tasks')
            .update({ assignee_slack_user_id: donor.assignee_slack_user_id })
            .eq('id', g.keep.id);
          g.keep = { ...g.keep, assignee_slack_user_id: donor.assignee_slack_user_id };
        }
      }
      for (const d of g.drop) {
        const { error: upErr } = await supabase
          .from('pm_tasks')
          .update({
            status: 'complete',
            completed_at: now,
            last_status_at: now,
            description: [d.description, `[cleanup] duplicate of ${g.keep.short_code}`]
              .filter(Boolean)
              .join('\n'),
          })
          .eq('id', d.id);
        if (upErr) throw upErr;
        completedCodes.push(d.short_code);
      }
    }
  }

  return { groups, completedCodes };
}

/** Mark every open task complete. Preview when apply is false. */
export async function clearAllOpenTasks(
  supabase: SupabaseClient,
  workspaceId: string,
  opts?: { apply?: boolean },
): Promise<{ openCount: number; completedCodes: string[]; sample: PmTask[] }> {
  const { data, error } = await supabase
    .from('pm_tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .neq('status', 'complete')
    .order('created_at', { ascending: true })
    .limit(500);
  if (error) throw error;

  const open = (data || []) as PmTask[];
  const completedCodes: string[] = [];

  if (opts?.apply && open.length) {
    const now = new Date().toISOString();
    const ids = open.map((t) => t.id);
    // Batch update in chunks
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      const { error: upErr } = await supabase
        .from('pm_tasks')
        .update({
          status: 'complete',
          completed_at: now,
          last_status_at: now,
        })
        .in('id', chunk);
      if (upErr) throw upErr;
    }
    completedCodes.push(...open.map((t) => t.short_code));
  }

  return {
    openCount: open.length,
    completedCodes,
    sample: open.slice(0, 20),
  };
}
