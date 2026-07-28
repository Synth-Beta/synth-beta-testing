/**
 * Five sequential revision rounds driven by synth-editorial-content-training-guide.md.
 * Each round critiques and rewrites; only revised_body passes to the next round.
 */

import type { ClaimLedgerEntry, ForumRulesRecord, Platform } from './types';

export type RevisionRoundId =
  | 'evidence_and_angle'
  | 'specificity_and_usefulness'
  | 'platform_fit'
  | 'synth_voice'
  | 'copy_chief';

export const REVISION_ROUNDS: Array<{
  id: RevisionRoundId;
  label: string;
  focus: string;
}> = [
  {
    id: 'evidence_and_angle',
    label: '1. Evidence and angle',
    focus:
      'Cut unsupported claims. Keep only public_use ledger facts. Choose one clear editorial angle. Remove research narration and opaque metrics.',
  },
  {
    id: 'specificity_and_usefulness',
    label: '2. Specificity and reader usefulness',
    focus:
      'Replace generic praise with concrete names, dates, rooms, tours, or decisions the reader can use. Open with a specific hook, not a landscape cliché.',
  },
  {
    id: 'platform_fit',
    label: '3. Platform fit',
    focus:
      'Rewrite for this platform only. Change angle, form, length, and CTA. Do not merely shorten the previous draft.',
  },
  {
    id: 'synth_voice',
    label: '4. Synth voice and anti-AI editing',
    focus:
      'Sound like an informed concert friend. Kill filler phrases from the training guide. No em/en dashes. No "signals," sentiment analysis, or database voice.',
  },
  {
    id: 'copy_chief',
    label: '5. Final copy-chief review',
    focus:
      'Final gate: publishable public copy only. Materially improve weak sentences. If already strong, still tighten one line and note why you approve it.',
  },
];

export type RevisionRoundResult = {
  round: RevisionRoundId;
  label: string;
  revised_body: string;
  revised_title: string | null;
  editor_notes: string[];
  scorecard: Record<string, number | string>;
  hard_failures: string[];
  changed: boolean;
  approved_unchanged_reason?: string | null;
};

const PLATFORM_EXAMPLES: Record<Platform, string> = {
  instagram: `GOOD Instagram (style only; invent nothing beyond the ledger):
Title: A room that remembers
Body:
Before it became a DC institution, the 9:30 Club was a 200-person room at 930 F Street.

It opened on May 31, 1980 with the Lounge Lizards and local new wave group Tiny Desk Unit. Today, the club's Hall of Records holds more than 9,000 albums connected to artists who have headlined the venue.

That is a lot of DC music history in one room. What was your first show there?`,
  linkedin: `GOOD LinkedIn (style only):
A music venue's value is not captured by capacity or ticket volume alone.

The original 9:30 Club opened in 1980 as a roughly 200-person room at 930 F Street. Its current Hall of Records now holds more than 9,000 albums tied to artists who have headlined the club.

That archive makes decades of programming visible to the next person walking into the room. Discovery gets stronger when an event is connected to place and memory.

What venue does the best job of making its history part of the present-day experience?`,
  substack: `GOOD Substack (style only):
## The date is the story

Lead with a specific verified fact, then build sections with ## headings. End with a natural question. Put source URLs only in metadata, not as a trailing Sources dump inside revised_body unless the platform piece genuinely needs inline links.

For thin ledgers, write a short Venue File: what is confirmed, what is still missing, and one concrete upcoming show the reader can act on.`,
  reddit: `GOOD Reddit (style only):
Full disclosure: I help build Synth, a DC concert discovery app.

The original 9:30 Club opened May 31, 1980 as a ~200-person room at 930 F Street. I am not asking for a ranking. I want one clear memory: what was the first show you remember there, and what made the room feel different?

Happy to quote with consent only.`,
};

const PLATFORM_RULES: Record<Platform, string> = {
  instagram:
    'Instagram: 60-140 words. Discovery-oriented. One visual idea. Short paragraphs. Zero to four hashtags stay outside body. One specific question. Concise.',
  linkedin:
    'LinkedIn: 120-240 words. One industry or cultural insight, evidence, implication, informed question. Not a venue brochure.',
  substack:
    'Substack: sourced narrative with real reader value. Prefer 500-900 words when evidence is limited. Use ## sections. Public body only; no score footers.',
  reddit:
    'Reddit: transparent, conversational, community-aware. Open with Synth affiliation. 120-350 words. No hashtags. Prefer no links in body.',
};

