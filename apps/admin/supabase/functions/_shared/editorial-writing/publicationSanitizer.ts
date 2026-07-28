/**
 * Server-side publication gate. Reject contaminated or unusable public copy.
 * Never silently clean a failed draft for publish — callers must retry or leave pending_review.
 */

export type PublicationValidation = {
  ok: boolean;
  failures: string[];
};

const METADATA_LEAK_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /editor score\s*:/i, label: 'Contains "Editor score" metadata' },
  { re: /scorecard\s*:/i, label: 'Contains scorecard metadata' },
  { re: /hard_failures?\s*:/i, label: 'Contains hard_failures metadata' },
  { re: /editor_notes\s*:/i, label: 'Contains editor_notes metadata' },
  { re: /revised_body\s*:/i, label: 'Contains revised_body JSON key' },
  { re: /status remains pending_review/i, label: 'Contains pending_review status note' },
  { re: /\bclaims_used\b/i, label: 'Contains claims_used label' },
  { re: /\blint_hard_fails\b/i, label: 'Contains lint diagnostics' },
  { re: /\brubric\b/i, label: 'Contains rubric label' },
  { re: /\bverdict\s*:\s*(publishable|reject|light_edit)/i, label: 'Contains rubric verdict' },
  { re: /^\s*---\s*\n[\s\S]*editor score/i, label: 'Contains review footer after ---' },
  { re: /\b\d+\s+positive\s+signals?\b/i, label: 'Contains opaque positive signal counts' },
  { re: /sentiment analysis shows/i, label: 'Contains "sentiment analysis shows"' },
  { re: /\binternal (research|notes|finding)\b/i, label: 'Contains internal research language' },
  { re: /\bresearch run (collected|found)\b/i, label: 'Contains research-run narration' },
  { re: /\b\d+\s+unique (venue )?mentions\b/i, label: 'Contains internal mention counts' },
  { re: /\{[\s\S]*"(revised_body|scorecard|hard_failures)"[\s\S]*\}/, label: 'Contains JSON revision artifact' },
  { re: /```/, label: 'Contains code fence artifact' },
];

const GENERIC_FILLER: Array<{ re: RegExp; label: string; replaceWith?: string }> = [
  { re: /\biconic venue\b/gi, label: 'Generic filler: iconic venue', replaceWith: 'venue' },
  { re: /\bvibrant ecosystem\b/gi, label: 'Generic filler: vibrant ecosystem', replaceWith: 'local scene' },
  { re: /\bcornerstone of the scene\b/gi, label: 'Generic filler: cornerstone of the scene', replaceWith: 'fixture in the scene' },
  { re: /\bkey player\b/gi, label: 'Generic filler: key player', replaceWith: 'part of' },
  { re: /\bvital hub\b/gi, label: 'Generic filler: vital hub', replaceWith: 'busy room' },
  { re: /\bartists and fans alike\b/gi, label: 'Generic filler: artists and fans alike', replaceWith: 'the crowd' },
  { re: /\bstrong community engagement\b/gi, label: 'Generic filler: strong community engagement', replaceWith: 'a loyal crowd' },
  { re: /\benduring appeal\b/gi, label: 'Generic filler: enduring appeal', replaceWith: 'staying power' },
  { re: /\bmusic lovers\b/gi, label: 'Generic filler: music lovers', replaceWith: 'fans' },
  { re: /\bshare your thoughts\b/gi, label: 'Generic filler: share your thoughts', replaceWith: 'tell us' },
  { re: /\bstay tuned\b/gi, label: 'Generic filler: stay tuned', replaceWith: 'check back' },
  { re: /\bin today's evolving\b/gi, label: 'Weak opening: evolving landscape', replaceWith: 'in' },
  { re: /\bstands as\b/gi, label: 'Weak pattern: stands as', replaceWith: 'is' },
  { re: /\brecent research indicates\b/gi, label: 'Weak pattern: recent research indicates', replaceWith: 'coverage notes' },
  { re: /\bmusic has always brought people together\b/gi, label: 'Weak pattern: music brings people together', replaceWith: '' },
  { re: /\bkey destination for live music enthusiasts\b/gi, label: 'Generic filler: key destination for enthusiasts', replaceWith: 'live music stop' },
  { re: /\bnot just a venue but a space where memories are created\b/gi, label: 'Generic filler: memories are created', replaceWith: 'a room people remember' },
  { re: /\bas venues evolve, they play a crucial role\b/gi, label: 'Generic filler: venues evolve / crucial role', replaceWith: '' },
  { re: /\bshaping cultural experiences\b/gi, label: 'Generic filler: shaping cultural experiences', replaceWith: '' },
];

const DASH_RE = /[\u2014\u2013—–]/;

/** Surgical rewrite of known marketing cliches. Does not touch metadata leaks. */
export function scrubBannedFillers(body: string): { body: string; scrubbed: string[] } {
  let next = String(body || '');
  const scrubbed: string[] = [];
  for (const { re, label, replaceWith } of GENERIC_FILLER) {
    if (!re.test(next)) continue;
    scrubbed.push(label);
    next = next.replace(re, replaceWith ?? '');
  }
  next = next.replace(/[ \t]{2,}/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  return { body: next, scrubbed };
}

export function validatePublicationBody(
  body: string,
  opts?: {
    title?: string | null;
    claimsUsed?: string[];
    usableClaimIds?: Set<string>;
    minWords?: number;
    maxWords?: number;
  },
): PublicationValidation {
  const failures: string[] = [];
  const text = String(body || '');
  const title = opts?.title || '';

  if (!text.trim()) failures.push('Body is empty');

  for (const { re, label } of METADATA_LEAK_PATTERNS) {
    if (re.test(text) || re.test(title)) failures.push(label);
  }
  for (const { re, label } of GENERIC_FILLER) {
    // Avoid /g lastIndex bugs with RegExp.test
    const checker = new RegExp(re.source, re.flags.replace('g', ''));
    if (checker.test(text)) failures.push(label);
  }
  if (DASH_RE.test(text) || DASH_RE.test(title)) {
    failures.push('Contains em dash or en dash');
  }

  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (opts?.minWords && words < opts.minWords) {
    failures.push(`Body has ${words} words; minimum ${opts.minWords}`);
  }
  if (opts?.maxWords && words > opts.maxWords) {
    failures.push(`Body has ${words} words; maximum ${opts.maxWords}`);
  }

  if (opts?.usableClaimIds && opts.claimsUsed?.length) {
    for (const id of opts.claimsUsed) {
      if (id === 'C0') continue;
      if (!opts.usableClaimIds.has(id)) {
        failures.push(`Claim ${id} is not in the public-use claim ledger`);
      }
    }
  }

  return { ok: failures.length === 0, failures: [...new Set(failures)] };
}

/** Detect whether a stored body was contaminated by legacy review footers. */
export function bodyLooksContaminated(body: string): boolean {
  return !validatePublicationBody(body).ok;
}
