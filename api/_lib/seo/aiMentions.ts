/**
 * Detects whether an AI assistant's answer mentions or cites Synth, and which competing
 * brands it names, in order of first appearance.
 * No imports: node:test loads this file directly.
 */

export const COMPETITORS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'Bandsintown', pattern: /\bbands\s?in\s?town\b/i },
  { name: 'Songkick', pattern: /\bsongkick\b/i },
  { name: 'JamBase', pattern: /\bjambase\b/i },
  { name: 'Ticketmaster', pattern: /\bticketmaster\b/i },
  { name: 'Live Nation', pattern: /\blive\s?nation\b/i },
  { name: 'SeatGeek', pattern: /\bseatgeek\b/i },
  { name: 'StubHub', pattern: /\bstubhub\b/i },
  { name: 'Eventbrite', pattern: /\beventbrite\b/i },
  { name: 'DICE', pattern: /\bDICE\b|\bdice\.fm\b/ },
  { name: 'Meetup', pattern: /\bmeetup\b/i },
  { name: 'Fever', pattern: /\bFever\b(?![- ]?(dream|pitch))/ },
  { name: 'Resident Advisor', pattern: /\bresident\s?advisor\b/i },
  { name: 'Bumble BFF', pattern: /\bbumble\s?(bff|for friends)\b/i },
  { name: 'Timeleft', pattern: /\btimeleft\b/i },
  { name: 'Spotify', pattern: /\bspotify\b/i },
  { name: 'Facebook Events', pattern: /\bfacebook events?\b/i },
  { name: 'Reddit', pattern: /\breddit\b/i },
];

// "Synth" alone is ambiguous (synthesizers, synthwave), so require it to read as a name:
// capitalised, not part of a music term, or written as the domain / "Synth app".
const SYNTH_NAME = /\bSynth\b(?![- ]?(wave|pop|esizer|s\b|-?based|line|bass|pad|lead|player|heavy|rock|punk))/;
const SYNTH_EXPLICIT = /\bgetsynth\.app\b|\bSynth\s(app|concert app|for live music)\b|\bSynth\s\(/i;

export function isSynthUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host === 'getsynth.app' || host.endsWith('.getsynth.app');
  } catch {
    return false;
  }
}

export interface MentionResult {
  mentioned: boolean;
  synthCited: boolean;
  /** 1-based position of Synth among all brands named, by first appearance. */
  synthRank: number | null;
  brands: string[];
}

export function detectMentions(answer: string, citedUrls: string[]): MentionResult {
  const text = answer ?? '';
  const synthCited = citedUrls.some(isSynthUrl);

  const positions: Array<{ name: string; index: number }> = [];
  const explicit = text.search(SYNTH_EXPLICIT);
  const named = text.search(SYNTH_NAME);
  const synthIndex = [explicit, named].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? -1;
  if (synthIndex >= 0) positions.push({ name: 'Synth', index: synthIndex });
  for (const competitor of COMPETITORS) {
    const index = text.search(competitor.pattern);
    if (index >= 0) positions.push({ name: competitor.name, index });
  }
  positions.sort((a, b) => a.index - b.index);

  const mentioned = synthIndex >= 0 || synthCited;
  const rank = positions.findIndex((p) => p.name === 'Synth');
  return {
    mentioned,
    synthCited,
    synthRank: rank >= 0 ? rank + 1 : null,
    brands: positions.filter((p) => p.name !== 'Synth').map((p) => p.name),
  };
}
