import type { SupabaseClient } from '@supabase/supabase-js';
import { slackApi } from './client.js';
import { formatTaskLine, type PmTask } from './tasks.js';

export type DigestKind = 'morning' | 'midday' | 'eod';

const STATUS_HELP =
  '*Update tasks:* `/task status T-XXXX active` · `in_progress` · `blocked` · `complete`\n' +
  '_Also:_ `/task assign @person T-XXXX` · `/task mine` · `/task org`';

function localParts(timeZone: string, now = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(now).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    date: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour),
  };
}

/** Map local hour → digest kind (9am, 1pm midday, 5pm EOD). */
export function digestKindForLocalHour(hour: number): DigestKind | null {
  if (hour === 9) return 'morning';
  if (hour === 13) return 'midday';
  if (hour === 17) return 'eod';
  return null;
}

export function digestKey(date: string, kind: DigestKind): string {
  return `${date}:${kind}`;
}

function groupByAssignee(tasks: PmTask[]): Map<string | null, PmTask[]> {
  const map = new Map<string | null, PmTask[]>();
  for (const t of tasks) {
    const key = t.assignee_slack_user_id || null;
    const list = map.get(key) || [];
    list.push(t);
    map.set(key, list);
  }
  return map;
}

function linesForGroup(tasks: PmTask[], limit = 12): string {
  return tasks
    .slice(0, limit)
    .map((t) => `• ${formatTaskLine(t)}`)
    .join('\n');
}

function localDateString(timeZone: string, iso: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

export function buildDigestMessage(
  kind: DigestKind,
  tasks: PmTask[],
  opts?: { timeZone?: string; localDate?: string },
): {
  text: string;
  blocks: Record<string, unknown>[];
} {
  const open = tasks.filter((t) => t.status !== 'complete');
  const byStatus = (s: string) => open.filter((t) => t.status === s);
  const tz = opts?.timeZone || 'America/New_York';
  const today = opts?.localDate || localParts(tz).date;

  if (kind === 'morning') {
    const groups = groupByAssignee(open);
    const sections: string[] = [];
    for (const [uid, list] of groups) {
      const who = uid ? `<@${uid}>` : '*Unassigned*';
      sections.push(`${who} (${list.length})\n${linesForGroup(list)}`);
    }
    const body =
      sections.length > 0
        ? sections.join('\n\n')
        : '_No open tasks — enjoy the quiet morning._';
    const text = `*Daily to-do (9am)*\n${body}\n\n${STATUS_HELP}`;
    return {
      text,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Daily to-do — 9am', emoji: true },
        },
        { type: 'section', text: { type: 'mrkdwn', text: body.slice(0, 2900) } },
        { type: 'section', text: { type: 'mrkdwn', text: STATUS_HELP } },
      ],
    };
  }

  if (kind === 'midday') {
    const active = [...byStatus('active'), ...byStatus('in_progress')];
    const blocked = [...byStatus('blocked'), ...byStatus('stalled')];
    const todo = byStatus('todo');
    const parts = [
      `*In progress* (${active.length})\n${active.length ? linesForGroup(active) : '_None marked active/in_progress._'}`,
      `*Blocked / stalled* (${blocked.length})\n${blocked.length ? linesForGroup(blocked) : '_None._'}`,
      `*Still todo* (${todo.length})\n${todo.length ? linesForGroup(todo, 8) : '_None._'}`,
    ];
    const body = parts.join('\n\n');
    const nudge =
      'Midday check-in: mark what you’re working on, what’s done, or what’s blocked.\n' + STATUS_HELP;
    return {
      text: `*Midday update*\n${body}\n\n${nudge}`,
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: 'Midday update', emoji: true },
        },
        { type: 'section', text: { type: 'mrkdwn', text: body.slice(0, 2900) } },
        { type: 'section', text: { type: 'mrkdwn', text: nudge } },
      ],
    };
  }

  // EOD
  const completedToday = tasks.filter(
    (t) =>
      t.status === 'complete' &&
      t.completed_at &&
      localDateString(tz, t.completed_at) === today,
  );
  const blocked = [...byStatus('blocked'), ...byStatus('stalled')];
  const stillOpen = open.filter((t) => !['blocked', 'stalled'].includes(t.status));
  const parts = [
    `*Done today* (${completedToday.length})\n${completedToday.length ? linesForGroup(completedToday) : '_Nothing marked complete yet._'}`,
    `*Still open* (${stillOpen.length})\n${stillOpen.length ? linesForGroup(stillOpen, 10) : '_Inbox zero._'}`,
    `*Blocked* (${blocked.length})\n${blocked.length ? linesForGroup(blocked) : '_None._'}`,
  ];
  const body = parts.join('\n\n');
  const nudge =
    'EOD: close out wins and flag blockers before you sign off.\n' + STATUS_HELP;
  return {
    text: `*EOD results*\n${body}\n\n${nudge}`,
    blocks: [
      {
        type: 'header',
        text: { type: 'plain_text', text: 'EOD results', emoji: true },
      },
      { type: 'section', text: { type: 'mrkdwn', text: body.slice(0, 2900) } },
      { type: 'section', text: { type: 'mrkdwn', text: nudge } },
    ],
  };
}

