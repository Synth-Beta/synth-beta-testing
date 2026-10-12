export const SOURCE_LABELS: Record<string, string> = {
  organic_search: 'Search engines',
  ai_assistant: 'AI assistants',
  social: 'Social',
  referral: 'Other sites',
  direct: 'Direct',
  email: 'Email',
  paid: 'Paid',
  internal: 'Internal',
  other: 'Other',
  unknown: 'Unknown',
};

export const SOURCE_COLORS: Record<string, string> = {
  organic_search: '#2563eb',
  ai_assistant: '#db2777',
  social: '#f59e0b',
  referral: '#10b981',
  direct: '#64748b',
  other: '#a855f7',
};

export const PLATFORM_COLORS: Record<string, string> = {
  chatgpt: '#10a37f',
  perplexity: '#1f6feb',
  gemini: '#f59e0b',
};

export const PLATFORM_LABELS: Record<string, string> = {
  chatgpt: 'ChatGPT search',
  perplexity: 'Perplexity',
  gemini: 'Gemini',
};

/** One row per day in the range so quiet days show as zero instead of disappearing. */
export function fillDays<T extends { day: string }>(rows: T[], days: number, empty: Omit<T, 'day'>): T[] {
  const byDay = new Map(rows.map((r) => [r.day, r]));
  const out: T[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const day = new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10);
    out.push(byDay.get(day) ?? ({ day, ...empty } as T));
  }
  return out;
}

export const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString());
export const pct = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : '—');
export const shortDay = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
