/**
 * Contextual contribution seed (Take 5 / update(1) Priority 0).
 *
 * One decision per transaction from room state. Records POST, REPLY, and SILENCE.
 * Never prewrites multi-turn graphs. Personas bind 1:1 to sender slots.
 */

import { pilotFactsForGenre } from '../fixtures/pilotEvents.js';
import { createRng } from '../seed/personas.js';
import { newId, uuidFromSeed } from '../lib/hash.js';
import {
  AUTHOR_TYPE_AI,
  DISCLOSURE_LABEL,
  LAUNCH_GENRES,
  type AiGuidePersona,
  type GroundedFact,
} from '../types.js';
import {
  classifyIntent,
  formatLocalTimeLabel,
  gateSummaryFromEvidence,
  isQuietHourLocal,
  localPartsInTimezone,
  normalizeForDup,
  templateFamilyId,
  validateCandidateEvidence,
  wordCount,
  GENERATOR_VERSION,
  RULE_VERSION,
  WRITING_GUIDE_VERSION,
  type GateResult,
} from './writingGuide.js';
import {
  fillPlaceholders,
  mergeWritingStrategy,
  type WritingStrategy,
} from './writingStrategy.js';
export {
  fillPlaceholders,
  mergeWritingStrategy,
  DEFAULT_WRITING_STRATEGY,
  templatesToText,
  textToTemplates,
  type WritingStrategy,
} from './writingStrategy.js';

/** Eastern — matches DC/east-coast pilot venues. */
export const ROOM_TIMEZONE = 'America/New_York';

/** Pilot cadence (not the inflated fixture sample caps). */
export const PILOT_MIN_GAP_MS = 12 * 60_000;
export const PILOT_MAX_STARTS_PER_ROOM_DAY = 3;
export const PILOT_MAX_AI_PER_ROOM_24H = 6;

const HUMAN_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

export type DecisionAction = 'POST' | 'REPLY' | 'SILENCE';

export type ContextualDecision = {
  decision_id: string;
  generation_id: string;
  generated_at: string;
  action: DecisionAction;
  silence_reason: string | null;
  genre_id: string;
  room_key: string;
  room_timezone: string;
  persona_id: string | null;
  persona_name: string | null;
  persona_archetype: string | null;
  /** Bound 1:1 — set by admin insert from sender pool */
  sender_slot: number | null;
  content: string | null;
  intent: string | null;
  intent_confidence: number | null;
  contribution_type: string | null;
  conversation_id: string | null;
  turn_number: number | null;
  reply_to_turn: number | null;
  parent_message_id: string | null;
  parent_span: string | null;
  addressed_parent_span: string | null;
  event_id: string | null;
  artist_name: string | null;
  venue_name: string | null;
  city: string | null;
  event_local_date: string | null;
  event_local_time: string | null;
  event_starts_at_utc: string | null;
  source_url: string | null;
  source_retrieved_at: string | null;
  source_field_path: string | null;
  cited_fact_ids: string[];
  fact_confidence: number | null;
  scheduled_at: string | null;
  scheduled_at_local: string | null;
  status: 'scheduled' | 'skipped';
  data_segment: 'fixture';
  gate_summary: string;
  normalized_key: string | null;
  structural_fingerprint: string | null;
  template_family: string | null;
  guide_version: string;
  generator_version: string;
  rule_version: string;
  contains_setlist_spoiler: boolean;
  reviewer_decision: string | null;
  failure_reasons: string;
  audit: {
    gates: GateResult[];
    rejectionCodes: string[];
    generation_id: string;
    parent_span?: string | null;
    addressed_parent_span?: string | null;
    room_visible_count: number;
    consecutive_ai: number;
  };
};

export type ContextualSeedResult = {
  decisions: ContextualDecision[];
  /** Only POST/REPLY that passed gates — ready to schedule */
  posts: ContextualDecision[];
  silences: ContextualDecision[];
  personas: BoundPersona[];
  stats: {
    decisions: number;
    posts: number;
    replies: number;
    silences: number;
    silenceRate: number;
    uniqueTexts: number;
    templateFamilies: number;
    lengthBuckets: { under8: number; mid8_20: number; mid21_45: number; mid46_90: number };
    genres: Record<string, number>;
  };
};

export type BoundPersona = AiGuidePersona & {
  senderSlot: number;
  genreId: string;
};

type RoomMessage = {
  messageId: string;
  conversationId: string;
  turnNumber: number;
  personaId: string;
  text: string;
  generatedAt: string;
  scheduledAt: string;
  eventId: string;
  artistName: string;
  venueName: string;
};

type RoomState = {
  roomKey: string;
  genreId: string;
  messages: RoomMessage[];
  lastAiAtUtc: number | null;
  startsByDay: Map<string, number>;
  msgsByDay: Map<string, number>;
};

const ARCHETYPES = [
  'setlist nerd',
  'deep-catalog fan',
  'festival planner',
  'production/gear listener',
  'new-listener guide',
  'discovery connector',
  'dance-floor energy reader',
  'scene historian',
] as const;

const GENRE_LABEL: Record<string, string> = {
  indie: 'Indie',
  'hip-hop': 'Hip-Hop',
  edm: 'EDM',
  metal: 'Metal',
  pop: 'Pop',
};