export function revisionSystemPrompt(platform: Platform): string {
  return `You are Synth's DC copy chief running one revision round.
Source of truth: synth-editorial-content-training-guide.md.

Rules:
- revised_body must be PUBLIC-FACING COPY ONLY.
- Never put scores, Sources lists, Editor score, status notes, JSON keys, claim IDs, or research diagnostics in revised_body.
- Use only public_use=true claims from the ledger. Do not invent dates, lineups, or sentiment.
- No em dashes or en dashes.
- Produce a materially improved rewrite, not a polite paraphrase.
- If the draft is already strong, still make one concrete improvement OR set changed=false with approved_unchanged_reason explaining why.

Return ONLY valid JSON:
{
  "revised_body": "public-facing copy only",
  "revised_title": "string or null",
  "editor_notes": ["internal notes"],
  "scorecard": { "accuracy": 0-10, "specificity": 0-10, "platform_fit": 0-10, "voice": 0-10, "reader_value": 0-10, "notes": "short" },
  "hard_failures": [],
  "changed": true,
  "approved_unchanged_reason": null
}

Platform rules:
${PLATFORM_RULES[platform]}

Example of good platform copy:
${PLATFORM_EXAMPLES[platform]}`;
}

export function revisionUserPrompt(opts: {
  round: (typeof REVISION_ROUNDS)[number];
  platform: Platform;
  subjectName: string;
  currentBody: string;
  currentTitle: string | null;
  ledger: ClaimLedgerEntry[];
  forumRules?: ForumRulesRecord | null;
  editorGuidance?: string | null;
  selectedTopics?: string[];
  priorNotes?: string[];
}): string {
  const usable = opts.ledger.filter((c) => c.public_use);
  return JSON.stringify(
    {
      round: opts.round.id,
      round_label: opts.round.label,
      round_focus: opts.round.focus,
      platform: opts.platform,
      subject: opts.subjectName,
      current_title: opts.currentTitle,
      current_body: opts.currentBody,
      claim_ledger: usable.map((c) => ({
        id: c.id,
        claim: c.claim,
        source_url: c.source_url,
        source_name: c.source_name,
        source_tier: c.source_tier,
        claim_type: c.claim_type,
      })),
      forum_rules: opts.forumRules || null,
      editor_guidance: opts.editorGuidance || null,
      selected_topics: opts.selectedTopics || [],
      prior_editor_notes: (opts.priorNotes || []).slice(-8),
      instruction:
        'Critique the current_body against round_focus, then rewrite. Pass only public copy in revised_body.',
    },
    null,
    2,
  );
}

export function parseRevisionRoundResponse(
  raw: string,
  round: (typeof REVISION_ROUNDS)[number],
  previousBody: string,
): RevisionRoundResult {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Try extract JSON object
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return {
        round: round.id,
        label: round.label,
        revised_body: previousBody,
        revised_title: null,
        editor_notes: ['Round returned invalid JSON'],
        scorecard: {},
        hard_failures: ['Invalid JSON from revision round'],
        changed: false,
        approved_unchanged_reason: null,
      };
    }
    parsed = JSON.parse(match[0]);
  }

  const revised_body = String(parsed.revised_body || '').trim();
  const hard_failures = Array.isArray(parsed.hard_failures)
    ? (parsed.hard_failures as unknown[]).map(String)
    : [];
  const editor_notes = Array.isArray(parsed.editor_notes)
    ? (parsed.editor_notes as unknown[]).map(String)
    : [];
  const scorecard =
    parsed.scorecard && typeof parsed.scorecard === 'object'
      ? (parsed.scorecard as Record<string, number | string>)
      : {};

  const changed =
    typeof parsed.changed === 'boolean'
      ? parsed.changed
      : normalizeComparable(revised_body) !== normalizeComparable(previousBody);

  if (!revised_body) {
    hard_failures.push('Empty revised_body');
  }

  return {
    round: round.id,
    label: round.label,
    revised_body: revised_body || previousBody,
    revised_title: parsed.revised_title ? String(parsed.revised_title) : null,
    editor_notes,
    scorecard,
    hard_failures,
    changed,
    approved_unchanged_reason: parsed.approved_unchanged_reason
      ? String(parsed.approved_unchanged_reason)
      : null,
  };
}

function normalizeComparable(text: string): string {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

export function roundMateriallyChangedOrApproved(result: RevisionRoundResult, previousBody: string): boolean {
  if (result.changed) return true;
  if (result.approved_unchanged_reason && result.approved_unchanged_reason.trim().length > 8) {
    return true;
  }
  return normalizeComparable(result.revised_body) !== normalizeComparable(previousBody);
}