export async function loadTasksForDigest(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<PmTask[]> {
  const { data, error } = await supabase
    .from('pm_tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('updated_at', { ascending: false })
    .limit(200);
  if (error) throw error;
  return (data || []) as PmTask[];
}

async function resolveDigestChannel(
  supabase: SupabaseClient,
  workspace: { id: string; digest_channel_id?: string | null },
): Promise<string | null> {
  if (workspace.digest_channel_id) return workspace.digest_channel_id;
  const envChannel = process.env.SLACK_PM_DIGEST_CHANNEL?.trim();
  if (envChannel) return envChannel;

  // Fall back to the most recent channel that used /notes or stored a note
  const { data } = await supabase
    .from('pm_meeting_notes')
    .select('channel_id')
    .eq('workspace_id', workspace.id)
    .not('channel_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.channel_id || null;
}

export async function postDigestForWorkspace(params: {
  supabase: SupabaseClient;
  workspace: {
    id: string;
    digest_channel_id?: string | null;
    digest_timezone?: string | null;
    digest_enabled?: boolean | null;
    last_digest_key?: string | null;
  };
  kind?: DigestKind | null;
  force?: boolean;
}): Promise<{ posted: boolean; kind?: DigestKind; reason?: string; channel?: string }> {
  const { supabase, workspace, force } = params;
  if (workspace.digest_enabled === false) {
    return { posted: false, reason: 'disabled' };
  }
  const channel = await resolveDigestChannel(supabase, workspace);
  if (!channel) {
    return { posted: false, reason: 'no_channel' };
  }

  const tz = workspace.digest_timezone || process.env.SLACK_PM_TZ || 'America/New_York';
  const { date, hour } = localParts(tz);
  const kind = params.kind ?? digestKindForLocalHour(hour);
  if (!kind) {
    return { posted: false, reason: 'not_digest_hour' };
  }

  const key = digestKey(date, kind);
  if (!force && workspace.last_digest_key === key) {
    return { posted: false, kind, reason: 'already_sent', channel };
  }

  const tasks = await loadTasksForDigest(supabase, workspace.id);
  const msg = buildDigestMessage(kind, tasks, { timeZone: tz, localDate: date });

  const posted = await slackApi('chat.postMessage', {
    channel,
    text: msg.text,
    blocks: msg.blocks,
  });
  if (!posted.ok) {
    console.error('[slack-pm/digest] post failed', {
      error: posted.error,
      channel,
      kind,
    });
    return { posted: false, kind, reason: posted.error || 'slack_error', channel };
  }

  // Morning: DM each assignee their personal list
  if (kind === 'morning') {
    const open = tasks.filter((t) => t.status !== 'complete' && t.assignee_slack_user_id);
    const byUser = groupByAssignee(open);
    for (const [uid, list] of byUser) {
      if (!uid) continue;
      const personal =
        `*Your daily to-do*\n${linesForGroup(list)}\n\n` +
        `When you start / finish / get stuck:\n` +
        `\`/task status T-XXXX active\` · \`in_progress\` · \`blocked\` · \`complete\``;
      await slackApi('chat.postMessage', { channel: uid, text: personal }).catch(() => undefined);
    }
  }

  // Persist channel + idempotency key when columns exist (migration applied)
  const { error: upErr } = await supabase
    .from('pm_workspaces')
    .update({
      last_digest_key: key,
      digest_channel_id: workspace.digest_channel_id || channel,
    })
    .eq('id', workspace.id);
  if (upErr) {
    console.warn('[slack-pm/digest] could not persist digest state', upErr.message);
  }

  return { posted: true, kind, channel };
}

export async function runScheduledDigests(supabase: SupabaseClient): Promise<{
  results: { workspaceId: string; posted: boolean; kind?: DigestKind; reason?: string }[];
}> {
  const { data: workspaces, error } = await supabase.from('pm_workspaces').select('*');
  if (error) throw error;

  const results: { workspaceId: string; posted: boolean; kind?: DigestKind; reason?: string }[] =
    [];
  for (const ws of workspaces || []) {
    const r = await postDigestForWorkspace({ supabase, workspace: ws });
    results.push({ workspaceId: ws.id, ...r });
  }
  return { results };
}
