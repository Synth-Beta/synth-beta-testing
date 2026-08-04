import { PM_STATUSES, type PmTaskStatus } from './client.js';

export type ParsedAssign = {
  kind: 'assign';
  assigneeId: string | null;
  /** Plain @name / name when Slack did not send a <@U…> mention token */
  assigneeHint: string | null;
  title: string;
  taskCode: string | null;
  projectRef: string | null;
  due: string | null;
};

export type ParsedCommand =
  | { kind: 'help' }
  | { kind: 'mine' }
  | { kind: 'org' }
  | { kind: 'list'; personId: string | null; projectRef: string | null }
  | ParsedAssign
  | { kind: 'status'; taskCode: string; status: PmTaskStatus }
  | { kind: 'sub'; parentCode: string; title: string }
  | { kind: 'project_create'; name: string }
  | { kind: 'project_list' }
  | { kind: 'cleanup'; apply: boolean }
  | { kind: 'clear'; apply: boolean }
  | { kind: 'digest'; action: 'here' | 'status' | 'on' | 'off' | 'now'; slot?: 'morning' | 'midday' | 'eod' }
  | { kind: 'unknown'; message: string };

const MENTION_RE = /<@([UW][A-Z0-9]+)(?:\|[^>]+)?>/i;

function extractMention(token: string): string | null {
  const m = token.match(MENTION_RE);
  return m ? m[1].toUpperCase() : null;
}

function parseDue(token: string): string | null {
  const m = token.match(/^due:(.+)$/i);
  if (!m) return null;
  const raw = m[1].trim();
  // Accept YYYY-MM-DD or natural-ish Friday → leave as ISO date if parseable
  const iso = Date.parse(raw);
  if (Number.isFinite(iso)) return new Date(iso).toISOString();
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return `${raw}T17:00:00.000Z`;
  return null;
}

