import {
  buildClaimLedger,
  defaultForumRules,
  parseSentimentMethod,
  type SnippetRow,
} from './claimLedger';
import {
  hasRedditAffiliationDisclosure,
  lintDraft,
  REDDIT_AFFILIATION_PREFIX,
} from './lint';
import { platformSystemPrompt, platformUserPrompt } from './prompts';
import { validatePublicationBody, scrubBannedFillers } from './publicationSanitizer';
import {
  parseRevisionRoundResponse,
  REVISION_ROUNDS,
  revisionSystemPrompt,
  revisionUserPrompt,
  roundMateriallyChangedOrApproved,
  type RevisionRoundResult,
} from './revisionRounds';
import { scoreDraft } from './rubric';
import type {
  ClaimLedgerEntry,
  EditorialMeta,
  ForumRulesRecord,
  Platform,
  PlatformDraft,
  RevisionHistoryEntry,
  ScoredDraft,
  SentimentMethodRecord,
} from './types';

const PLATFORMS: Platform[] = ['instagram', 'linkedin', 'substack', 'reddit'];

export interface GenerateWritingInput {
  subject: {
    id: string;
    name: string;
    subject_type: string;
    city?: string | null;
    event_date?: string | null;
    image_url?: string | null;
    sentiment_summary?: string | null;
    sentiment_json?: Record<string, unknown> | null;
  };
  snippets: SnippetRow[];
  callOpenAI: (system: string, user: string, maxTokens?: number) => Promise<string>;
  log?: (msg: string, meta?: Record<string, unknown>) => void;
  platforms?: Platform[];
  editorGuidance?: string | null;
  selectedTopics?: string[];
  /** Absolute epoch ms; stop before Vercel kills the invocation (prefer ~270s). */
  deadlineMs?: number;
}

function assertWithinDeadline(input: GenerateWritingInput, step: string): void {
  if (!input.deadlineMs) return;
  const remaining = input.deadlineMs - Date.now();
  if (remaining <= 0) {
    throw new Error(`Generate deadline exceeded at ${step}`);
  }
}

function stripDashes(text: string): string {
  return String(text || '')
    .replace(/\u2014/g, '.')
    .replace(/\u2013/g, '-')
    .replace(/—/g, '.')
    .replace(/–/g, '-');
}

function editorialGoalFor(platform: Platform): string {
  if (platform === 'instagram') return 'remember';
  if (platform === 'linkedin') return 'understand';
  if (platform === 'substack') return 'understand';
  return 'discuss';
}

function maxTokensFor(platform: Platform, usableCount: number): number {
  if (platform === 'substack') return usableCount >= 6 ? 1800 : 1200;
  if (platform === 'reddit') return 900;
  if (platform === 'linkedin') return 900;
  return 700;
}

function revisionTokensFor(platform: Platform): number {
  if (platform === 'substack') return 1400;
  if (platform === 'linkedin') return 900;
  return 800;
}

function formatFor(platform: Platform): 'short' | 'long' {
  return platform === 'substack' || platform === 'reddit' ? 'long' : 'short';
}

function wordBounds(platform: Platform): { minWords: number; maxWords: number } {
  if (platform === 'instagram') return { minWords: 40, maxWords: 200 };
  if (platform === 'linkedin') return { minWords: 80, maxWords: 320 };
  if (platform === 'substack') return { minWords: 180, maxWords: 1600 };
  return { minWords: 80, maxWords: 420 };
}

