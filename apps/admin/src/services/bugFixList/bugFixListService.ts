import { supabase } from '@/integrations/supabase/client';
import type { AdminBugTask, AdminBugTaskRow } from './types';

// Tables like admin_bug_tasks / users exist in DB but may not be in generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function throwDbError(error: { message?: string; details?: string; hint?: string; code?: string } | null): never {
  const parts = [error?.message, error?.details, error?.hint].filter(Boolean);
  throw new Error(parts.join(' — ') || 'Database request failed');
}

function firstName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return 'Unknown';
  return trimmed.split(/\s+/)[0] ?? trimmed;
}

async function fetchNameMap(userIds: string[]): Promise<Record<string, string>> {
  const unique = [...new Set(userIds.filter(Boolean))];
  if (unique.length === 0) return {};

  const { data, error } = await db
    .from('users')
    .select('user_id, name')
    .in('user_id', unique);

  if (error) throwDbError(error);

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    map[row.user_id] = firstName(row.name) || 'Unknown';
  }
  return map;
}

function mapRow(row: AdminBugTaskRow, names: Record<string, string>): AdminBugTask {
  return {
    id: row.id,
    description: row.description,
    authorId: row.author_id,
    authorName: names[row.author_id] ?? 'Unknown',
    assigneeId: row.assignee_id,
    assigneeName: row.assignee_id ? names[row.assignee_id] ?? 'Unknown' : null,
    status: row.status,
    createdAt: row.created_at,
    fixedAt: row.fixed_at,
  };
}

export async function listBugTasks(): Promise<AdminBugTask[]> {
  const { data, error } = await db
    .from('admin_bug_tasks')
    .select('id, description, author_id, assignee_id, status, created_at, fixed_at')
    .order('created_at', { ascending: false });

  if (error) throwDbError(error);

  const rows = (data ?? []) as AdminBugTaskRow[];
  const names = await fetchNameMap(
    rows.flatMap((row) => [row.author_id, row.assignee_id].filter(Boolean) as string[]),
  );
  return rows.map((row) => mapRow(row, names));
}

export async function createBugTask(description: string, authorId: string): Promise<AdminBugTask> {
  const trimmed = description.trim();
  if (!trimmed) throw new Error('Description is required');

  const { data, error } = await db
    .from('admin_bug_tasks')
    .insert({
      description: trimmed,
      author_id: authorId,
      status: 'open',
    })
    .select('id, description, author_id, assignee_id, status, created_at, fixed_at')
    .single();

  if (error) throwDbError(error);

  const row = data as AdminBugTaskRow;
  const names = await fetchNameMap([row.author_id]);
  return mapRow(row, names);
}

export async function claimBugTask(taskId: string, userId: string): Promise<AdminBugTask> {
  const { data: existing, error: fetchError } = await db
    .from('admin_bug_tasks')
    .select('id, description, author_id, assignee_id, status, created_at, fixed_at')
    .eq('id', taskId)
    .single();

  if (fetchError) throwDbError(fetchError);
  const current = existing as AdminBugTaskRow;
  if (current.status !== 'open') throw new Error('Only open tasks can be claimed');
  if (current.assignee_id) throw new Error('This task is already claimed');

  const { data, error } = await db
    .from('admin_bug_tasks')
    .update({ assignee_id: userId })
    .eq('id', taskId)
    .is('assignee_id', null)
    .eq('status', 'open')
    .select('id, description, author_id, assignee_id, status, created_at, fixed_at')
    .maybeSingle();

  if (error) throwDbError(error);
  if (!data) throw new Error('Could not claim task — it may have just been claimed');

  const row = data as AdminBugTaskRow;
  const names = await fetchNameMap([row.author_id, row.assignee_id].filter(Boolean) as string[]);
  return mapRow(row, names);
}

export async function unclaimBugTask(taskId: string, userId: string): Promise<AdminBugTask> {
  const { data: existing, error: fetchError } = await db
    .from('admin_bug_tasks')
    .select('id, description, author_id, assignee_id, status, created_at, fixed_at')
    .eq('id', taskId)
    .single();

  if (fetchError) throwDbError(fetchError);
  const current = existing as AdminBugTaskRow;
  if (current.status !== 'open') throw new Error('Only open tasks can be unclaimed');
  if (current.assignee_id !== userId) throw new Error('You can only unclaim your own tasks');

  const { data, error } = await db
    .from('admin_bug_tasks')
    .update({ assignee_id: null })
    .eq('id', taskId)
    .eq('assignee_id', userId)
    .eq('status', 'open')
    .select('id, description, author_id, assignee_id, status, created_at, fixed_at')
    .maybeSingle();

  if (error) throwDbError(error);
  if (!data) throw new Error('Could not unclaim task');

  const row = data as AdminBugTaskRow;
  const names = await fetchNameMap([row.author_id]);
  return mapRow(row, names);
}

export async function markBugTaskFixed(taskId: string, userId: string): Promise<AdminBugTask> {
  const { data: existing, error: fetchError } = await db
    .from('admin_bug_tasks')
    .select('id, description, author_id, assignee_id, status, created_at, fixed_at')
    .eq('id', taskId)
    .single();

  if (fetchError) throwDbError(fetchError);
  const current = existing as AdminBugTaskRow;
  if (current.status !== 'open') throw new Error('Task is already fixed');
  if (current.assignee_id !== userId) throw new Error('Only the assignee can mark a task as fixed');

  const { data, error } = await db
    .from('admin_bug_tasks')
    .update({ status: 'fixed', fixed_at: new Date().toISOString() })
    .eq('id', taskId)
    .eq('assignee_id', userId)
    .eq('status', 'open')
    .select('id, description, author_id, assignee_id, status, created_at, fixed_at')
    .maybeSingle();

  if (error) throwDbError(error);
  if (!data) throw new Error('Could not mark task as fixed');

  const row = data as AdminBugTaskRow;
  const names = await fetchNameMap([row.author_id, row.assignee_id].filter(Boolean) as string[]);
  return mapRow(row, names);
}

export async function unfixBugTask(taskId: string): Promise<AdminBugTask> {
  const { data, error } = await db
    .from('admin_bug_tasks')
    .update({ status: 'open', fixed_at: null })
    .eq('id', taskId)
    .eq('status', 'fixed')
    .select('id, description, author_id, assignee_id, status, created_at, fixed_at')
    .maybeSingle();

  if (error) throwDbError(error);
  if (!data) throw new Error('Could not reopen task');

  const row = data as AdminBugTaskRow;
  const names = await fetchNameMap([row.author_id, row.assignee_id].filter(Boolean) as string[]);
  return mapRow(row, names);
}

export async function fetchCurrentAdminProfile(userId: string): Promise<{ name: string } | null> {
  const { data, error } = await db
    .from('users')
    .select('name')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throwDbError(error);
  if (!data) return null;
  return { name: firstName(data.name) };
}