function humanDate(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return `${HUMAN_MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

function doorsFromClaim(claim: string): string | null {
  const m = claim.match(/Doors\s+(\d{1,2}:\d{2}\s*[ap]\.m\.)/i);
  return m?.[1] ?? null;
}

function startFromIso(iso?: string | null): string | null {
  if (!iso?.includes('T')) return null;
  return formatLocalTimeLabel(Number(iso.slice(11, 13)), Number(iso.slice(14, 16)));
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

/** Stable personas: unique names, fixed IDs, sender slots assigned later 1:1. */
export function buildBoundPersonaCatalog(
  genres: string[],
  senderCount: number,
): BoundPersona[] {
  if (senderCount < 1) return [];
  // At most one persona per sender globally
  const max = Math.min(senderCount, genres.length * 2, 40);
  const out: BoundPersona[] = [];
  let slot = 0;
  let i = 0;
  while (out.length < max) {
    const genreId = genres[i % genres.length]!;
    const nInGenre = out.filter((p) => p.genreId === genreId).length;
    const archetype = ARCHETYPES[out.length % ARCHETYPES.length]!;
    const label = GENRE_LABEL[genreId] ?? genreId;
    const displayName = `${label} Guide ${nInGenre + 1}`;
    const id = uuidFromSeed(`bound-persona:${genreId}:${displayName}:v5`);
    out.push({
      id,
      genreId,
      displayName,
      avatarAsset: null,
      archetype,
      voiceTraits: {
        concise: out.length % 2 === 0,
        enthusiastic: out.length % 3 === 0,
        dry: out.length % 4 === 0,
      },
      interestWeights: {},
      messageLengthDistribution: { short: 0.25, medium: 0.55, long: 0.2 },
      emojiRate: 0.05,
      questionRate: 0.12,
      slangLevel: 0.1,
      activityWindows: [],
      disclosureLabel: DISCLOSURE_LABEL,
      isActive: true,
      seedKey: `bound:${genreId}:${nInGenre}`,
      senderSlot: slot,
    });
    slot += 1;
    i += 1;
  }
  return out;
}

function parentAsk(parent: string): string {
  if (/opener or headliner/i.test(parent)) return 'opener_headliner';
  if (/live cut|which (track|cut|song)|start with/i.test(parent)) return 'track';
  if (/lighting or mix/i.test(parent)) return 'production';
  if (/doors/i.test(parent)) return 'doors';
  if (/\?/.test(parent)) return 'generic';
  return 'none';
}

type Draft = {
  text: string;
  contributionType: string;
  parentSpan: string | null;
  addressedSpan: string | null;
  citedFactIds: string[];
};

function classifyTemplateType(text: string): string {
  if (text.includes('?')) return 'question';
  if (/\b(i'd|i would|rather|for me)\b/i.test(text)) return 'preference';
  return 'fact';
}

function openerPool(
  event: GroundedFact,
  persona: BoundPersona,
  strategy: WritingStrategy,
): Array<{ text: string; type: string }> {
  const artist = event.artistName!;
  const venue = event.venueName!;
  const city = event.city?.split(',')[0]?.trim() ?? '';
  const date = humanDate(event.occurredAt);
  const doors = doorsFromClaim(event.claim);
  const start = startFromIso(event.occurredAt);
  const a = persona.archetype;
  const vars = {
    artist,
    venue,
    city,
    date,
    doors: doors ?? '',
    start: start ?? '',
    genre: event.genreId ?? '',
  };
  const fromStrategy = strategy.openerTemplates
    .map((tmpl) => fillPlaceholders(tmpl, vars))
    .filter((t): t is string => !!t)
    .map((text) => ({ text, type: classifyTemplateType(text) }));
  if (fromStrategy.length) return fromStrategy;

  const pool: Array<{ text: string; type: string }> = [];

  if (doors && start) {
    pool.push({
      text: `${artist} plays ${venue} on ${date}. Start ${start}; doors ${doors}`,
      type: 'fact',
    });
    pool.push({
      text: `Quick timing note: ${artist} at ${venue} is ${start} on ${date}, doors ${doors}`,
      type: 'fact',
    });
  }
  if (doors) {
    pool.push({
      text: `If you're timing ${artist} on ${date}, doors are ${doors} at ${venue}`,
      type: 'fact',
    });
    pool.push({
      text: `Door time for ${artist}: ${doors} on ${date}. That's the number I'd plan around`,
      type: 'fact',
    });
    pool.push({
      text: `${doors} doors for ${artist}. I'd treat that as the arrival target on ${date}`,
      type: 'fact',
    });
  }
  if (start) {
    pool.push({
      text: `${start} start for ${artist} at ${venue} on ${date}`,
      type: 'fact',
    });
    pool.push({
      text: `Calendar hold: ${artist}, ${date}, ${start} at ${venue}`,
      type: 'fact',
    });
    if (city) {
      pool.push({
        text: `${artist} hits ${city} on ${date} (${venue}), ${start}`,
        type: 'fact',
      });
      pool.push({
        text: `${city} date for ${artist} is ${date} at ${venue}`,
        type: 'fact',
      });
    }
  }
  pool.push({ text: `${venue} has ${artist} on ${date}`, type: 'fact' });
  pool.push({ text: `${artist} on ${date} at ${venue}`, type: 'fact' });
  pool.push({ text: `Marking ${artist} / ${date} / ${venue}`, type: 'fact' });
  pool.push({ text: `Putting ${artist} on the radar for ${date} at ${venue}`, type: 'fact' });
  pool.push({ text: `${date}: ${artist} lands at ${venue}`, type: 'fact' });
  pool.push({ text: `Hold ${date} if ${artist} at ${venue} is on your shortlist`, type: 'preference' });
  pool.push({ text: `Anyone watching ${artist} around ${date}? ${venue} is the stop`, type: 'question' });
  pool.push({ text: `Hard date check: ${artist}, ${venue}, ${date}`, type: 'fact' });
  pool.push({ text: `${artist} / ${venue} / ${date}: that's the triangle I'm tracking`, type: 'fact' });

  // Short reactions (1–7 words) — allowed, but not the whole run
  pool.push({ text: `${artist} on ${date}`, type: 'fact' });
  pool.push({ text: `Noting ${venue} for ${date}`, type: 'fact' });
  pool.push({ text: `${date} for ${artist}`, type: 'fact' });
  pool.push({ text: `${venue} on ${date}`, type: 'fact' });

  if (a === 'deep-catalog fan' || a === 'setlist nerd') {
    pool.push({
      text: `For ${artist} on ${date}, I'd rather hear deep cuts than the streaming single. The album side usually shows what the night is actually about.`,
      type: 'preference',
    });
    pool.push({
      text: `No confirmed setlist for ${artist} yet. Song guesses before the show are predictions, not facts.`,
      type: 'fact',
    });
    pool.push({
      text: `I'm less interested in ${artist}'s radio cuts for ${date}. Mid-catalog is where I'd start listening ahead of time.`,
      type: 'preference',
    });
    pool.push({
      text: `Deep-cut bias for ${artist}: skip the singles playlist and pull two older album tracks before ${date}.`,
      type: 'preference',
    });
    pool.push({
      text: `Setlist talk for ${artist} can wait. Nothing useful is confirmed yet for ${date}.`,
      type: 'fact',
    });
  }
  if (a === 'festival planner' || a === 'new-listener guide') {
    pool.push({
      text: `For ${artist} on ${date}, the opener is honestly the interesting part of the bill if support looks good.`,
      type: 'preference',
    });
    pool.push({
      text: `If ${artist} is new to you, start with one recent live cut, then the studio record. Easier than jumping into a compilation.`,
      type: 'preference',
    });
    pool.push({
      text: `I'd rearrange for ${artist} only when the support bill looks intentional, not like filler before the headliner.`,
      type: 'preference',
    });
    pool.push({
      text: `New to ${artist}? One live clip plus the latest LP is enough prep for ${date}.`,
      type: 'preference',
    });
    pool.push({
      text: `Support stack for ${artist} matters more to me than headliner brand recognition on ${date}.`,
      type: 'preference',
    });
  }
  if (a === 'production/gear listener') {
    pool.push({
      text: `I'd take the later slot for ${artist} on ${date}. Lighting and mix matter more to me than catching the first song.`,
      type: 'preference',
    });
    pool.push({
      text: `Production-first take on ${artist} at ${venue}: I'd rather a darker room with dynamics than a bright wash.`,
      type: 'preference',
    });
    pool.push({
      text: `For ${artist}, I'd rather miss the first song than sit through a flat mix all night.`,
      type: 'preference',
    });
  }
  if (a === 'dance-floor energy reader') {
    pool.push({
      text: `${artist} on ${date} reads more like a pace test than a hits parade. Club energy over a seated night, for me.`,
      type: 'preference',
    });
    pool.push({
      text: `Pace matters for ${artist} on ${date}. I'd rather a steady climb than a singles montage.`,
      type: 'preference',
    });
  }
  if (a === 'scene historian' || a === 'lyric/theme analyst') {
    pool.push({
      text: `${artist} on ${date} sits in an interesting spot in their run. I'd listen for how the new material sits next to the older songs.`,
      type: 'preference',
    });
    pool.push({
      text: `Curious where ${artist}'s newer songs land next to the older ones on ${date}.`,
      type: 'preference',
    });
  }

  pool.push({ text: `Opener or headliner for ${artist} on ${date}?`, type: 'question' });
  pool.push({ text: `Which recent live cut would you start with for ${artist}?`, type: 'question' });
  pool.push({ text: `Lighting or mix for ${artist} at ${venue}?`, type: 'question' });
  pool.push({ text: `Early or late arrival for ${artist} on ${date}?`, type: 'question' });
  pool.push({
    text: `I'd skip the encore prediction game for ${artist}. Wait for something confirmed before ${date}.`,
    type: 'preference',
  });
  pool.push({
    text: `For ${artist}, the interesting question before ${date} is support quality, not headline branding.`,
    type: 'preference',
  });
  pool.push({
    text: `Room size at ${venue} changes how ${artist} will read on ${date}. I'd weight that over the single.`,
    type: 'preference',
  });
  pool.push({
    text: `If ${artist} keeps the set tight on ${date}, the album cuts matter more than a long encore tease.`,
    type: 'preference',
  });
  pool.push({
    text: `Comparing ${artist} nights is mostly about pacing. ${date} at ${venue} will tell you the current version.`,
    type: 'preference',
  });

  return pool;
}

