import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type PmTaskStatus =
  | 'todo'
  | 'active'
  | 'in_progress'
  | 'blocked'
  | 'stalled'
  | 'complete';

export const PM_STATUSES: PmTaskStatus[] = [
  'todo',
  'active',
  'in_progress',
  'blocked',
  'stalled',
  'complete',
];

export function getSupabaseService(): SupabaseClient | null {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.VITE_SUPABASE_URL?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function getSlackConfig() {
  const botToken = process.env.SLACK_PM_BOT_TOKEN?.trim();
  const signingSecret = process.env.SLACK_PM_SIGNING_SECRET?.trim();
  return {
    botToken: botToken || null,
    signingSecret: signingSecret || null,
  };
}

export async function slackApi<T = Record<string, unknown>>(
  method: string,
  body: Record<string, unknown>,
  token?: string | null,
): Promise<T & { ok: boolean; error?: string }> {
  const botToken = token ?? getSlackConfig().botToken;
  if (!botToken) {
    return { ok: false, error: 'SLACK_PM_BOT_TOKEN not configured' } as T & {
      ok: boolean;
      error?: string;
    };
  }
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${botToken}`,
      'Content-Type': 'application/json; charset=utf-8',
    },
    body: JSON.stringify(body),
  });
  return (await res.json()) as T & { ok: boolean; error?: string };
}

export async function ensureWorkspace(
  supabase: SupabaseClient,
  teamId: string,
  teamName?: string | null,
) {
  const { data: existing } = await supabase
    .from('pm_workspaces')
    .select('*')
    .eq('slack_team_id', teamId)
    .maybeSingle();
  if (existing) return existing;

  const { data, error } = await supabase
    .from('pm_workspaces')
    .insert({ slack_team_id: teamId, name: teamName || teamId })
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

export async function upsertMember(
  supabase: SupabaseClient,
  workspaceId: string,
  slackUserId: string,
  profile?: { display_name?: string | null; real_name?: string | null; email?: string | null },
) {
  const { data, error } = await supabase
    .from('pm_members')
    .upsert(
      {
        workspace_id: workspaceId,
        slack_user_id: slackUserId,
        display_name: profile?.display_name || null,
        real_name: profile?.real_name || null,
        email: profile?.email || null,
        is_active: true,
      },
      { onConflict: 'workspace_id,slack_user_id' },
    )
    .select('*')
    .single();
  if (error) throw error;
  return data;
}

/** Pull channel members into pm_members so assignee matching / pickers work. */
export async function syncChannelMembers(
  supabase: SupabaseClient,
  workspaceId: string,
  channelId: string,
): Promise<{ slack_user_id: string; display_name: string | null; real_name: string | null }[]> {
  const members: { slack_user_id: string; display_name: string | null; real_name: string | null }[] =
    [];
  let cursor: string | undefined;
  for (let page = 0; page < 10; page++) {
    const listed = await slackApi<{
      members?: string[];
      response_metadata?: { next_cursor?: string };
    }>('conversations.members', {
      channel: channelId,
      limit: 200,
      ...(cursor ? { cursor } : {}),
    });
    if (!listed.ok) {
      console.warn('[slack-pm] conversations.members failed', listed.error);
      break;
    }
    for (const uid of listed.members || []) {
      const info = await slackApi<{
        user?: {
          id?: string;
          deleted?: boolean;
          is_bot?: boolean;
          profile?: { display_name?: string; real_name?: string; email?: string };
          real_name?: string;
        };
      }>('users.info', { user: uid });
      const u = info.user;
      if (!u?.id || u.deleted || u.is_bot) continue;
      const display = u.profile?.display_name || null;
      const real = u.profile?.real_name || u.real_name || null;
      await upsertMember(supabase, workspaceId, u.id, {
        display_name: display,
        real_name: real,
        email: u.profile?.email || null,
      });
      members.push({ slack_user_id: u.id, display_name: display, real_name: real });
    }
    cursor = listed.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  return members;
}

