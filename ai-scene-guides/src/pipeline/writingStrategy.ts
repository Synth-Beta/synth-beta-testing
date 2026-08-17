/**
 * Editable voice + strategy for AI Scene Guides.
 * Stored on ai_scene_guides_settings.writing_strategy so ops can change
 * copy without shipping a new commit. Code defaults are the fallback.
 */

export type WritingStrategy = {
  /** Tone / persona notes shown to generators. */
  voice: string;
  /** Conversation rules and what to avoid. */
  strategy: string;
  /** One template per line. Placeholders: {artist} {venue} {date} {city} {doors} {start} {genre} */
  openerTemplates: string[];
};

export const DEFAULT_WRITING_STRATEGY: WritingStrategy = {
  voice:
    'Disclosed AI Scene Guide. Informal, specific, genre-native. Short reactions are fine; also write 21–45 word explanations. No marketing hype, no lived-experience claims, no JamBase/listing/validator language in chat copy.',
  strategy:
    'One contribution per room-state decision. Prefer POST over filler. Replies must address a parent span and answer questions first. Never prewrite unsent future turns. Bind each persona 1:1 to a sender. Fail exact duplicates and oversized template families. Human-review in context before treating gates as final success.',
  openerTemplates: [
    '{artist} plays {venue} on {date}. Start {start}; doors {doors}',
    'Quick timing note: {artist} at {venue} is {start} on {date}, doors {doors}',
    "If you're timing {artist} on {date}, doors are {doors} at {venue}",
    "Door time for {artist}: {doors} on {date}. That's the number I'd plan around",
    '{doors} doors for {artist}. I would treat that as the arrival target on {date}',
    '{start} start for {artist} at {venue} on {date}',
    'Calendar hold: {artist}, {date}, {start} at {venue}',
    '{artist} hits {city} on {date} ({venue}), {start}',
    '{city} date for {artist} is {date} at {venue}',
    '{venue} has {artist} on {date}',
    '{artist} on {date} at {venue}',
    'Marking {artist} / {date} / {venue}',
    'Putting {artist} on the radar for {date} at {venue}',
    '{date}: {artist} lands at {venue}',
    'Hold {date} if {artist} at {venue} is on your shortlist',
    'Anyone watching {artist} around {date}? {venue} is the stop',
    'Hard date check: {artist}, {venue}, {date}',
    "{artist} / {venue} / {date}: that's the triangle I'm tracking",
    '{artist} on {date}',
    'Noting {venue} for {date}',
    '{date} for {artist}',
    '{venue} on {date}',
    "For {artist} on {date}, I'd rather hear deep cuts than the streaming single. The album side usually shows what the night is actually about.",
    'No confirmed setlist for {artist} yet. Song guesses before the show are predictions, not facts.',
    "I'm less interested in {artist}'s radio cuts for {date}. Mid-catalog is where I'd start listening ahead of time.",
    'For {artist} on {date}, the opener is honestly the interesting part of the bill if support looks good.',
    "If {artist} is new to you, start with one recent live cut, then the studio record. Easier than jumping into a compilation.",
    "I'd take the later slot for {artist} on {date}. Lighting and mix matter more to me than catching the first song.",
    'Opener or headliner for {artist} on {date}?',
    'Which recent live cut would you start with for {artist}?',
    'Lighting or mix for {artist} at {venue}?',
    'Early or late arrival for {artist} on {date}?',
  ],
};

export function mergeWritingStrategy(
  raw?: Partial<WritingStrategy> | null,
): WritingStrategy {
  const openerTemplates = (raw?.openerTemplates ?? [])
    .map((t) => t.trim())
    .filter(Boolean);
  return {
    voice: raw?.voice?.trim() ? raw.voice.trim() : DEFAULT_WRITING_STRATEGY.voice,
    strategy: raw?.strategy?.trim()
      ? raw.strategy.trim()
      : DEFAULT_WRITING_STRATEGY.strategy,
    openerTemplates: openerTemplates.length
      ? openerTemplates
      : DEFAULT_WRITING_STRATEGY.openerTemplates,
  };
}

export function fillPlaceholders(
  template: string,
  vars: Record<string, string>,
): string | null {
  const needed = [...template.matchAll(/\{([a-z]+)\}/gi)].map((m) => m[1]!);
  for (const key of needed) {
    if (!vars[key]) return null;
  }
  let out = template;
  for (const [key, value] of Object.entries(vars)) {
    out = out.split(`{${key}}`).join(value);
  }
  return out.replace(/\s+/g, ' ').trim();
}

export function templatesToText(templates: string[]): string {
  return templates.join('\n');
}

export function textToTemplates(text: string): string[] {
  return text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
}
