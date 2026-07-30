export type ExtractedActionItem = {
  title: string;
  assignee_hint: string | null;
  project_hint: string | null;
  due_hint: string | null;
  subtasks: string[];
};

export type NotesExtraction = {
  meeting_title: string | null;
  action_items: ExtractedActionItem[];
};

export async function extractActionItemsFromNotes(
  notes: string,
  memberDirectory: { slack_user_id: string; display_name: string | null; real_name: string | null }[],
): Promise<NotesExtraction> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) {
    return heuristicExtract(notes);
  }

  const directory = memberDirectory
    .map((m) => `- ${m.real_name || m.display_name || m.slack_user_id} (${m.slack_user_id})`)
    .slice(0, 80)
    .join('\n');

  const system = `You extract actionable tasks from meeting notes for a Slack org todo system.
Return ONLY valid JSON matching:
{"meeting_title": string|null, "action_items":[{"title":string,"assignee_hint":string|null,"project_hint":string|null,"due_hint":string|null,"subtasks":string[]}]}
Rules:
- Only real action items (not discussion summaries).
- assignee_hint should be a Slack user id from the directory when you can match a name; else a name string; else null.
- Keep titles short and imperative.
- due_hint as YYYY-MM-DD if mentioned, else null.
- Max 20 action items.`;

  const user = `Team directory:\n${directory || '(empty)'}\n\nMeeting notes:\n${notes.slice(0, 12000)}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_PM_MODEL?.trim() || 'gpt-4o-mini',
      temperature: 0.2,
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
    return heuristicExtract(notes);
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content || '{}';
  try {
    const parsed = JSON.parse(content) as NotesExtraction;
    if (!Array.isArray(parsed.action_items)) parsed.action_items = [];
    return parsed;
  } catch {
    return heuristicExtract(notes);
  }
}

/** Fallback when OPENAI_API_KEY is missing: lines that look like action items. */
function heuristicExtract(notes: string): NotesExtraction {
  const lines = notes
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const action_items: ExtractedActionItem[] = [];
  for (const line of lines) {
    const m = line.match(/^(?:[-*•]|\d+[.)])\s*(?:TODO[:\s]+|ACTION[:\s]+|AI[:\s]+)?(.+)$/i);
    if (!m) continue;
    let title = m[1].trim();
    let assignee_hint: string | null = null;
    const assignMatch = title.match(/@([\w.\-]+)|(?:for|→|->)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/);
    if (assignMatch) {
      assignee_hint = assignMatch[1] || assignMatch[2] || null;
      title = title.replace(assignMatch[0], '').replace(/\s{2,}/g, ' ').trim();
    }
    if (title.length < 4) continue;
    action_items.push({
      title,
      assignee_hint,
      project_hint: null,
      due_hint: null,
      subtasks: [],
    });
    if (action_items.length >= 20) break;
  }

  return {
    meeting_title: lines[0]?.slice(0, 80) || null,
    action_items,
  };
}

export function resolveAssigneeHint(
  hint: string | null | undefined,
  members: { slack_user_id: string; display_name: string | null; real_name: string | null }[],
): string | null {
  if (!hint) return null;
  const h = hint.trim();
  if (/^[UW][A-Z0-9]+$/i.test(h)) return h.toUpperCase();

  const lower = h.toLowerCase();
  const match = members.find((m) => {
    const names = [m.display_name, m.real_name].filter(Boolean).map((n) => n!.toLowerCase());
    return names.some((n) => n === lower || n.includes(lower) || lower.includes(n));
  });
  return match?.slack_user_id || null;
}