function draftOpener(
  event: GroundedFact,
  persona: BoundPersona,
  rng: () => number,
  strategy: WritingStrategy,
  avoidExact?: Set<string>,
  avoidFamilies?: Set<string>,
): Draft | null {
  const pool = openerPool(event, persona, strategy);
  const entities = {
    artist: event.artistName ?? undefined,
    venue: event.venueName ?? undefined,
    city: event.city ?? undefined,
    date: humanDate(event.occurredAt),
    time: doorsFromClaim(event.claim) ?? startFromIso(event.occurredAt) ?? undefined,
  };

  const scored = pool.map((c) => {
    const exact = c.text.toLowerCase().replace(/\s+/g, ' ').trim();
    const fam = templateFamilyId(normalizeForDup(c.text, entities), 1);
    const blocked = !!(avoidExact?.has(exact) || avoidFamilies?.has(fam));
    return { c, blocked, fam };
  });
  const fresh = scored.filter((s) => !s.blocked).map((s) => s.c);
  if (!fresh.length) return null;
  const chosen = pick(rng, fresh);
  return {
    text: chosen.text,
    contributionType: chosen.type,
    parentSpan: null,
    addressedSpan: null,
    citedFactIds: [event.id],
  };
}

function draftReply(
  parent: RoomMessage,
  event: GroundedFact,
  persona: BoundPersona,
  rng: () => number,
): Draft | null {
  const ask = parentAsk(parent.text);
  const doors = doorsFromClaim(event.claim);
  const a = persona.archetype;

  // Extract a short parent span to address
  const parentSpan =
    parent.text.length > 80 ? `${parent.text.slice(0, 77)}...` : parent.text;

  if (ask === 'opener_headliner') {
    const answers = [
      {
        text: `Opener. Their newer material is the interesting part of that bill for me.`,
        span: 'Opener',
      },
      {
        text: `I'd take support if I'm awake. Headliner only if I'm late.`,
        span: 'support',
      },
      {
        text: `Headliner if the night runs long. Otherwise the opener decides it.`,
        span: 'Headliner',
      },
    ];
    const c = pick(rng, answers);
    return {
      text: c.text,
      contributionType: 'answer',
      parentSpan,
      addressedSpan: c.span,
      citedFactIds: [event.id],
    };
  }

  if (ask === 'track') {
    // Must name a concrete entry — genre-flavored stand-ins, not "a recent live cut"
    const titles: Record<string, string[]> = {
      indie: ['“After The Earthquake”', '“Pharmacist”', 'an earlier LP cut'],
      'hip-hop': ['a recent live freestyle clip', 'the album opener', 'the feature-heavy cut'],
      edm: ['the extended club mix', 'the peak-time edit', 'the closer from the last stream'],
      metal: ['the mid-set crusher', 'the deep cut before the encore block', 'an older LP track'],
      pop: ['the ballad mid-set', 'the album cut past the singles', 'the live acoustic take'],
    };
    const opts = titles[event.genreId ?? 'indie'] ?? titles.indie!;
    const title = pick(rng, opts);
    return {
      text: `Album cut: ${title}. It gets to the live chemistry faster than the radio single.`,
      contributionType: 'answer',
      parentSpan,
      addressedSpan: 'live cut',
      citedFactIds: [event.id],
    };
  }

  if (ask === 'production') {
    return {
      text: pick(rng, [
        `Lighting over mix, for me. Spectacle without dynamics loses the thread.`,
        `I'd take the mix. Drops without shape get old fast.`,
        `If the room is washed bright all night, I'd rather skip than chase the drop.`,
      ]),
      contributionType: 'answer',
      parentSpan,
      addressedSpan: 'lighting or mix',
      citedFactIds: [event.id],
    };
  }

  if (ask === 'doors') {
    return {
      text: doors
        ? `${doors}. Plan arrival around that, not the start rumor.`
        : `Start time is listed; doors aren't in what I have.`,
      contributionType: 'answer',
      parentSpan,
      addressedSpan: 'doors',
      citedFactIds: [event.id],
    };
  }

  if (ask === 'generic') {
    return {
      text: pick(rng, [
        `Album cut over the single, for me.`,
        `I'd go early if support looks real.`,
        `Not for me as a must, but I get why people mark it.`,
      ]),
      contributionType: 'answer',
      parentSpan,
      addressedSpan: '?',
      citedFactIds: [event.id],
    };
  }

  // React to specific parent content — not generic filler
  const reactions: Draft[] = [];

  if (/setlist|encore|prediction/i.test(parent.text)) {
    reactions.push({
      text: `Agreed on waiting. Encore talk before a real setlist just spreads noise.`,
      contributionType: 'reaction',
      parentSpan,
      addressedSpan: 'setlist',
      citedFactIds: [event.id],
    });
  }
  if (/deep cut|album|single|streaming/i.test(parent.text)) {
    reactions.push({
      text:
        a === 'deep-catalog fan'
          ? `Same pull toward the album side. The single rarely tells you what the room will feel like.`
          : `I get the album-cut preference. I'd still check one live take before deciding.`,
      contributionType: 'preference',
      parentSpan,
      addressedSpan: 'album/single',
      citedFactIds: [event.id],
    });
  }
  if (/opener|support/i.test(parent.text)) {
    reactions.push({
      text: `If support is weak I wouldn't rearrange the night for the headliner block alone.`,
      contributionType: 'reaction',
      parentSpan,
      addressedSpan: 'opener/support',
      citedFactIds: [event.id],
    });
  }
  if (/lighting|mix|production|pace|dance|club/i.test(parent.text)) {
    reactions.push({
      text: `That lighting/mix take makes sense. I'd rather a darker room with shape than a bright wash.`,
      contributionType: 'reaction',
      parentSpan,
      addressedSpan: 'lighting/mix',
      citedFactIds: [event.id],
    });
  }
  if (/doors|start|timing|early/i.test(parent.text)) {
    reactions.push({
      text: doors
        ? `Doors at ${doors} is the useful number. Start rumors shift; that usually doesn't.`
        : `I'd lock doors/start first. The rest of the debate can wait.`,
      contributionType: 'reaction',
      parentSpan,
      addressedSpan: 'timing',
      citedFactIds: [event.id],
    });
  }

  // Longer disagreement / explanation (21–45 words target)
  if (rng() < 0.4 && reactions.length) {
    const base = reactions[0]!;
    return {
      ...base,
      text: `${base.text} Not trying to keep the thread going; that was the only part I had a clear take on.`,
    };
  }

  if (!reactions.length) {
    // Mild disagreement tied to parent wording — still addressable, not filler
    if (/doors|start|timing|early|date|venue|at /i.test(parent.text)) {
      return {
        text: `I'd lock timing first. The rest of the debate can wait until that number is settled.`,
        contributionType: 'preference',
        parentSpan,
        addressedSpan: 'timing',
        citedFactIds: [event.id],
      };
    }
    return null;
  }

  return pick(rng, reactions);
}

