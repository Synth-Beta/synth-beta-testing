import { PM_STATUSES, type PmTaskStatus } from './client.js';

export type ParsedAssign = {
  kind: 'assign';
  assigneeId: string | null;
  title: string;
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
  | { kind: 'unknown'; message: string };

const MENTION_RE = /^<@([A-Z0-9]+)(?:\|[^>]+)?>$/i;

function extractMention(token: string): string | null {
  const m = token.match(MENTION_RE);
  return m ? m[1] : null;
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
    let projectRef: string | null = null;
    let due: string | null = null;
    const titleParts: string[] = [];

    for (const p of rest) {
      const mention = extractMention(p);
      if (mention && !assigneeId) {
        assigneeId = mention;
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
      titleParts.push(p);
    }

    const title = stripQuotes(titleParts.join(' ').trim());
    if (!title) {
      return { kind: 'unknown', message: 'Usage: /task assign @person "Title" [#project] [due:YYYY-MM-DD]' };
    }
    return { kind: 'assign', assigneeId, title, projectRef, due };
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

  return {
    kind: 'unknown',
    message:
      'Unknown command. Try `/task help` — assign, status, mine, list, sub, project create|list.',
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

\`/task assign @person "Title" [#project] [due:YYYY-MM-DD]\`
\`/task status T-XXXX <todo|active|in_progress|blocked|stalled|complete>\`
\`/task mine\` — your open tasks
\`/task org\` — full org open todo list
\`/task list [@person|#project]\`
\`/task sub T-XXXX "Sub-task title"\`
\`/task project create "Name"\`
\`/task project list\`

\`/notes\` — upload PDF/DOCX/TXT then \`/notes\` · or paste \`/notes …text…\` · or \`/notes modal\`

*Statuses:* \`todo\` · \`active\` (working now) · \`in_progress\` · \`blocked\` · \`stalled\` · \`complete\``;