export function parseTaskCommand(text: string): ParsedCommand {
  const raw = (text || '').trim();
  if (!raw || raw === 'help') return { kind: 'help' };

  const parts = tokenize(raw);
  const head = (parts[0] || '').toLowerCase();

  if (head === 'mine') return { kind: 'mine' };
  if (head === 'org' || head === 'all') return { kind: 'org' };

  if (head === 'list') {
    let personId: string | null = null;
    let projectRef: string | null = null;
    for (const p of parts.slice(1)) {
      const mention = extractMention(p);
      if (mention) personId = mention;
      else if (p.startsWith('#')) projectRef = p.slice(1);
      else projectRef = p;
    }
    return { kind: 'list', personId, projectRef };
  }

  if (head === 'assign') {
    const rest = parts.slice(1);
    let assigneeId: string | null = null;
    let assigneeHint: string | null = null;
    let projectRef: string | null = null;
    let due: string | null = null;
    let taskCode: string | null = null;
    const titleParts: string[] = [];

    for (const p of rest) {
      const mention = extractMention(p);
      if (mention && !assigneeId) {
        assigneeId = mention;
        continue;
      }
      // Slack sometimes leaves a plain @Name in slash-command text
      if (!assigneeId && !assigneeHint && (/^@[\w.-]+$/i.test(p) || /^me$/i.test(p))) {
        assigneeHint = p.replace(/^@/, '');
        continue;
      }
      const dueVal = parseDue(p);
      if (dueVal) {
        due = dueVal;
        continue;
      }
      if (p.startsWith('#')) {
        projectRef = p.slice(1);
        continue;
      }
      if (/^T-[A-Z0-9]+$/i.test(p) && !taskCode) {
        taskCode = p.toUpperCase();
        continue;
      }
      titleParts.push(p);
    }

    const title = stripQuotes(titleParts.join(' ').trim());
    if (!taskCode && !title) {
      return {
        kind: 'unknown',
        message:
          'Usage: `/task assign @person "Title"` or `/task assign @person T-XXXX` [#project] [due:YYYY-MM-DD]',
      };
    }
    return { kind: 'assign', assigneeId, assigneeHint, title, taskCode, projectRef, due };
  }

  if (head === 'status') {
    const code = parts[1];
    const statusRaw = (parts[2] || '').toLowerCase().replace(/-/g, '_');
    if (!code || !statusRaw) {
      return {
        kind: 'unknown',
        message: `Usage: /task status T-XXXX <${PM_STATUSES.join('|')}>`,
      };
    }
    if (!PM_STATUSES.includes(statusRaw as PmTaskStatus)) {
      return {
        kind: 'unknown',
        message: `Unknown status \`${statusRaw}\`. Use: ${PM_STATUSES.join(', ')}`,
      };
    }
    return { kind: 'status', taskCode: code, status: statusRaw as PmTaskStatus };
  }

  if (head === 'sub') {
    const parentCode = parts[1];
    const title = stripQuotes(parts.slice(2).join(' ').trim());
    if (!parentCode || !title) {
      return { kind: 'unknown', message: 'Usage: /task sub T-XXXX "Sub-task title"' };
    }
    return { kind: 'sub', parentCode, title };
  }

  if (head === 'project') {
    const sub = (parts[1] || '').toLowerCase();
    if (sub === 'list') return { kind: 'project_list' };
    if (sub === 'create') {
      const name = stripQuotes(parts.slice(2).join(' ').trim());
      if (!name) return { kind: 'unknown', message: 'Usage: /task project create "Name"' };
      return { kind: 'project_create', name };
    }
    return { kind: 'unknown', message: 'Usage: /task project create|list …' };
  }

  if (head === 'cleanup' || head === 'dedupe') {
    const sub = (parts[1] || '').toLowerCase();
    const apply = ['confirm', 'apply', 'go', 'yes', 'run'].includes(sub);
    if (sub && !apply && !['preview', 'dry-run', 'dryrun', 'duplicates', 'dupes'].includes(sub)) {
      return {
        kind: 'unknown',
        message:
          'Usage: `/task cleanup` (preview) or `/task cleanup confirm` (mark duplicate open titles complete)',
      };
    }
    return { kind: 'cleanup', apply };
  }

  if (head === 'clear') {
    const rest = parts.slice(1).map((p) => p.toLowerCase());
    const apply = rest.some((p) => ['confirm', 'apply', 'go', 'yes', 'run'].includes(p));
    const okTokens = new Set([
      '',
      'all',
      'tasks',
      'preview',
      'dry-run',
      'dryrun',
      'confirm',
      'apply',
      'go',
      'yes',
      'run',
    ]);
    if (rest.some((p) => !okTokens.has(p))) {
      return {
        kind: 'unknown',
        message:
          'Usage: `/task clear` or `/task clear all` (preview), then `/task clear all confirm` to mark every open task complete',
      };
    }
    return { kind: 'clear', apply };
  }

  if (head === 'digest') {
    const sub = (parts[1] || 'status').toLowerCase();
    if (sub === 'here' || sub === 'set') return { kind: 'digest', action: 'here' };
    if (sub === 'on' || sub === 'enable') return { kind: 'digest', action: 'on' };
    if (sub === 'off' || sub === 'disable') return { kind: 'digest', action: 'off' };
    if (sub === 'status' || sub === 'info') return { kind: 'digest', action: 'status' };
    if (sub === 'now' || sub === 'test') {
      const slotRaw = (parts[2] || 'morning').toLowerCase();
      const slot =
        slotRaw === 'midday' || slotRaw === 'noon'
          ? 'midday'
          : slotRaw === 'eod' || slotRaw === 'evening'
            ? 'eod'
            : 'morning';
      return { kind: 'digest', action: 'now', slot };
    }
    return {
      kind: 'unknown',
      message:
        'Usage: `/task digest here` · `status` · `on` · `off` · `now [morning|midday|eod]`',
    };
  }

  return {
    kind: 'unknown',
    message:
      'Unknown command. Try `/task help` — assign, status, mine, list, cleanup, clear, digest, sub, project.',
  };
}

function stripQuotes(s: string): string {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1).trim();
  }
  return s;
}

/** Split on spaces but keep "quoted phrases" together. */
function tokenize(input: string): string[] {
  const out: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(input))) {
    out.push(m[1] ?? m[2] ?? m[3]);
  }
  return out;
}

export const HELP_TEXT = `*Synth PM commands*

*Visible to the channel*
\`/task assign @person "Title"\` · \`/task assign @person T-XXXX\`
\`/task status T-XXXX <status>\`
\`/task sub T-XXXX "Sub-task title"\`
\`/task project create "Name"\`
\`/notes\` proposals + created tasks

*Only you see*
\`/task mine\` · \`/task org\` · \`/task list [@person|#project]\`
\`/task project list\` · \`/task help\`
\`/task cleanup\` · \`/task clear all\` (+ confirm)
\`/task digest here|status|on|off|now\`
\`/notes help\` · \`/notes modal\` · progress / errors

*Auto digests (channel):* 9am daily to-do · 1pm midday · 5pm EOD (ET)
*Statuses:* \`todo\` · \`active\` · \`in_progress\` · \`blocked\` · \`stalled\` · \`complete\``;