function utcForLocalHour(
  dayUtcMs: number,
  localHour: number,
  localMinute: number,
  timeZone: string,
): Date | null {
  for (let utcH = 0; utcH < 24; utcH++) {
    const cand = new Date(dayUtcMs);
    cand.setUTCHours(utcH, localMinute, 0, 0);
    const loc = localPartsInTimezone(cand.toISOString(), timeZone);
    if (loc.hour === localHour) return cand;
  }
  return null;
}

function scheduleOne(
  rng: () => number,
  eventStartsAt: string,
  room: RoomState,
): { when: Date; local: ReturnType<typeof localPartsInTimezone> } | null {
  const eventStart = Date.parse(eventStartsAt);
  const winStart = eventStart - 7 * 24 * 3600_000;
  const winEnd = eventStart + 24 * 3600_000;
  const now = Date.now();
  const earliest = Math.max(now + 60 * 60_000, winStart);

  for (let attempt = 0; attempt < 40; attempt++) {
    const span = Math.max(1, winEnd - earliest);
    const tGuess = earliest + Math.floor(rng() * span);
    const localHour = 10 + Math.floor(rng() * 12); // 10–21
    const localMinute = Math.floor(rng() * 50);
    const dayBase = tGuess - (tGuess % (24 * 3600_000));
    const when = utcForLocalHour(dayBase, localHour, localMinute, ROOM_TIMEZONE);
    if (!when || when.getTime() < earliest || when.getTime() >= winEnd) continue;

    const local = localPartsInTimezone(when.toISOString(), ROOM_TIMEZONE);
    if (isQuietHourLocal(local.hour)) continue;

    if (room.lastAiAtUtc != null) {
      const gap = when.getTime() - room.lastAiAtUtc;
      if (gap >= 0 && gap < PILOT_MIN_GAP_MS) continue;
    }

    const dayKey = local.ymd;
    const starts = room.startsByDay.get(dayKey) ?? 0;
    if (starts >= PILOT_MAX_STARTS_PER_ROOM_DAY) continue;
    const dayMsgs = room.msgsByDay.get(dayKey) ?? 0;
    if (dayMsgs >= PILOT_MAX_AI_PER_ROOM_24H) continue;

    return { when, local };
  }
  return null;
}