function parseDraft(platform: Platform, raw: string): PlatformDraft {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`${platform}: OpenAI returned invalid JSON`);
  }
  return {
    platform,
    title: parsed.title ? stripDashes(String(parsed.title)) : null,
    body: stripDashes(String(parsed.body || '')),
    hashtags: Array.isArray(parsed.hashtags)
      ? (parsed.hashtags as unknown[]).map((h) => String(h).replace(/^#/, '')).slice(0, 4)
      : [],
    target_forum:
      (parsed.target_forum as string) ||
      (platform === 'reddit' ? 'r/washingtondc' : null),
    cta: parsed.cta ? stripDashes(String(parsed.cta)) : null,
    alt_text: parsed.alt_text ? stripDashes(String(parsed.alt_text)) : null,
    claims_used: Array.isArray(parsed.claims_used)
      ? (parsed.claims_used as unknown[]).map(String)
      : [],
    source_urls: Array.isArray(parsed.source_urls)
      ? (parsed.source_urls as unknown[]).map(String).filter(Boolean)
      : [],
    editor_notes: Array.isArray(parsed.editor_notes)
      ? (parsed.editor_notes as unknown[]).map(String)
      : [],
    risk_flags: Array.isArray(parsed.risk_flags)
      ? (parsed.risk_flags as unknown[]).map(String)
      : [],
    format: formatFor(platform),
  };
}

function attachSourcesFromClaims(draft: PlatformDraft, ledger: ClaimLedgerEntry[]): PlatformDraft {
  const usableIds = new Set(ledger.filter((c) => c.public_use).map((c) => c.id));
  const claims_used = (draft.claims_used || []).filter((id) => usableIds.has(id) || id === 'C0');
  let source_urls = (draft.source_urls || []).filter(Boolean);
  if (!source_urls.length && claims_used.length) {
    source_urls = claims_used
      .map((id) => ledger.find((c) => c.id === id)?.source_url)
      .filter((u): u is string => Boolean(u));
  }
  return { ...draft, claims_used, source_urls };
}

function ensureRedditDisclosure(body: string): string {
  if (hasRedditAffiliationDisclosure(body)) return body;
  return `${REDDIT_AFFILIATION_PREFIX}${body}`;
}

async function runFiveRevisionRounds(opts: {
  input: GenerateWritingInput;
  platform: Platform;
  draft: PlatformDraft;
  ledger: ClaimLedgerEntry[];
  forumRules: ForumRulesRecord;
}): Promise<{ body: string; title: string | null; history: RevisionHistoryEntry[]; notes: string[]; failedRound?: string }> {
  let body = opts.draft.body;
  let title = opts.draft.title;
  const history: RevisionHistoryEntry[] = [];
  const notes: string[] = [...(opts.draft.editor_notes || [])];
  const priorNotes: string[] = [];

  for (const round of REVISION_ROUNDS) {
    assertWithinDeadline(opts.input, `revision:${opts.platform}:${round.id}`);
    opts.input.log?.('revision round', { platform: opts.platform, round: round.id });
    let result: RevisionRoundResult | null = null;
    let attempt = 0;
    while (attempt < 2) {
      attempt += 1;
      // Skip retry when the wall clock is nearly exhausted.
      if (attempt > 1 && opts.input.deadlineMs && opts.input.deadlineMs - Date.now() < 45_000) {
        break;
      }
      const raw = await opts.input.callOpenAI(
        revisionSystemPrompt(opts.platform),
        revisionUserPrompt({
          round,
          platform: opts.platform,
          subjectName: opts.input.subject.name,
          currentBody: body,
          currentTitle: title,
          ledger: opts.ledger,
          forumRules: opts.platform === 'reddit' ? opts.forumRules : null,
          editorGuidance: opts.input.editorGuidance,
          selectedTopics: opts.input.selectedTopics,
          priorNotes,
        }),
        revisionTokensFor(opts.platform),
      );
      result = parseRevisionRoundResponse(raw, round, body);

      if (opts.platform === 'reddit') {
        result.revised_body = ensureRedditDisclosure(stripDashes(result.revised_body));
      } else {
        result.revised_body = stripDashes(result.revised_body);
      }
      if (result.revised_title) result.revised_title = stripDashes(result.revised_title);

      const scrubbed = scrubBannedFillers(result.revised_body);
      if (scrubbed.scrubbed.length) {
        result.revised_body = scrubbed.body;
        result.editor_notes.push(`Scrubbed filler: ${scrubbed.scrubbed.join('; ')}`);
      }

      const pub = validatePublicationBody(result.revised_body, {
        title: result.revised_title,
        claimsUsed: opts.draft.claims_used,
        usableClaimIds: new Set(opts.ledger.filter((c) => c.public_use).map((c) => c.id)),
        // Soft length during intermediate rounds; final gate uses full bounds.
        minWords: 30,
        maxWords: opts.platform === 'substack' ? 1800 : 500,
      });
      if (!pub.ok) {
        result.hard_failures = [...result.hard_failures, ...pub.failures];
        if (attempt < 2) {
          opts.input.log?.('revision failed publication gate, retrying', {
            platform: opts.platform,
            round: round.id,
            failures: pub.failures,
          });
          continue;
        }
        history.push({
          round: result.round,
          label: result.label,
          body: result.revised_body,
          title: result.revised_title,
          editor_notes: result.editor_notes,
          scorecard: result.scorecard,
          hard_failures: result.hard_failures,
          changed: result.changed,
          approved_unchanged_reason: result.approved_unchanged_reason,
        });
        return {
          body,
          title,
          history,
          notes,
          failedRound: `${round.label}: ${result.hard_failures.slice(0, 3).join('; ')}`,
        };
      }

      if (!roundMateriallyChangedOrApproved(result, body) && attempt < 2) {
        opts.input.log?.('revision did not change or approve; retrying', {
          platform: opts.platform,
          round: round.id,
        });
        continue;
      }
      break;
    }

    if (!result) {
      return { body, title, history, notes, failedRound: `${round.label}: no result` };
    }

    if (!roundMateriallyChangedOrApproved(result, body)) {
      result.hard_failures.push('Round neither changed the draft nor explicitly approved it');
      history.push({
        round: result.round,
        label: result.label,
        body: result.revised_body,
        title: result.revised_title,
        editor_notes: result.editor_notes,
        scorecard: result.scorecard,
        hard_failures: result.hard_failures,
        changed: false,
        approved_unchanged_reason: result.approved_unchanged_reason,
      });
      return {
        body,
        title,
        history,
        notes,
        failedRound: `${round.label}: must change or explicitly approve`,
      };
    }

    body = result.revised_body;
    if (result.revised_title) title = result.revised_title;
    notes.push(...result.editor_notes);
    priorNotes.push(...result.editor_notes);
    history.push({
      round: result.round,
      label: result.label,
      body: result.revised_body,
      title: result.revised_title,
      editor_notes: result.editor_notes,
      scorecard: result.scorecard,
      hard_failures: result.hard_failures,
      changed: result.changed,
      approved_unchanged_reason: result.approved_unchanged_reason,
    });
  }

  return { body, title, history, notes };
}

async function generateOne(
  input: GenerateWritingInput,
  platform: Platform,
  ledger: ClaimLedgerEntry[],
  unusable: ReturnType<typeof buildClaimLedger>['unusable'],
  sentimentMethod: SentimentMethodRecord | null,
  forumRules: ForumRulesRecord,
  usableCount: number,
): Promise<{ draft: ScoredDraft | null; detail?: string }> {
  const facets = (input.subject.sentiment_json?.facets || {}) as {
    artist?: string | null;
    venue?: string | null;
    event?: string | null;
  };
  const system = platformSystemPrompt(platform);
  const user = platformUserPrompt({
    platform,
    subjectName: input.subject.name,
    subjectType: input.subject.subject_type,
    city: input.subject.city || null,
    eventDate: input.subject.event_date || null,
    facets,
    ledger,
    unusable,
    sentimentMethod,
    forumRules: platform === 'reddit' ? forumRules : null,
    editorialGoal: editorialGoalFor(platform),
    editorGuidance: input.editorGuidance || (input.subject.sentiment_json?.editor_guidance as string) || null,
    selectedTopics:
      input.selectedTopics ||
      (input.subject.sentiment_json?.selected_topics as string[]) ||
      [],
    researchBrief: input.subject.sentiment_json?.research_brief || null,
  });

  assertWithinDeadline(input, `draft:${platform}`);
  let draft = attachSourcesFromClaims(
    parseDraft(platform, await input.callOpenAI(system, user, maxTokensFor(platform, usableCount))),
    ledger,
  );
  if (platform === 'reddit') draft.body = ensureRedditDisclosure(draft.body);
  const initial_body = draft.body;

  const revised = await runFiveRevisionRounds({
    input,
    platform,
    draft,
    ledger,
    forumRules,
  });

  if (revised.failedRound) {
    return { draft: null, detail: revised.failedRound };
  }

  draft = {
    ...draft,
    body: revised.body,
    title: revised.title ?? draft.title,
    editor_notes: revised.notes.slice(0, 40),
  };

  const finalScrub = scrubBannedFillers(draft.body);
  if (finalScrub.scrubbed.length) {
    draft = {
      ...draft,
      body: finalScrub.body,
      editor_notes: [
        ...draft.editor_notes,
        `Final filler scrub: ${finalScrub.scrubbed.join('; ')}`,
      ].slice(0, 40),
    };
  }

  const pub = validatePublicationBody(draft.body, {
    title: draft.title,
    claimsUsed: draft.claims_used,
    usableClaimIds: new Set(ledger.filter((c) => c.public_use).map((c) => c.id)),
    ...wordBounds(platform),
  });
  if (!pub.ok) {
    // Do not silently clean — reject.
    return {
      draft: null,
      detail: `publication gate: ${pub.failures.slice(0, 4).join('; ')}`,
    };
  }

  const lint = lintDraft(draft, ledger, {
    forumRules: platform === 'reddit' ? forumRules : null,
    hasVisualAsset: true,
    sentimentMethodComplete: Boolean(sentimentMethod?.complete),
  });
  const score = scoreDraft(draft, lint);
  if (!lint.passed || score.verdict === 'reject') {
    return {
      draft: null,
      detail: `lint=${lint.hard_fails.join(' | ') || 'none'}; score=${score.total}`,
    };
  }

  if (forumRules.editor_must_reverify && platform === 'reddit') {
    draft.editor_notes.push('Editor must re-verify current r/washingtondc rules before approve.');
  }

  return {
    draft: {
      ...draft,
      lint,
      score,
      claim_ledger: ledger,
      forum_rules: platform === 'reddit' ? forumRules : null,
      revision_history: revised.history,
      initial_body,
      publication_failures: [],
    },
  };
}

export function toEditorialMeta(draft: ScoredDraft): EditorialMeta {
  return {
    claims_used: draft.claims_used,
    source_urls: draft.source_urls,
    editor_notes: draft.editor_notes,
    risk_flags: [...draft.risk_flags, ...draft.lint.soft_warnings],
    alt_text: draft.alt_text,
    cta: draft.cta,
    score: draft.score.total,
    score_breakdown: draft.score.breakdown,
    score_verdict: draft.score.verdict,
    lint_hard_fails: draft.lint.hard_fails,
    lint_soft_warnings: draft.lint.soft_warnings,
    claim_ledger_snapshot: draft.claim_ledger
      .filter((c) => draft.claims_used.includes(c.id) || c.public_use)
      .slice(0, 40)
      .map((c) => ({
        id: c.id,
        claim: c.claim,
        source_url: c.source_url,
        public_use: c.public_use,
      })),
    revision_history: draft.revision_history || [],
    initial_body: draft.initial_body || null,
    publication_failures: draft.publication_failures || [],
    revision_rounds_completed: draft.revision_history?.length || 0,
  };
}

export async function runEditorialWritingPipeline(input: GenerateWritingInput): Promise<{
  drafts: ScoredDraft[];
  claim_ledger: ReturnType<typeof buildClaimLedger>['ledger'];
  unusable_claims: ReturnType<typeof buildClaimLedger>['unusable'];
  sentiment_method: SentimentMethodRecord | null;
  warnings: string[];
}> {
  const sentimentMethod = parseSentimentMethod(input.subject.sentiment_json);
  const { ledger, unusable } = buildClaimLedger({
    subjectId: input.subject.id,
    subjectName: input.subject.name,
    snippets: input.snippets,
    sentimentMethod,
  });

  const usableCount = ledger.filter((c) => c.public_use && c.id !== 'C0').length;
  const warnings: string[] = [];
  if (usableCount === 0) {
    warnings.push(
      'No public-use claims after gating. Generation will refuse unsupported invention; drafts may be skipped.',
    );
  }

  const forumRules = defaultForumRules('r/washingtondc');
  const drafts: ScoredDraft[] = [];
  const platforms = (input.platforms?.length ? input.platforms : PLATFORMS).filter((p) =>
    PLATFORMS.includes(p),
  );

  if (input.editorGuidance || input.selectedTopics?.length) {
    input.subject.sentiment_json = {
      ...(input.subject.sentiment_json || {}),
      editor_guidance: input.editorGuidance || null,
      selected_topics: input.selectedTopics || [],
    };
  }

  for (const platform of platforms) {
    if (usableCount === 0 && platform !== 'reddit') {
      warnings.push(`Skipped ${platform}: insufficient public claims`);
      continue;
    }
    if (input.deadlineMs && input.deadlineMs - Date.now() < 40_000) {
      warnings.push(`Skipped ${platform}: generate deadline nearly exhausted`);
      continue;
    }
    try {
      const result = await generateOne(
        input,
        platform,
        ledger,
        unusable,
        sentimentMethod,
        forumRules,
        usableCount,
      );
      if (result.draft) drafts.push(result.draft);
      else {
        warnings.push(
          `${platform}: rejected after revisions${result.detail ? ` (${result.detail})` : ''}`,
        );
      }
    } catch (err) {
      warnings.push(`${platform}: ${(err as Error).message}`);
      input.log?.('platform generate failed', { platform, error: String(err) });
    }
  }

  return {
    drafts,
    claim_ledger: ledger,
    unusable_claims: unusable,
    sentiment_method: sentimentMethod,
    warnings,
  };
}

export { validatePublicationBody, bodyLooksContaminated, scrubBannedFillers } from './publicationSanitizer';
export { REVISION_ROUNDS } from './revisionRounds';
