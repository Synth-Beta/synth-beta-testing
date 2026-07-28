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

const GENERIC_FILLER: Array<{ re: RegExp; label: string }> = [
  { re: /\biconic venue\b/i, label: 'Generic filler: iconic venue' },
  { re: /\bvibrant ecosystem\b/i, label: 'Generic filler: vibrant ecosystem' },
  { re: /\bcornerstone of the scene\b/i, label: 'Generic filler: cornerstone of the scene' },
  { re: /\bkey player\b/i, label: 'Generic filler: key player' },
  { re: /\bvital hub\b/i, label: 'Generic filler: vital hub' },
  { re: /\bartists and fans alike\b/i, label: 'Generic filler: artists and fans alike' },
  { re: /\bstrong community engagement\b/i, label: 'Generic filler: strong community engagement' },
  { re: /\benduring appeal\b/i, label: 'Generic filler: enduring appeal' },
  { re: /\bmusic lovers\b/i, label: 'Generic filler: music lovers' },
  { re: /\bshare your thoughts\b/i, label: 'Generic filler: share your thoughts' },
  { re: /\bstay tuned\b/i, label: 'Generic filler: stay tuned' },
  { re: /\bin today's evolving\b/i, label: 'Weak opening: evolving landscape' },
  { re: /\bstands as\b/i, label: 'Weak pattern: stands as' },
  { re: /\brecent research indicates\b/i, label: 'Weak pattern: recent research indicates' },
  { re: /\bmusic has always brought people together\b/i, label: 'Weak pattern: music brings people together' },
  { re: /\bkey destination for live music enthusiasts\b/i, label: 'Generic filler: key destination for enthusiasts' },
  { re: /\bnot just a venue but a space where memories are created\b/i, label: 'Generic filler: memories are created' },
  { re: /\bas venues evolve, they play a crucial role\b/i, label: 'Generic filler: venues evolve / crucial role' },
  { re: /\bshaping cultural experiences\b/i, label: 'Generic filler: shaping cultural experiences' },
];

const DASH_RE = /[\u2014\u2013—–]/;

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
    if (re.test(text)) failures.push(label);
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