function silenceDecision(
  base: Partial<ContextualDecision> &
    Pick<ContextualDecision, 'decision_id' | 'generation_id' | 'generated_at' | 'genre_id' | 'room_key'>,
  reason: string,
  roomVisible: number,
  consecutiveAi: number,
): ContextualDecision {
  return {
    decision_id: base.decision_id,
    generation_id: base.generation_id,
    generated_at: base.generated_at,
    action: 'SILENCE',
    silence_reason: reason,
    genre_id: base.genre_id,
    room_key: base.room_key,
    room_timezone: ROOM_TIMEZONE,
    persona_id: base.persona_id ?? null,
    persona_name: base.persona_name ?? null,
    persona_archetype: base.persona_archetype ?? null,
    sender_slot: base.sender_slot ?? null,
    content: null,
    intent: null,
    intent_confidence: null,
    contribution_type: null,
    conversation_id: null,
    turn_number: null,
    reply_to_turn: null,
    parent_message_id: null,
    parent_span: null,
    addressed_parent_span: null,
    event_id: null,
    artist_name: null,
    venue_name: null,
    city: null,
    event_local_date: null,
    event_local_time: null,
    event_starts_at_utc: null,
    source_url: null,
    source_retrieved_at: null,
    source_field_path: null,
    cited_fact_ids: [],
    fact_confidence: null,
    scheduled_at: null,
    scheduled_at_local: null,
    status: 'skipped',
    data_segment: 'fixture',
    gate_summary: 'silence:n/a',
    normalized_key: null,
    structural_fingerprint: null,
    template_family: null,
    guide_version: WRITING_GUIDE_VERSION,
    generator_version: GENERATOR_VERSION,
    rule_version: RULE_VERSION,
    contains_setlist_spoiler: false,
    reviewer_decision: null,
    failure_reasons: '',
    audit: {
      gates: [],
      rejectionCodes: [],
      generation_id: base.generation_id,
      room_visible_count: roomVisible,
      consecutive_ai: consecutiveAi,
    },
  };
}

