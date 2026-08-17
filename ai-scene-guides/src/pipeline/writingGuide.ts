/**
 * Human-conversation validators (update(1).md + Take 3 grounding/identity).
 * Gate status is calculated from evidence only — never from model-authored ok strings.
 */

export const RULE_VERSION = 'contextual-1.0';
export const WRITING_GUIDE_VERSION = '1.2';
export const GENERATOR_VERSION = 'contextual-seed-1.0';

export type GateName =
  | 'identity'
  | 'grounding'
  | 'referent'
  | 'persona'
  | 'conversation_graph'
  | 'reply_coherence'
  | 'originality'
  | 'timing'
  | 'style'
  | 'safety'
  | 'auditability';

export type Evidence = {
  code: string;
  field?: string;
  observed?: string | number | boolean | null;
  expected?: string | number | boolean | null;
  relatedId?: string;
};

export type GateResult = {
  gate: GateName;
  status: 'pass' | 'fail' | 'not_applicable';
  ruleVersion: string;
  checkedAt: string;
  evidence: Evidence[];
};

const FAIL_CODES = new Set([
  'PERSONA_ID_MISSING',
  'PERSONA_NOT_FOUND',
  'PERSONA_GENRE_MISMATCH',
  'PERSONA_GENERIC',
  'EVENT_SOURCE_MISSING',
  'REFERENT_UNRESOLVED',
  'GRAPH_TURN_GAP',
  'GRAPH_PARENT_MISSING',
  'GRAPH_PARENT_NOT_EARLIER',
  'GRAPH_PERSONA_DIVERSITY',
  'GRAPH_TOO_SHORT',
  'TOPOLOGY_BRANCH_TOO_LONG',
  'TOPOLOGY_TOO_MANY_AI_REPLIES',
  'REPLY_DOES_NOT_ADDRESS_PARENT',
  'REPLY_GENERIC_TO_TOPIC',
  'QUESTION_NOT_ANSWERED_FIRST',
  'QUESTION_TO_QUESTION',
  'ENTITY_REPETITION_ARTIST_VENUE',
  'ENTITY_DECAY_FAILURE',
  'SOURCE_WORKFLOW_LANGUAGE',
  'EXACT_DUPLICATE',
  'STRUCTURAL_DUPLICATE',
  'TEMPLATE_FAMILY_OVER_CAP',
  'INTERNAL_QA_LANGUAGE',
  'UNSUPPORTED_VENUE_CLAIM',
  'TIME_FORMAT_INVALID',
  'QUIET_HOURS',
  'ROOM_GAP_TOO_SHORT',
  'ROOM_DAILY_START_CAP',
  'EVENT_WINDOW_INVALID',
  'AUDIT_FIELDS_MISSING',
  'IDENTITY_MISSING',
  'SAFETY_HIT',
  'LIVED_EXPERIENCE',
  'SYNTHETIC_MEMORY',
  'SYNTHETIC_ATTENDANCE',
  'ENGAGEMENT_BAIT',
  'STYLE_VIOLATION',
  'FACT_AS_QUESTION',
  'FRAGMENT_UNCLEAR',
  'PARENT_SPAN_MISSING',
  'FILLER_REPLY',
  'ISO_DATE_IN_COPY',
  'DOUBLE_PUNCTUATION',
]);

