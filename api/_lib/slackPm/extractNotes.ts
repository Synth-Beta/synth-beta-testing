export type ExtractedActionItem = {
  title: string;
  assignee_hint: string | null;
  /** Resolved Slack user id when known (preferred over assignee_hint). */
  assignee_slack_user_id?: string | null;
  project_hint: string | null;
  due_hint: string | null;
  subtasks: string[];
};

export type NotesExtraction = {
  meeting_title: string | null;
  action_items: ExtractedActionItem[];
};

export type MemberRow = {
  slack_user_id: string;
  display_name: string | null;
  real_name: string | null;
};

function memberLabel(m: MemberRow): string {
  const real = m.real_name?.trim();
  const display = m.display_name?.trim();
  if (real && display && real.toLowerCase() !== display.toLowerCase()) {
    return `${real} (aka ${display})`;
  }
  return real || display || m.slack_user_id;
}

function nameTokens(m: MemberRow): string[] {
  const raw = [m.real_name, m.display_name].filter(Boolean).join(' ');
  return raw
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

/**
 * Resolve a hint to a real Slack user id from the member directory.
 * Rejects invented ids that are not in the directory.
 */
export function resolveAssigneeHint(
  hint: string | null | undefined,
  members: MemberRow[],
  validIds?: Set<string>,
): string | null {
  if (!hint) return null;
  const h = hint.trim();
  const ids = validIds ?? new Set(members.map((m) => m.slack_user_id));

  const mention = h.match(/<@([UW][A-Z0-9]+)(?:\|[^>]+)?>/i);
  if (mention) {
    const id = mention[1].toUpperCase();
    return ids.has(id) ? id : null;
  }

  if (/^[UW][A-Z0-9]+$/i.test(h)) {
    const id = h.toUpperCase();
    return ids.has(id) ? id : null;
  }

  const lower = h.toLowerCase().replace(/^@/, '').trim();
  if (!lower) return null;

  // Exact full display/real name
  const exact = members.find((m) => {
    const names = [m.display_name, m.real_name]
      .filter(Boolean)
      .map((n) => n!.toLowerCase().trim());
    return names.includes(lower);
  });
  if (exact) return exact.slack_user_id;

  // Unique first-name / last-name / token match
  const tokenHits = members.filter((m) => {
    const tokens = nameTokens(m);
    if (tokens.includes(lower)) return true;
    // "sam loiterstein" vs directory "Sam Loiterstein"
    const full = [m.real_name, m.display_name]
      .filter(Boolean)
      .map((n) => n!.toLowerCase());
    return full.some((n) => n.startsWith(lower) || lower.startsWith(n) || n.includes(lower));
  });

  if (tokenHits.length === 1) return tokenHits[0].slack_user_id;

  // Prefer unique first-token (first name) match when ambiguous full matches
  const firstNameHits = members.filter((m) => nameTokens(m)[0] === lower);
  if (firstNameHits.length === 1) return firstNameHits[0].slack_user_id;

  return null;
}

/** Scan title + surrounding text for a unique teammate name. */
export function inferAssigneeFromText(
  text: string,
  members: MemberRow[],
): string | null {
  if (!text || !members.length) return null;
  const lower = text.toLowerCase();
  const hits = new Set<string>();

  for (const m of members) {
    const labels = [m.real_name, m.display_name].filter(Boolean) as string[];
    for (const label of labels) {
      const l = label.toLowerCase().trim();
      if (l.length < 2) continue;
      if (lower.includes(l)) hits.add(m.slack_user_id);
    }
    const first = nameTokens(m)[0];
    if (first && first.length >= 3) {
      // word-boundary-ish: "sam will" / "— sam" / "@sam"
      const re = new RegExp(`(?:^|[^a-z])@?${first}(?:[^a-z]|$)`, 'i');
      if (re.test(text)) hits.add(m.slack_user_id);
    }
  }

  if (hits.size === 1) return [...hits][0];
  return null;
}

export function applyAutoAssignees(
  extraction: NotesExtraction,
  members: MemberRow[],
  notesText?: string,
): NotesExtraction {
  const validIds = new Set(members.map((m) => m.slack_user_id));
  extraction.action_items = (extraction.action_items || []).map((item) => {
    let assignee =
      item.assignee_slack_user_id && validIds.has(item.assignee_slack_user_id)
        ? item.assignee_slack_user_id
        : null;
    if (!assignee) {
      assignee = resolveAssigneeHint(item.assignee_hint, members, validIds);
    }
    if (!assignee) {
      assignee = inferAssigneeFromText(item.title, members);
    }
    if (!assignee && notesText) {
      // Look for "Title … — Sam" patterns in nearby note lines
      const lines = notesText.split(/\r?\n/);
      const hit = lines.find((l) => l.toLowerCase().includes(item.title.toLowerCase().slice(0, 24)));
      if (hit) assignee = inferAssigneeFromText(hit, members);
    }
    return {
      ...item,
      assignee_slack_user_id: assignee,
      assignee_hint: assignee || item.assignee_hint,
    };
  });
  return extraction;
}

export async function extractActionItemsFromNotes(
  notes: string,
  memberDirectory: MemberRow[],
): Promise<NotesExtraction> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return applyAutoAssignees(heuristicExtract(notes), memberDirectory, notes);
  }

  const directory = memberDirectory
    .map((m) => `- ${memberLabel(m)} → ${m.slack_user_id}`)
    .slice(0, 80)
    .join('\n');

  const system = `You extract actionable tasks from meeting notes for a Slack org todo system.
Return ONLY valid JSON matching:
{"meeting_title": string|null, "action_items":[{"title":string,"assignee_hint":string|null,"assignee_slack_user_id":string|null,"project_hint":string|null,"due_hint":string|null,"subtasks":string[]}]}
Rules:
- Only real action items (not discussion summaries).
- AUTO-ASSIGN: When notes imply an owner ("Sam will…", "Owner: Sam", "@Sam", "Sam to…", "action for Sam"), set assignee_slack_user_id to that person's EXACT id from the directory.
- assignee_slack_user_id must be an exact id from the directory, or null. NEVER invent ids (no U123 placeholders).
- assignee_hint: person's name as written in the notes (or null).
- If the owner is clear, always set assignee_slack_user_id — do not leave assigned work unassigned.
- Keep titles short and imperative (drop the person's name from the title when possible).
- due_hint as YYYY-MM-DD if mentioned, else null.
- Deduplicate near-identical action items.
- Max 15 action items.`;

  const user = `Team directory (name → slack id):\n${directory || '(empty — leave assignees null)'}\n\nMeeting notes:\n${notes.slice(0, 12000)}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_PM_MODEL?.trim() || 'gpt-4o-mini',
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    console.error('[slack-pm] OpenAI extract failed', res.status, errText.slice(0, 300));
    return applyAutoAssignees(heuristicExtract(notes), memberDirectory, notes);
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(content) as NotesExtraction;
    if (!Array.isArray(parsed.action_items)) parsed.action_items = [];
    parsed.action_items = parsed.action_items.slice(0, 15);
    return applyAutoAssignees(parsed, memberDirectory, notes);
  } catch {
    return applyAutoAssignees(heuristicExtract(notes), memberDirectory, notes);
  }
}

function heuristicExtract(notes: string): NotesExtraction {
  const lines = notes
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const action_items: ExtractedActionItem[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const m = line.match(/^(?:[-*•]|\d+[.)])\s*(?:TODO[:\s]+|ACTION[:\s]+|AI[:\s]+)?(.+)$/i);
    if (!m) continue;
    let title = m[1].trim();
    let assignee_hint: string | null = null;
    const assignMatch = title.match(
      /@([\w.\-]+)|(?:for|→|->|owner:)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i,
    );
    if (assignMatch) {
      assignee_hint = assignMatch[1] || assignMatch[2] || null;
      title = title.replace(assignMatch[0], '').replace(/\s{2,}/g, ' ').trim();
    }
    if (title.length < 4) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    action_items.push({
      title,
      assignee_hint,
      assignee_slack_user_id: null,
      project_hint: null,
      due_hint: null,
      subtasks: [],
    });
    if (action_items.length >= 15) break;
  }

  return {
    meeting_title: lines[0]?.slice(0, 80) || null,
    action_items,
  };
}