export function runContextualSeed(options?: {
  targetDecisions?: number;
  seed?: number;
  genres?: string[];
  /** How many sender slots exist (caps persona count 1:1). */
  senderCount?: number;
  /** Admin-edited voice/strategy/templates. Empty uses code defaults. */
  strategy?: Partial<WritingStrategy> | null;
}): ContextualSeedResult {
  const target = Math.max(20, Math.min(options?.targetDecisions ?? 200, 500));
  const seed = options?.seed ?? 42;
  const genres = options?.genres ?? [...LAUNCH_GENRES];
  const senderCount = options?.senderCount ?? 8;
  const strategy = mergeWritingStrategy(options?.strategy);
  const rng = createRng(seed);

  const personas = buildBoundPersonaCatalog(genres, senderCount);
  const byGenre = new Map<string, BoundPersona[]>();
  for (const p of personas) {
    const list = byGenre.get(p.genreId) ?? [];
    list.push(p);
    byGenre.set(p.genreId, list);
  }

  const rooms = new Map<string, RoomState>();
  for (const g of genres) {
    rooms.set(`genre:${g}`, {
      roomKey: `genre:${g}`,
      genreId: g,
      messages: [],
      lastAiAtUtc: null,
      startsByDay: new Map(),
      msgsByDay: new Map(),
    });
  }

  const decisions: ContextualDecision[] = [];
  const posts: ContextualDecision[] = [];
  const silences: ContextualDecision[] = [];
  const exactTexts: string[] = [];
  const familyCounts = new Map<string, number>();
  const genreCounts: Record<string, number> = {};
  let genClock = Date.now();

  for (let d = 0; d < target; d++) {
    genClock += 15_000 + Math.floor(rng() * 45_000); // distinct generation times
    const generatedAt = new Date(genClock).toISOString();
    const generationId = newId();
    const decisionId = newId();

    const genreId = pick(rng, genres);
    const room = rooms.get(`genre:${genreId}`)!;
    const pool = byGenre.get(genreId) ?? [];

    // Consecutive AI only within the active branch (same conversation)
    let consecutiveAi = 0;
    const tip = room.messages[room.messages.length - 1];
    if (tip) {
      for (let i = room.messages.length - 1; i >= 0; i--) {
        if (room.messages[i]!.conversationId !== tip.conversationId) break;
        consecutiveAi += 1;
      }
    }

    const baseMeta = {
      decision_id: decisionId,
      generation_id: generationId,
      generated_at: generatedAt,
      genre_id: genreId,
      room_key: room.roomKey,
    };

    if (!pool.length) {
      const s = silenceDecision(baseMeta, 'NO_PERSONA_FOR_GENRE', room.messages.length, consecutiveAi);
      decisions.push(s);
      silences.push(s);
      continue;
    }

    // Adaptive silence toward ~40% of decisions
    const silenceSoFar = silences.length / Math.max(decisions.length, 1);
    const postsSoFar = posts.length;
    let silenceBias = 0.38;
    if (postsSoFar < target * 0.35) silenceBias = 0.08;
    else if (silenceSoFar < 0.35) silenceBias = 0.55;
    else if (silenceSoFar > 0.45) silenceBias = 0.05;

    if (rng() < silenceBias) {
      const s = silenceDecision(
        {
          ...baseMeta,
          persona_id: pool[0]!.id,
          persona_name: pool[0]!.displayName,
          persona_archetype: pool[0]!.archetype,
          sender_slot: pool[0]!.senderSlot,
        },
        'NO_NATURAL_CONTRIBUTION',
        room.messages.length,
        consecutiveAi,
      );
      decisions.push(s);
      silences.push(s);
      continue;
    }

    const events = pilotFactsForGenre(genreId).filter((f) => f.kind === 'event');
    if (!events.length) {
      const s = silenceDecision(baseMeta, 'INSUFFICIENT_FACTS', room.messages.length, consecutiveAi);
      decisions.push(s);
      silences.push(s);
      continue;
    }

    // Prefer reply only while the active branch is short. Once it has 2+ AI turns,
    // start a new conversation — never silence the whole room forever on the tip.
    const last = room.messages[room.messages.length - 1];
    const canReply =
      !!last &&
      last.turnNumber < 3 &&
      rng() < 0.38 &&
      pool.some((p) => p.id !== last.personaId);

    let action: DecisionAction = canReply ? 'REPLY' : 'POST';
    let persona = pick(rng, pool);
    let parent: RoomMessage | null = null;
    let event = pick(rng, events);
    let draft: Draft | null = null;

    if (action === 'REPLY' && last) {
      parent = last;
      event =
        events.find((e) => e.eventId === last.eventId) ??
        events.find((e) => e.artistName === last.artistName) ??
        event;
      const candidates = pool.filter((p) => p.id !== last.personaId);
      persona = pick(rng, candidates.length ? candidates : pool);
      draft = draftReply(last, event, persona, rng);
      if (!draft) {
        // No natural reply angle → start a new conversation instead of silence
        action = 'POST';
        parent = null;
        persona = pick(rng, pool);
        event = pick(rng, events);
      }
    } else {
      action = 'POST';
    }

    const sched = scheduleOne(rng, event.occurredAt!, room);
    if (!sched) {
      const s = silenceDecision(
        {
          ...baseMeta,
          persona_id: persona.id,
          persona_name: persona.displayName,
          persona_archetype: persona.archetype,
          sender_slot: persona.senderSlot,
        },
        'CONTEXT_STALE',
        room.messages.length,
        consecutiveAi,
      );
      decisions.push(s);
      silences.push(s);
      continue;
    }

    let isReply = action === 'REPLY';
    let conversationId = isReply && parent ? parent.conversationId : newId();

    // Retry drafts when family/exact collisions would silence a valid intent
    const saturatedFamilies = new Set(
      [...familyCounts.entries()]
        .filter(([, c]) => (c + 1) / Math.max(posts.length + 1, Math.floor(target * 0.5)) > 0.02)
        .map(([f]) => f),
    );
    const exactSet = new Set(exactTexts);
    let gate: ReturnType<typeof validateCandidateEvidence> | null = null;
    let derived = { primary: 'opinion' as const, confidence: 0.7 };
    for (let attempt = 0; attempt < 8; attempt++) {
      if (!isReply) {
        if (attempt > 0) {
          event = pick(rng, events);
          persona = pick(rng, pool);
        }
        draft = draftOpener(event, persona, rng, strategy, exactSet, saturatedFamilies);
        conversationId = newId();
        if (!draft) continue;
      } else if (!draft) {
        break;
      }

      const turnNumber = isReply && parent ? parent.turnNumber + 1 : 1;
      derived = classifyIntent(draft.text, isReply);
      const nkey = normalizeForDup(draft.text, {
        artist: event.artistName ?? undefined,
        venue: event.venueName ?? undefined,
        city: event.city ?? undefined,
        date: humanDate(event.occurredAt),
        time: doorsFromClaim(event.claim) ?? startFromIso(event.occurredAt) ?? undefined,
      });
      const fam = templateFamilyId(nkey, turnNumber);
      const famCount = familyCounts.get(fam) ?? 0;
      const familyShare =
        (famCount + 1) / Math.max(posts.length + 1, Math.floor(target * 0.5));

      gate = validateCandidateEvidence({
        text: draft.text,
        authorType: AUTHOR_TYPE_AI,
        disclosureLabel: DISCLOSURE_LABEL,
        personaId: persona.id,
        personaName: persona.displayName,
        personaGenre: persona.genreId,
        roomGenre: genreId,
        personaValid: true,
        conversationId,
        turnNumber,
        replyToTurn: isReply && parent ? parent.turnNumber : null,
        isReply,
        parentText: parent?.text,
        parentExists: !isReply || !!parent,
        parentSpan: draft.parentSpan,
        addressedParentSpan: draft.addressedSpan,
        eventId: event.eventId,
        artistName: event.artistName,
        venueName: event.venueName,
        city: event.city,
        eventLocalDate: humanDate(event.occurredAt),
        eventLocalTimeLabel: doorsFromClaim(event.claim) ?? startFromIso(event.occurredAt),
        sourceUrl: event.sourceUrl,
        sourceRetrievedAt: event.retrievedAt,
        sourceFieldPath: 'events.startDate+performer+location',
        citedFactIds: draft.citedFactIds,
        dataSegment: 'fixture',
        roomTimezone: ROOM_TIMEZONE,
        scheduledAtUtc: sched.when.toISOString(),
        eventStartsAtUtc: event.occurredAt,
        priorNormalized: [],
        priorExactTexts: exactTexts,
        priorFingerprints: [],
        priorFingerprintsSameTurn: [],
        familyShare,
        lastAiAtUtc: room.lastAiAtUtc,
        conversationStartsToday:
          (room.startsByDay.get(sched.local.ymd) ?? 0) + (turnNumber === 1 ? 1 : 0),
        graphValid: true,
        intent: derived.primary,
        maxStartsPerRoomDay: PILOT_MAX_STARTS_PER_ROOM_DAY,
        minGapMs: PILOT_MIN_GAP_MS,
      });

      if (gate.passed) break;
      const retryable = gate.rejectionCodes.every((c) =>
        [
          'TEMPLATE_FAMILY_OVER_CAP',
          'EXACT_DUPLICATE',
          'STRUCTURAL_DUPLICATE',
          'REPLY_GENERIC_TO_TOPIC',
          'QUESTION_NOT_ANSWERED_FIRST',
        ].includes(c),
      );
      if (!retryable) break;
      // Failed reply → convert this decision into a fresh opener attempt
      if (isReply) {
        action = 'POST';
        isReply = false;
        parent = null;
        draft = null;
      }
    }

    if (!draft || !gate || !gate.passed) {
      const s = silenceDecision(
        {
          ...baseMeta,
          persona_id: persona.id,
          persona_name: persona.displayName,
          persona_archetype: persona.archetype,
          sender_slot: persona.senderSlot,
        },
        gate?.rejectionCodes[0] ?? 'REPETITION_RISK',
        room.messages.length,
        consecutiveAi,
      );
      s.failure_reasons = gate?.rejectionCodes.join('|') ?? '';
      s.audit.gates = gate?.gates ?? [];
      s.audit.rejectionCodes = gate?.rejectionCodes ?? [];
      decisions.push(s);
      silences.push(s);
      continue;
    }

    const turnNumber = isReply && parent ? parent.turnNumber + 1 : 1;
    const nkey = normalizeForDup(draft.text, {
      artist: event.artistName ?? undefined,
      venue: event.venueName ?? undefined,
      city: event.city ?? undefined,
      date: humanDate(event.occurredAt),
      time: doorsFromClaim(event.claim) ?? startFromIso(event.occurredAt) ?? undefined,
    });
    const fam = templateFamilyId(nkey, turnNumber);
    const famCount = familyCounts.get(fam) ?? 0;
    const timeLabelFinal = doorsFromClaim(event.claim) ?? startFromIso(event.occurredAt);

    const messageId = newId();
    const decision: ContextualDecision = {
      decision_id: decisionId,
      generation_id: generationId,
      generated_at: generatedAt,
      action,
      silence_reason: null,
      genre_id: genreId,
      room_key: room.roomKey,
      room_timezone: ROOM_TIMEZONE,
      persona_id: persona.id,
      persona_name: persona.displayName,
      persona_archetype: persona.archetype,
      sender_slot: persona.senderSlot,
      content: draft.text,
      intent: derived.primary,
      intent_confidence: derived.confidence,
      contribution_type: draft.contributionType,
      conversation_id: conversationId,
      turn_number: turnNumber,
      reply_to_turn: isReply && parent ? parent.turnNumber : null,
      parent_message_id: parent?.messageId ?? null,
      parent_span: draft.parentSpan,
      addressed_parent_span: draft.addressedSpan,
      event_id: event.eventId ?? null,
      artist_name: event.artistName ?? null,
      venue_name: event.venueName ?? null,
      city: event.city ?? null,
      event_local_date: humanDate(event.occurredAt),
      event_local_time: timeLabelFinal,
      event_starts_at_utc: event.occurredAt ?? null,
      source_url: event.sourceUrl,
      source_retrieved_at: event.retrievedAt,
      source_field_path: 'events.startDate+performer+location',
      cited_fact_ids: draft.citedFactIds,
      fact_confidence: event.confidence,
      scheduled_at: sched.when.toISOString(),
      scheduled_at_local: `${sched.local.ymd} ${String(sched.local.hour).padStart(2, '0')}:${String(sched.local.minute).padStart(2, '0')} ${ROOM_TIMEZONE}`,
      status: 'scheduled',
      data_segment: 'fixture',
      gate_summary: gateSummaryFromEvidence(gate.gates),
      normalized_key: gate.normalizedKey,
      structural_fingerprint: gate.fingerprint,
      template_family: gate.familyId,
      guide_version: WRITING_GUIDE_VERSION,
      generator_version: GENERATOR_VERSION,
      rule_version: RULE_VERSION,
      contains_setlist_spoiler: false,
      reviewer_decision: null,
      failure_reasons: '',
      audit: {
        gates: gate.gates,
        rejectionCodes: [],
        generation_id: generationId,
        parent_span: draft.parentSpan,
        addressed_parent_span: draft.addressedSpan,
        room_visible_count: room.messages.length,
        consecutive_ai: consecutiveAi,
      },
    };

    // Commit to room state (this is the "posted" context for later decisions)
    room.messages.push({
      messageId,
      conversationId,
      turnNumber,
      personaId: persona.id,
      text: draft.text,
      generatedAt,
      scheduledAt: sched.when.toISOString(),
      eventId: event.eventId!,
      artistName: event.artistName!,
      venueName: event.venueName!,
    });
    room.lastAiAtUtc = sched.when.getTime();
    if (turnNumber === 1) {
      room.startsByDay.set(sched.local.ymd, (room.startsByDay.get(sched.local.ymd) ?? 0) + 1);
    }
    room.msgsByDay.set(sched.local.ymd, (room.msgsByDay.get(sched.local.ymd) ?? 0) + 1);
    exactTexts.push(draft.text.toLowerCase().replace(/\s+/g, ' ').trim());
    familyCounts.set(fam, famCount + 1);
    genreCounts[genreId] = (genreCounts[genreId] ?? 0) + 1;

    decisions.push(decision);
    posts.push(decision);
  }

  const lengthBuckets = { under8: 0, mid8_20: 0, mid21_45: 0, mid46_90: 0 };
  for (const p of posts) {
    const w = wordCount(p.content ?? '');
    if (w < 8) lengthBuckets.under8 += 1;
    else if (w <= 20) lengthBuckets.mid8_20 += 1;
    else if (w <= 45) lengthBuckets.mid21_45 += 1;
    else lengthBuckets.mid46_90 += 1;
  }

  return {
    decisions,
    posts,
    silences,
    personas,
    stats: {
      decisions: decisions.length,
      posts: posts.filter((p) => p.action === 'POST').length,
      replies: posts.filter((p) => p.action === 'REPLY').length,
      silences: silences.length,
      silenceRate: silences.length / Math.max(decisions.length, 1),
      uniqueTexts: new Set(posts.map((p) => p.content)).size,
      templateFamilies: familyCounts.size,
      lengthBuckets,
      genres: genreCounts,
    },
  };
}