const FILLER_REPLY =
  /^(yeah|yep|sure|fair|noted|works|same|ok|okay|that rules\.?|i'?m in!?|i'?m into that take!?|if you say so\.?|let'?s go!?)\.?$/i;

/** JamBase / listings / QA voice must stay out of chat copy. */
const BANNED_QA =
  /\b(confirm against jambase|jambase remains the source of truth|source field|source record|no new source|natural stop|this exchange|the validator|the test|\bfixture\b|confidence score|\baudit\b|\bschema\b|passed the gate|failed the gate|closing (this|the) (out|thread)|we can leave it there|nothing else to add|screenshot share)\b/i;

const SOURCE_IN_COPY =
  /\b(jambase|according to (the )?listing|per (the )?listing|the listing|source of truth|confirm(ed)? (against|with)|retrieval|fixture:\/\/)\b/i;

const LIVED = [
  /\bi was (there|front row|in the pit)\b/i,
  /\bi got tickets\b/i,
  /\bmy friend (said|told)\b/i,
  /\bjust bought my ticket\b/i,
  /\bi'?m (going|attending|headed)\b/i,
  /\bi (saw|watched|met|bought|attended|caught)\b/i,
  /\bback when i\b/i,
  /\bfrom the floor\b/i,
  /\bi remember when\b/i,
];

const UNSUPPORTED_VENUE =
  /\b(box[- ]office line|floor (queue|line|rail)|parking|security line|sightlines|sellout|crowd energy|quieter arrangements|tight floor|clears the .+ line)\b/i;

/** Truncated "7:00 p." — not a valid "7:00 p.m." (dot after m is optional in the negative check). */
const BAD_TIME = /\b\d{1,2}:\d{2}\s*p\.(?!m)/i;
/** Vague only when opener has no resolveable entity (replies may use that show / there). */
const VAGUE_OPENER = /\b(this act|this bill|this listing|the listing|the venue page)\b/i;
const ENGAGEMENT =
  /\b(who are you excited to see|what does everyone think|any favorites from this genre|who would you add to the bill|thoughts on this one)\b/i;
const MARKETING = /\b(iconic|epic|game-changing|must-see|you won'?t want to miss)\b/i;
const EM_DASH = /[—–]/;
const BAD_ARTICLE = /\ba (edm|indie|hip-hop|metal|pop) (show|night|bill|gig)\b/i;

const ANSWER_START =
  /^(opener|headliner|album cut|deep cut|live cut|earlier|later|early|lighting|mix|doors|yeah|yep|nah|no|sure|fair|hard pass|not for me|i'?d |i would |honestly|their |support)/i;

export function wordCount(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function normalizeForDup(
  text: string,
  entities?: { artist?: string; venue?: string; city?: string; date?: string; time?: string },
): string {
  let t = text.toLowerCase().normalize('NFKC');
  if (entities?.artist) t = t.split(entities.artist.toLowerCase()).join('<artist>');
  if (entities?.venue) t = t.split(entities.venue.toLowerCase()).join('<venue>');
  if (entities?.city) t = t.split(entities.city.toLowerCase()).join('<city>');
  if (entities?.date) t = t.split(entities.date.toLowerCase()).join('<date>');
  if (entities?.time) t = t.split(entities.time.toLowerCase()).join('<time>');
  t = t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<date>');
  t = t.replace(/\b\d{1,2}:\d{2}\s*p\.m\./g, '<time>');
  t = t.replace(/[^a-z0-9<>\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

export function structuralFingerprint(
  text: string,
  entities?: { artist?: string; venue?: string; city?: string },
): string {
  const norm = normalizeForDup(text, entities);
  return norm
    .split(' ')
    .filter(Boolean)
    .map((tok) => {
      if (tok.startsWith('<') && tok.endsWith('>')) return tok;
      if (/^\d+$/.test(tok)) return '<num>';
      return tok.length <= 3 ? tok : `<w${tok.length}>`;
    })
    .join(' ');
}

export function templateFamilyId(fingerprint: string, turnNumber: number): string {
  return `t${turnNumber}:${fingerprint}`;
}

export function classifyIntent(
  text: string,
  isReply: boolean,
): { primary: 'fact' | 'opinion' | 'question' | 'reply'; confidence: number } {
  const trimmed = text.trim();
  if (isReply) return { primary: 'reply', confidence: 0.9 };
  if (trimmed.includes('?')) return { primary: 'question', confidence: 0.92 };
  if (/\bdoors\b|\bat \d{1,2}:\d{2}\b|\bon \d{4}-\d{2}-\d{2}\b/i.test(trimmed)) {
    return { primary: 'fact', confidence: 0.9 };
  }
  if (/\b(i would|i'?d (pick|take|prefer|go|rather)|matters more to me|not for me)\b/i.test(trimmed)) {
    return { primary: 'opinion', confidence: 0.88 };
  }
  return { primary: 'opinion', confidence: 0.72 };
}

function firstClause(text: string): string {
  const cut = text.split(/[.!?]/)[0] ?? text;
  return cut.trim();
}

function parentHasQuestion(parent?: string): boolean {
  return !!parent && parent.includes('?');
}

function replyAnswersParent(parent: string, reply: string): boolean {
  const ask = parent.toLowerCase();
  const ans = reply.toLowerCase();
  if (/opener or headliner/.test(ask)) {
    return /\b(opener|headliner|support)\b/.test(ans);
  }
  if (/live cut|start with|which (track|cut|song)/.test(ask)) {
    // Must be concrete — reject "A recent live cut." alone
    if (/^a recent live cut\.?$/i.test(ans.trim())) return false;
    return /[“"][^”"]+[”"]/.test(reply) || /\b(album cut|lp cut|opener|freestyle|mix|edit|ballad|crusher)\b/i.test(ans);
  }
  if (/lighting or mix|production/.test(ask)) {
    return /\b(lighting|mix|dynamics|spectacle)\b/.test(ans);
  }
  if (/early or late/.test(ask)) {
    return /\b(early|later|late)\b/.test(ans);
  }
  if (/doors|door time/.test(ask)) {
    return /\bdoors?\b|\d{1,2}:\d{2}/.test(ans);
  }
  // Generic: first clause must look like an answer, not another question
  return ANSWER_START.test(firstClause(reply)) || wordCount(reply) <= 6;
}

export function formatLocalTimeLabel(hour24: number, minute: number): string {
  const h12 = hour24 % 12 || 12;
  const ampm = hour24 < 12 ? 'a.m.' : 'p.m.';
  return `${h12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

export function localPartsInTimezone(
  isoUtc: string,
  timeZone: string,
): { hour: number; minute: number; ymd: string } {
  const d = new Date(isoUtc);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(
    fmt
      .formatToParts(d)
      .filter((p) => p.type !== 'literal')
      .map((p) => [p.type, p.value]),
  );
  return {
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
  };
}

export function isQuietHourLocal(hour: number): boolean {
  return hour >= 0 && hour < 7;
}

export const MIN_GAP_MS = 12 * 60_000;
/** Defaults match shadow pilot; contextual seed passes explicit overrides. */
export const MAX_CONVERSATION_STARTS_PER_ROOM_DAY = 3;
export const MAX_AI_MESSAGES_PER_ROOM_24H = 6;

function makeGate(name: GateName, evidence: Evidence[]): GateResult {
  if (!evidence.length) {
    return {
      gate: name,
      status: 'fail',
      ruleVersion: RULE_VERSION,
      checkedAt: new Date().toISOString(),
      evidence: [{ code: 'AUDIT_FIELDS_MISSING', field: 'evidence', observed: 0, expected: '>=1' }],
    };
  }
  const hasFail = evidence.some((e) => FAIL_CODES.has(e.code));
  return {
    gate: name,
    status: hasFail ? 'fail' : 'pass',
    ruleVersion: RULE_VERSION,
    checkedAt: new Date().toISOString(),
    evidence,
  };
}

export type CandidateContext = {
  text: string;
  authorType: string;
  disclosureLabel: string;
  personaId: string | null | undefined;
  personaName?: string | null;
  personaGenre?: string | null;
  roomGenre: string;
  personaValid: boolean;
  conversationId: string;
  turnNumber: number;
  replyToTurn: number | null;
  isReply: boolean;
  parentText?: string;
  parentExists: boolean;
  parentSpan?: string | null;
  addressedParentSpan?: string | null;
  eventId?: string | null;
  artistName?: string | null;
  venueName?: string | null;
  city?: string | null;
  eventLocalDate?: string | null;
  eventLocalTimeLabel?: string | null;
  sourceUrl?: string | null;
  sourceRetrievedAt?: string | null;
  sourceFieldPath?: string | null;
  citedFactIds?: string[];
  dataSegment: 'live' | 'fixture' | 'replay';
  roomTimezone: string;
  scheduledAtUtc: string;
  eventStartsAtUtc?: string | null;
  priorNormalized: string[];
  /** Raw lowercased texts for exact-dup (entity-normalized keys collide across events). */
  priorExactTexts?: string[];
  priorFingerprints: string[];
  /** Fingerprints already used at this turn number (structural cap is per-turn). */
  priorFingerprintsSameTurn?: string[];
  familyShare: number;
  lastAiAtUtc?: number | null;
  conversationStartsToday?: number;
  graphValid: boolean;
  graphFailCodes?: string[];
  intent: string;
  maxStartsPerRoomDay?: number;
  minGapMs?: number;
};

export function validateCandidateEvidence(ctx: CandidateContext): {
  passed: boolean;
  gates: GateResult[];
  rejectionCodes: string[];
  normalizedKey: string;
  fingerprint: string;
  familyId: string;
} {
  const entities = {
    artist: ctx.artistName ?? undefined,
    venue: ctx.venueName ?? undefined,
    city: ctx.city ?? undefined,
    date: ctx.eventLocalDate ?? undefined,
    time: ctx.eventLocalTimeLabel ?? undefined,
  };
  const normalizedKey = normalizeForDup(ctx.text, entities);
  const fingerprint = structuralFingerprint(ctx.text, entities);
  const familyId = templateFamilyId(fingerprint, ctx.turnNumber);
  const gates: GateResult[] = [];

  const idEv: Evidence[] = [];
  if (ctx.authorType !== 'ai_scene_guide' || ctx.disclosureLabel !== 'AI Scene Guide') {
    idEv.push({
      code: 'IDENTITY_MISSING',
      field: 'authorType',
      observed: ctx.authorType,
      expected: 'ai_scene_guide',
    });
  } else {
    idEv.push({ code: 'IDENTITY_OK', observed: ctx.authorType });
  }
  gates.push(makeGate('identity', idEv));

  const gEv: Evidence[] = [];
  if (!ctx.eventId || !ctx.artistName || !ctx.venueName || !ctx.sourceUrl || !ctx.sourceRetrievedAt) {
    gEv.push({ code: 'EVENT_SOURCE_MISSING', field: 'event' });
  } else if (!ctx.sourceFieldPath) {
    gEv.push({ code: 'EVENT_SOURCE_MISSING', field: 'source_field_path' });
  } else if (!ctx.citedFactIds?.length) {
    gEv.push({ code: 'EVENT_SOURCE_MISSING', field: 'cited_fact_ids' });
  } else if (ctx.sourceUrl.startsWith('fixture://') && ctx.dataSegment === 'live') {
    gEv.push({ code: 'EVENT_SOURCE_MISSING', field: 'data_segment', observed: 'live+fixture_url' });
  } else {
    gEv.push({
      code: 'GROUNDING_OK',
      relatedId: ctx.eventId,
      observed: ctx.sourceFieldPath,
    });
  }
  gates.push(makeGate('grounding', gEv));

  const rEv: Evidence[] = [];
  if (!ctx.isReply && VAGUE_OPENER.test(ctx.text)) {
    rEv.push({ code: 'REFERENT_UNRESOLVED', observed: 'vague_referent' });
  } else if (!ctx.isReply) {
    // Opener must name artist or venue once (entity establishment)
    const named =
      (!!ctx.artistName && ctx.text.includes(ctx.artistName)) ||
      (!!ctx.venueName && ctx.text.includes(ctx.venueName));
    if (!named) rEv.push({ code: 'REFERENT_UNRESOLVED', observed: false });
    else rEv.push({ code: 'REFERENT_OK', observed: ctx.artistName });
  } else {
    // Replies: pronouns / omissions OK when parent established artist
    const parentHasEntity =
      !!ctx.parentText &&
      ((!!ctx.artistName && ctx.parentText.includes(ctx.artistName)) ||
        (!!ctx.venueName && ctx.parentText.includes(ctx.venueName)));
    if (!parentHasEntity && wordCount(ctx.text) <= 2 && !ANSWER_START.test(ctx.text)) {
      rEv.push({ code: 'FRAGMENT_UNCLEAR', observed: ctx.text.slice(0, 40) });
    } else {
      rEv.push({ code: 'REFERENT_OK', observed: 'decay_allowed' });
    }
  }
  gates.push(makeGate('referent', rEv));

  const pEv: Evidence[] = [];
  if (!ctx.personaId) pEv.push({ code: 'PERSONA_ID_MISSING', field: 'persona_id', observed: null });
  else if (!ctx.personaValid) {
    pEv.push({ code: 'PERSONA_NOT_FOUND', field: 'persona_id', observed: ctx.personaId });
  } else if (ctx.personaGenre && ctx.personaGenre !== ctx.roomGenre) {
    pEv.push({
      code: 'PERSONA_GENRE_MISMATCH',
      observed: ctx.personaGenre,
      expected: ctx.roomGenre,
    });
  } else {
    pEv.push({ code: 'PERSONA_OK', relatedId: ctx.personaId, observed: ctx.personaName ?? true });
  }
  gates.push(makeGate('persona', pEv));

  const cgEv: Evidence[] = [];
  if (!ctx.graphValid) {
    for (const code of ctx.graphFailCodes?.length ? ctx.graphFailCodes : ['GRAPH_TURN_GAP']) {
      cgEv.push({ code, relatedId: ctx.conversationId });
    }
  } else if (ctx.isReply && !ctx.parentExists) {
    cgEv.push({ code: 'GRAPH_PARENT_MISSING', observed: ctx.replyToTurn });
  } else if (ctx.isReply && ctx.replyToTurn != null && ctx.replyToTurn >= ctx.turnNumber) {
    cgEv.push({
      code: 'GRAPH_PARENT_NOT_EARLIER',
      observed: ctx.replyToTurn,
      expected: `<${ctx.turnNumber}`,
    });
  } else {
    cgEv.push({ code: 'GRAPH_OK', relatedId: ctx.conversationId });
  }
  gates.push(makeGate('conversation_graph', cgEv));

  const rcEv: Evidence[] = [];
  if (ctx.isReply) {
    const parent = ctx.parentText ?? '';
    const artistNamed = !!ctx.artistName && ctx.text.includes(ctx.artistName);
    const venueNamed = !!ctx.venueName && ctx.text.includes(ctx.venueName);
    if (artistNamed && venueNamed) {
      rcEv.push({
        code: 'ENTITY_REPETITION_ARTIST_VENUE',
        observed: `${ctx.artistName}+${ctx.venueName}`,
      });
    }
    if (!ctx.parentSpan || !ctx.addressedParentSpan) {
      rcEv.push({
        code: 'PARENT_SPAN_MISSING',
        observed: `parent=${!!ctx.parentSpan};addressed=${!!ctx.addressedParentSpan}`,
      });
    }
    if (FILLER_REPLY.test(ctx.text.trim())) {
      rcEv.push({ code: 'FILLER_REPLY', observed: ctx.text.slice(0, 40) });
    }
    if (parentHasQuestion(parent)) {
      const onlyQuestion =
        ctx.text.trim().endsWith('?') && !ANSWER_START.test(firstClause(ctx.text));
      if (onlyQuestion || (ctx.text.includes('?') && !replyAnswersParent(parent, ctx.text))) {
        rcEv.push({ code: 'QUESTION_TO_QUESTION', observed: firstClause(ctx.text).slice(0, 60) });
      } else if (!replyAnswersParent(parent, ctx.text)) {
        rcEv.push({
          code: 'QUESTION_NOT_ANSWERED_FIRST',
          observed: firstClause(ctx.text).slice(0, 60),
        });
      }
    }
    const dependent =
      (parentHasQuestion(parent) && replyAnswersParent(parent, ctx.text)) ||
      (!!ctx.addressedParentSpan &&
        /\b(opener|headliner|album|cut|doors|lighting|mix|setlist|encore|support|disagree|not for me|i'?d |agreed)\b/i.test(
          ctx.text,
        ));
    if (!dependent && !rcEv.some((e) => FAIL_CODES.has(e.code))) {
      rcEv.push({ code: 'REPLY_GENERIC_TO_TOPIC' });
    }
    if (!rcEv.some((e) => FAIL_CODES.has(e.code))) {
      rcEv.push({
        code: 'REPLY_COHERENCE_OK',
        observed: ctx.addressedParentSpan ?? true,
      });
    }
  } else {
    rcEv.push({ code: 'REPLY_COHERENCE_OK', observed: 'opener' });
  }
  gates.push(makeGate('reply_coherence', rcEv));

  const oEv: Evidence[] = [];
  const wcForDup = wordCount(ctx.text);
  const exactKey = ctx.text.toLowerCase().replace(/\s+/g, ' ').trim();
  const exactCorpus = ctx.priorExactTexts?.length ? ctx.priorExactTexts : ctx.priorNormalized;
  const lookupKey = ctx.priorExactTexts?.length ? exactKey : normalizedKey;
  const exactHits = exactCorpus.filter((x) => x === lookupKey).length;
  // Exact duplicates fail even for short filler — "That rules." spam is a defect.
  if (exactHits >= 1) {
    oEv.push({ code: 'EXACT_DUPLICATE', observed: exactKey.slice(0, 80) });
  } else if (
    wcForDup >= 8 &&
    (ctx.priorFingerprintsSameTurn ?? ctx.priorFingerprints).includes(fingerprint)
  ) {
    oEv.push({ code: 'STRUCTURAL_DUPLICATE', observed: fingerprint.slice(0, 80) });
  } else if (ctx.familyShare > 0.02) {
    oEv.push({
      code: 'TEMPLATE_FAMILY_OVER_CAP',
      observed: ctx.familyShare,
      expected: 0.02,
    });
  } else {
    oEv.push({ code: 'ORIGINALITY_OK' });
  }
  gates.push(makeGate('originality', oEv));

  const tEv: Evidence[] = [];
  const local = localPartsInTimezone(ctx.scheduledAtUtc, ctx.roomTimezone);
  const minGap = ctx.minGapMs ?? MIN_GAP_MS;
  const maxStarts = ctx.maxStartsPerRoomDay ?? MAX_CONVERSATION_STARTS_PER_ROOM_DAY;
  if (isQuietHourLocal(local.hour)) {
    tEv.push({ code: 'QUIET_HOURS', field: 'localHour', observed: local.hour, expected: '7-23' });
  }
  if (ctx.lastAiAtUtc != null) {
    const gap = Date.parse(ctx.scheduledAtUtc) - ctx.lastAiAtUtc;
    if (gap >= 0 && gap < minGap) {
      tEv.push({ code: 'ROOM_GAP_TOO_SHORT', observed: gap, expected: minGap });
    }
  }
  if (ctx.turnNumber === 1 && (ctx.conversationStartsToday ?? 0) > maxStarts) {
    tEv.push({
      code: 'ROOM_DAILY_START_CAP',
      observed: ctx.conversationStartsToday,
      expected: maxStarts,
    });
  }
  if (ctx.eventStartsAtUtc) {
    const start = Date.parse(ctx.eventStartsAtUtc);
    const at = Date.parse(ctx.scheduledAtUtc);
    if (at < start - 7 * 24 * 3600_000 || at > start + 24 * 3600_000) {
      tEv.push({ code: 'EVENT_WINDOW_INVALID', observed: ctx.scheduledAtUtc });
    }
  }
  if (!tEv.some((e) => FAIL_CODES.has(e.code))) {
    tEv.push({ code: 'TIMING_OK', observed: `${ctx.roomTimezone}@${local.hour}` });
  }
  gates.push(makeGate('timing', tEv));

  const sEv: Evidence[] = [];
  if (BANNED_QA.test(ctx.text)) sEv.push({ code: 'INTERNAL_QA_LANGUAGE' });
  if (SOURCE_IN_COPY.test(ctx.text)) sEv.push({ code: 'SOURCE_WORKFLOW_LANGUAGE' });
  if (UNSUPPORTED_VENUE.test(ctx.text)) sEv.push({ code: 'UNSUPPORTED_VENUE_CLAIM' });
  if (BAD_TIME.test(ctx.text)) sEv.push({ code: 'TIME_FORMAT_INVALID' });
  if (ENGAGEMENT.test(ctx.text)) sEv.push({ code: 'ENGAGEMENT_BAIT' });
  if (MARKETING.test(ctx.text) || EM_DASH.test(ctx.text) || BAD_ARTICLE.test(ctx.text)) {
    sEv.push({ code: 'STYLE_VIOLATION' });
  }
  if (/\b\d{4}-\d{2}-\d{2}\b/.test(ctx.text)) {
    sEv.push({ code: 'ISO_DATE_IN_COPY', observed: 'YYYY-MM-DD' });
  }
  if (/\.\.|!!|\?\?|p\.m\.\./i.test(ctx.text)) {
    sEv.push({ code: 'DOUBLE_PUNCTUATION', observed: ctx.text.match(/\.\.|p\.m\.\./i)?.[0] });
  }
  const wc = wordCount(ctx.text);
  if (wc < 1 || wc > 90) {
    sEv.push({ code: 'STYLE_VIOLATION', field: 'wordCount', observed: wc, expected: '1-90' });
  }
  if (ctx.intent === 'fact' && ctx.text.includes('?')) {
    sEv.push({ code: 'FACT_AS_QUESTION' });
  }
  if (!sEv.some((e) => FAIL_CODES.has(e.code))) sEv.push({ code: 'STYLE_OK' });
  gates.push(makeGate('style', sEv));

  const safeEv: Evidence[] = [];
  if (LIVED.some((re) => re.test(ctx.text))) {
    if (/\bi (saw|attended|caught)\b|\bi was there\b|\bfrom the floor\b/i.test(ctx.text)) {
      safeEv.push({ code: 'SYNTHETIC_ATTENDANCE' });
    } else if (/\bi remember\b|\bback when i\b/i.test(ctx.text)) {
      safeEv.push({ code: 'SYNTHETIC_MEMORY' });
    } else {
      safeEv.push({ code: 'LIVED_EXPERIENCE' });
    }
  } else {
    safeEv.push({ code: 'SAFETY_OK' });
  }
  gates.push(makeGate('safety', safeEv));

  const aEv: Evidence[] = [];
  if (
    !ctx.conversationId ||
    !ctx.personaId ||
    !ctx.eventId ||
    !ctx.sourceFieldPath ||
    !ctx.sourceRetrievedAt ||
    !ctx.citedFactIds?.length ||
    !ctx.roomTimezone
  ) {
    aEv.push({
      code: 'AUDIT_FIELDS_MISSING',
      observed: `facts=${ctx.citedFactIds?.length ?? 0};path=${!!ctx.sourceFieldPath};tz=${ctx.roomTimezone || ''}`,
    });
  } else {
    aEv.push({
      code: 'AUDIT_OK',
      observed: ctx.citedFactIds.join(','),
      relatedId: ctx.eventId,
    });
  }
  gates.push(makeGate('auditability', aEv));

  const rejectionCodes = [
    ...new Set(
      gates
        .filter((g) => g.status === 'fail')
        .flatMap((g) => g.evidence.map((e) => e.code))
        .filter((c) => FAIL_CODES.has(c)),
    ),
  ];

  return {
    passed: gates.every((g) => g.status === 'pass'),
    gates,
    rejectionCodes,
    normalizedKey,
    fingerprint,
    familyId,
  };
}

/**
 * Episode topology: 1–3 AI messages in a branch. Standalone (1) is valid.
 * Four+ fails. Multi-turn requires linked parents and ≥2 personas when length ≥2.
 */
export function validateConversationGraph(
  turns: Array<{ turnNumber: number; replyToTurn: number | null; personaId: string }>,
): { valid: boolean; codes: string[] } {
  const codes: string[] = [];
  if (turns.length < 1) {
    return { valid: false, codes: ['GRAPH_TOO_SHORT'] };
  }
  if (turns.length > 3) {
    return { valid: false, codes: ['TOPOLOGY_BRANCH_TOO_LONG'] };
  }
  for (let i = 0; i < turns.length; i++) {
    if (turns[i]!.turnNumber !== i + 1) codes.push('GRAPH_TURN_GAP');
  }
  if (turns[0]!.replyToTurn != null) codes.push('GRAPH_PARENT_NOT_EARLIER');
  for (let i = 1; i < turns.length; i++) {
    const t = turns[i]!;
    if (t.replyToTurn == null) {
      codes.push('GRAPH_PARENT_MISSING');
      continue;
    }
    if (t.replyToTurn >= t.turnNumber || t.replyToTurn < 1) {
      codes.push('GRAPH_PARENT_NOT_EARLIER');
    }
    if (!turns.some((x) => x.turnNumber === t.replyToTurn)) {
      codes.push('GRAPH_PARENT_MISSING');
    }
  }
  if (turns.length >= 2) {
    const personas = new Set(turns.map((t) => t.personaId));
    if (personas.size < 2) codes.push('GRAPH_PERSONA_DIVERSITY');
  }
  return { valid: codes.length === 0, codes: [...new Set(codes)] };
}

/** Aggregate topology check across seeded episodes. */
export function validateRunTopology(
  episodeLengths: number[],
): { valid: boolean; codes: string[]; shareLong: number } {
  if (!episodeLengths.length) return { valid: false, codes: ['GRAPH_TOO_SHORT'], shareLong: 0 };
  if (episodeLengths.some((n) => n > 3)) {
    return { valid: false, codes: ['TOPOLOGY_BRANCH_TOO_LONG'], shareLong: 1 };
  }
  const long = episodeLengths.filter((n) => n >= 3).length;
  const shareLong = long / episodeLengths.length;
  if (shareLong > 0.15) {
    return { valid: false, codes: ['TOPOLOGY_TOO_MANY_AI_REPLIES'], shareLong };
  }
  return { valid: true, codes: [], shareLong };
}

export function gateSummaryFromEvidence(gates: GateResult[]): string {
  return gates.map((g) => `${g.gate}:${g.status}`).join('|');
}

/** @deprecated use validateCandidateEvidence — kept for older imports */
export function validateCandidate(): never {
  throw new Error('validateCandidate removed — use validateCandidateEvidence (Take 3)');
}
