import type { ClaimLedgerEntry, ForumRulesRecord, LintResult, PlatformDraft } from './types';

const REWRITE_PHRASES = [
  'iconic venue',
  'vibrant ecosystem',
  'cornerstone of the scene',
  'key player',
  'vital hub',
  'artists and fans alike',
  'strong community engagement',
  'influence remains strong',
  'continues to evolve',
  'enduring appeal',
  'renowned artists',
  'memorable experiences',
  'underscores its role',
  "it's clear that",
  'stay tuned',
  'support local venues',
  'share your thoughts',
  'music lovers',
];

const SIGNAL_COUNT =
  /\b\d+\s+(positive|negative|neutral)?\s*signals?\b|\bsignals?\b|\b\d+\s+positive\b(?!\s+reviews?\b)/i;

/** Accept common disclosure phrasings the model actually writes. */
export function hasRedditAffiliationDisclosure(body: string): boolean {
  const text = body || '';
  const patterns = [
    /i help build synth/i,
    /i('|\u2019)?m (with|from|on) synth/i,
    /i work (on|at|with) synth/i,
    /full disclosure[:\s].{0,80}synth/i,
    /disclosure[:\s].{0,80}synth/i,
    /synth (team|editor|staff)/i,
    /affiliated with synth/i,
    /i (help |helped )?(build|built|run) synth/i,
    /we (build|built|run) synth/i,
    /part of (the )?synth\b/i,
  ];
  return patterns.some((re) => re.test(text));
}

export const REDDIT_AFFILIATION_PREFIX =
  'Full disclosure: I help build Synth, a DC concert discovery app.\n\n';

function hasDash(text: string): boolean {
  return /[\u2014\u2013—–]/.test(text);
}

function isSearchUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return (
      (u.hostname.includes('google.') && u.pathname.includes('/search')) ||
      (u.hostname.includes('bing.') && u.pathname.includes('/search')) ||
      u.hostname.includes('duckduckgo.')
    );
  } catch {
    return true;
  }
}

function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Hard-fail and soft-warning lint from training guide §13. */
export function lintDraft(
  draft: PlatformDraft,
  ledger: ClaimLedgerEntry[],
  opts?: {
    forumRules?: ForumRulesRecord | null;
    hasVisualAsset?: boolean;
    sentimentMethodComplete?: boolean;
  },
): LintResult {
  const hard_fails: string[] = [];
  const soft_warnings: string[] = [];
  const body = draft.body || '';
  const usableIds = new Set(ledger.filter((c) => c.public_use).map((c) => c.id));
  const byId = new Map(ledger.map((c) => [c.id, c]));

  if (hasDash(body) || (draft.title && hasDash(draft.title))) {
    hard_fails.push('Contains em dash or en dash');
  }
  if (SIGNAL_COUNT.test(body)) {
    hard_fails.push('Public body contains "signals" or opaque sentiment counts');
  }
  if (!opts?.sentimentMethodComplete && /\b\d+\s*%\s*(positive|negative)/i.test(body)) {
    hard_fails.push('Sentiment percentage without complete methodology');
  }

  for (const id of draft.claims_used || []) {
    if (!byId.has(id)) hard_fails.push(`claims_used includes unknown id ${id}`);
    else if (!usableIds.has(id) && id !== 'C0') {
      hard_fails.push(`claims_used includes non-public claim ${id}`);
    }
  }

  for (const url of draft.source_urls || []) {
    if (isSearchUrl(url)) hard_fails.push(`Source URL is a search results page: ${url}`);
  }

  if (draft.platform === 'reddit') {
    const rules = opts?.forumRules;
    if (!rules?.rules_checked_at) {
      hard_fails.push('Reddit draft lacks community-rules record');
    } else {
      const age = Date.now() - new Date(rules.rules_checked_at).getTime();
      if (age > 7 * 24 * 60 * 60 * 1000) {
        hard_fails.push('Reddit community rules check is older than 7 days');
      }
    }
    if (!hasRedditAffiliationDisclosure(body)) {
      hard_fails.push('Reddit post promotes Synth context without clear affiliation disclosure');
    }
    if ((draft.hashtags || []).length) soft_warnings.push('Reddit should not use hashtags');
    if (/https?:\/\//i.test(body)) soft_warnings.push('Reddit body includes a link');
  }

  if (draft.platform === 'instagram') {
    if (!opts?.hasVisualAsset) {
      hard_fails.push('Instagram draft requires a visual asset or brief');
    }
    if (!draft.alt_text) soft_warnings.push('Instagram missing alt text');
    if ((draft.hashtags || []).length > 4) soft_warnings.push('Instagram has more than four hashtags');
    const wc = wordCount(body);
    if (wc < 40 || wc > 180) soft_warnings.push(`Instagram length ${wc} words outside 60-140 house target`);
  }

  if (draft.platform === 'linkedin') {
    const wc = wordCount(body);
    if (wc < 80 || wc > 280) soft_warnings.push(`LinkedIn length ${wc} words outside 120-240 house target`);
  }

  if (draft.platform === 'substack') {
    const wc = wordCount(body);
    if (wc < 400) soft_warnings.push(`Substack length ${wc} words below 700 house target (acceptable short form if sourced)`);
    if ((draft.source_urls || []).length < 2) soft_warnings.push('Substack has fewer than two source URLs');
    if (!/^#\s|\n##\s/m.test(body) && !body.includes('Sources')) {
      soft_warnings.push('Substack may lack clear section structure or Sources block');
    }
  }

  const lower = body.toLowerCase();
  for (const phrase of REWRITE_PHRASES) {
    if (lower.includes(phrase)) soft_warnings.push(`Rewrite phrase: "${phrase}"`);
  }

  const firstSentence = body.split(/[.!?]/)[0] || '';
  if (firstSentence.trim().split(/\s+/).length > 25) {
    soft_warnings.push('First sentence exceeds 25 words');
  }

  const cta = `${draft.cta || ''} ${body}`.toLowerCase();
  if (/\b(join us|download|sign up|learn more)\b/.test(cta)) {
    soft_warnings.push('CTA contains join/download/sign up/learn more');
  }

  return {
    hard_fails,
    soft_warnings,
    passed: hard_fails.length === 0,
  };
}

export { REWRITE_PHRASES };