export function contextualDecisionsCsv(decisions: ContextualDecision[]): string {
  const headers = [
    'decision_id',
    'generation_id',
    'generated_at',
    'action',
    'silence_reason',
    'genre_id',
    'room_timezone',
    'persona_id',
    'persona_name',
    'persona_archetype',
    'sender_slot',
    'content',
    'intent',
    'contribution_type',
    'conversation_id',
    'turn_number',
    'reply_to_turn',
    'parent_message_id',
    'parent_span',
    'addressed_parent_span',
    'event_id',
    'artist_name',
    'venue_name',
    'city',
    'event_local_date',
    'event_local_time',
    'event_starts_at_utc',
    'source_url',
    'source_retrieved_at',
    'source_field_path',
    'cited_fact_ids',
    'fact_confidence',
    'scheduled_at',
    'scheduled_at_local',
    'status',
    'data_segment',
    'gate_summary',
    'normalized_key',
    'structural_fingerprint',
    'template_family',
    'guide_version',
    'generator_version',
    'rule_version',
    'failure_reasons',
  ];
  const esc = (v: unknown) => {
    const s = v == null ? '' : Array.isArray(v) ? v.join('|') : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(','),
    ...decisions.map((r) =>
      headers.map((h) => esc((r as Record<string, unknown>)[h])).join(','),
    ),
  ].join('\n');
}
