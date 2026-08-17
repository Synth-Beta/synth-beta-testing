/**
 * Human-conversation quality seed (update(1).md).
 * Episodes: ~60% standalone / ~30% one-reply / ~10% two-replies. Max 3 AI in a branch.
 */

import { pilotFactsForGenre, PILOT_EVENTS } from '../fixtures/pilotEvents.js';
import { seedPersonas, createRng } from '../seed/personas.js';
import { newId } from '../lib/hash.js';
import { doorsLabelFromClaim, timeLabelFromIso } from './groundedConversation.js';
import { buildEpisode, pickEpisodeShape } from './humanContribution.js';
import {
  classifyIntent,
  validateCandidateEvidence,
  validateConversationGraph,
  gateSummaryFromEvidence,
  localPartsInTimezone,
  isQuietHourLocal,
  normalizeForDup,
  structuralFingerprint,
  templateFamilyId,
  MIN_GAP_MS,
  MAX_CONVERSATION_STARTS_PER_ROOM_DAY,
  MAX_AI_MESSAGES_PER_ROOM_24H,
  GENERATOR_VERSION,
  WRITING_GUIDE_VERSION,
  RULE_VERSION,
  type GateResult,
} from './writingGuide.js';
import type { AiGuidePersona, GroundedFact } from '../types.js';
import { AUTHOR_TYPE_AI, DISCLOSURE_LABEL, LAUNCH_GENRES } from '../types.js';

export const ROOM_TIMEZONE = 'America/Los_Angeles';

export type QualitySeedRow = {
  id: string;
  conversation_id: string;
  turn_number: number;
  reply_to_turn: number | null;
  genre_id: string;
  room_key: string;
  room_timezone: string;
  persona_id: string;
  persona_name: string;
  persona_archetype: string;
  sender_name: string;
  content: string;
  intent: string;
  intent_confidence: number;
  status: string;
  data_segment: 'fixture' | 'live';
  scheduled_at: string;
  scheduled_at_local: string;
  posted_at: string | null;
  event_id: string | null;
  artist_name: string | null;
  venue_name: string | null;
  city: string | null;
  event_local_date: string | null;
  event_local_time: string | null;
  event_starts_at_utc: string | null;
  source_url: string | null;
  source_retrieved_at: string | null;
  source_field_path: string;
  fact_confidence: number;
  contains_setlist_spoiler: boolean;
  reviewer_decision: string | null;
  failure_reasons: string;
  gate_summary: string;
  similarity_score: number;
  normalized_key: string;
  structural_fingerprint: string;
  template_family: string;
  nearest_message_id: string | null;
  guide_version: string;
  generator_version: string;
  rule_version: string;
  human_interruption_outcome: string | null;
  audit: {
    gates: GateResult[];
    rejectionCodes: string[];
    graphValid: boolean;
  };
};

export type QualitySeedResult = {
  rows: QualitySeedRow[];
  rejected: number;
  conversations: number;
  stats: {
    uniqueTexts: number;
    exactDupPrevented: number;
    structuralDupPrevented: number;
    graphRejected: number;
    genres: Record<string, number>;
    quietHourPrevented: number;
    topology: { standalone: number; one_reply: number; two_replies: number };
  };
};

function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function enrichPersonas(personas: AiGuidePersona[], genreId: string, events: GroundedFact[]): void {
  const artists = events.map((e) => e.artistName).filter(Boolean) as string[];
  const venues = [...new Set(events.map((e) => e.venueName).filter(Boolean))] as string[];
  for (let i = 0; i < personas.length; i++) {
    const p = personas[i]!;
    p.voiceTraits = {
      ...p.voiceTraits,
      preferredArtists: [
        artists[i % artists.length],
        artists[(i + 3) % artists.length],
        artists[(i + 5) % artists.length],
      ].filter(Boolean),
      venueInterests: venues.slice(0, 3),
      adjacentGenres: genreId === 'indie' ? ['alternative'] : genreId === 'metal' ? ['punk'] : [],
      disagreementStyle: i % 2 === 0 ? 'evidence_first' : 'preference_first',
      opinionTendencies: {
        earlySet: i % 3 === 0,
        lightingOverSpace: i % 3 === 1,
        deepCuts: i % 3 === 2,
      },
    };
  }
}

function utcInstantForPacificHour(
  dayUtcMs: number,
  localHour: number,
  localMinute: number,
): Date | null {
  for (let utcH = 0; utcH < 24; utcH++) {
    const cand = new Date(dayUtcMs);
    cand.setUTCHours(utcH, localMinute, 0, 0);
    const loc = localPartsInTimezone(cand.toISOString(), ROOM_TIMEZONE);
    if (loc.hour === localHour) return cand;
  }
  return null;
}

function scheduleInEventWindow(
  rng: () => number,
  eventStartsAt: string,
  turnCount: number,
  lastRoomAt: number,
  roomKey: string,
  startsByRoomDay: Map<string, number>,
  msgsByRoomDay: Map<string, number>,
): Date[] | null {
  const eventStart = Date.parse(eventStartsAt);
  const winStart = eventStart - 7 * 24 * 3600_000;
  const winEnd = eventStart + 24 * 3600_000;
  const now = Date.now();
  // Fixture sample: pack by event window only. Intra-episode gaps are enforced
  // below; cross-event room gap is validated per-candidate against lastRoomAt.
  const earliest = Math.max(now + 30 * 60_000, winStart);
  if (earliest >= winEnd) return null;

  const dayMs = 24 * 3600_000;
  const dayCount = Math.max(1, Math.floor((winEnd - earliest) / dayMs));

  for (let attempt = 0; attempt < 24; attempt++) {
    const localHour = 10 + Math.floor(rng() * 12);
    const localMinute = Math.floor(rng() * 50);
    const dayIndex = Math.floor(rng() * dayCount);
    const t0 = utcInstantForPacificHour(earliest + dayIndex * dayMs, localHour, localMinute);
    if (!t0 || t0.getTime() < earliest || t0.getTime() >= winEnd) continue;
    if (lastRoomAt > 0 && Math.abs(t0.getTime() - lastRoomAt) < MIN_GAP_MS) continue;

    const local = localPartsInTimezone(t0.toISOString(), ROOM_TIMEZONE);
    if (isQuietHourLocal(local.hour)) continue;

    const dayKey = `${roomKey}:${local.ymd}`;
    const starts = startsByRoomDay.get(dayKey) ?? 0;
    if (starts >= MAX_CONVERSATION_STARTS_PER_ROOM_DAY) continue;

    const dayMsgs = msgsByRoomDay.get(dayKey) ?? 0;
    if (dayMsgs + turnCount > MAX_AI_MESSAGES_PER_ROOM_24H) continue;

    const times: Date[] = [t0];
    let ok = true;
    for (let i = 1; i < turnCount; i++) {
      const gap = MIN_GAP_MS + Math.floor(rng() * 20 * 60_000);
      const next = new Date(times[i - 1]!.getTime() + gap);
      const loc = localPartsInTimezone(next.toISOString(), ROOM_TIMEZONE);
      if (isQuietHourLocal(loc.hour) || next.getTime() > winEnd) {
        ok = false;
        break;
      }
      times.push(next);
    }
    if (!ok) continue;
    // Do not burn daily start slots until the episode is accepted.
    return times;
  }
  return null;
}

export function runQualitySeed(options?: {
  targetMessages?: number;
  seed?: number;
  genres?: string[];
  includeHumanInterruptionDemo?: boolean;
}): QualitySeedResult {
  const target = Math.max(100, Math.min(options?.targetMessages ?? 300, 5000));
  const seed = options?.seed ?? 42;
  const genres = options?.genres ?? [...LAUNCH_GENRES];
  const rng = createRng(seed);

  const rows: QualitySeedRow[] = [];
  const approvedNormalized: string[] = [];
  const approvedExact: string[] = [];
  const approvedFingerprintsByTurn = new Map<number, string[]>();
  const familyCounts = new Map<string, number>();
  let rejected = 0;
  let conversations = 0;
  let exactDupPrevented = 0;
  let structuralDupPrevented = 0;
  let graphRejected = 0;
  let quietHourPrevented = 0;
  const genreCounts: Record<string, number> = {};
  const topology = { standalone: 0, one_reply: 0, two_replies: 0 };
  const lastRoomAt = new Map<string, number>();
  const startsByRoomDay = new Map<string, number>();
  const msgsByRoomDay = new Map<string, number>();

  const personaCatalog = new Map<string, AiGuidePersona[]>();
  for (const g of genres) {
    const facts = pilotFactsForGenre(g);
    const { personas } = seedPersonas({ genreId: g, count: 50, seed: seed + g.length * 17 });
    enrichPersonas(personas, g, facts);
    personaCatalog.set(g, personas);
  }

  let guard = 0;
  while (rows.length < target && guard < target * 20) {
    guard += 1;
    const genreId = pick(rng, genres);
    const facts = pilotFactsForGenre(genreId);
    const events = facts.filter((f) => f.kind === 'event');
    if (!events.length) continue;
    const event = pick(rng, events);

    const catalog = personaCatalog.get(genreId) ?? [];
    const pool = catalog.filter((p) => p.genreId === genreId && p.isActive && p.id);
    if (pool.length < 1) continue;

    const shape = pickEpisodeShape(rng);
    const needPersonas = shape === 'standalone' ? 1 : 2;
    const shuffled = [...pool].sort(() => rng() - 0.5);
    const chosen = shuffled.slice(0, Math.min(3, Math.max(needPersonas, 2)));
    if (chosen.length < needPersonas || chosen.some((p) => !p.id)) {
      rejected += 1;
      continue;
    }

    const conversationId = newId();
    const messages = buildEpisode({
      event,
      personas: chosen,
      shape,
      variant: Math.floor(rng() * 200),
    });
    if (!messages.length) {
      rejected += 1;
      continue;
    }

    // Cap: never schedule 4+ in a branch
    if (messages.length > 3) {
      graphRejected += 1;
      rejected += 1;
      continue;
    }

    const turnCount = messages.length;
    const roomKey = `genre:${genreId}`;

    const times = scheduleInEventWindow(
      rng,
      event.occurredAt!,
      turnCount,
      lastRoomAt.get(roomKey) ?? 0,
      roomKey,
      startsByRoomDay,
      msgsByRoomDay,
    );
    if (!times) {
      quietHourPrevented += 1;
      continue;
    }

    const graphTurns = messages.map((m, i) => ({
      turnNumber: i + 1,
      replyToTurn: i === 0 ? null : i,
      personaId: m.personaId,
    }));
    const graph = validateConversationGraph(graphTurns);
    if (!graph.valid) {
      graphRejected += 1;
      rejected += messages.length;
      continue;
    }

    const pending: QualitySeedRow[] = [];
    let convoFailed = false;
    let lastAt = lastRoomAt.get(roomKey) ?? 0;

    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i]!;
      const persona = chosen.find((p) => p.id === msg.personaId) ?? pool.find((p) => p.id === msg.personaId);
      if (!persona?.id) {
        convoFailed = true;
        break;
      }

      const when = times[i]!;
      const local = localPartsInTimezone(when.toISOString(), ROOM_TIMEZONE);
      if (isQuietHourLocal(local.hour)) {
        quietHourPrevented += 1;
        convoFailed = true;
        break;
      }

      const derived = classifyIntent(msg.text, i > 0);
      msg.intent = derived.primary;
      msg.confidence = derived.confidence;

      const doors = doorsLabelFromClaim(event.claim);
      const timeLabel = doors ?? timeLabelFromIso(event.occurredAt);

      const entities = {
        artist: event.artistName ?? undefined,
        venue: event.venueName ?? undefined,
        city: event.city ?? undefined,
      };
      const nkey = normalizeForDup(msg.text, {
        ...entities,
        date: event.occurredAt?.slice(0, 10),
        time: timeLabel ?? undefined,
      });
      const fp = structuralFingerprint(msg.text, entities);
      const fam = templateFamilyId(fp, i + 1);
      const famCount = familyCounts.get(fam) ?? 0;
      const familyShare = (famCount + 1) / Math.max(target, 1);

      const result = validateCandidateEvidence({
        text: msg.text,
        authorType: AUTHOR_TYPE_AI,
        disclosureLabel: DISCLOSURE_LABEL,
        personaId: persona.id,
        personaName: persona.displayName,
        personaGenre: persona.genreId,
        roomGenre: genreId,
        personaValid: true,
        conversationId,
        turnNumber: i + 1,
        replyToTurn: i === 0 ? null : i,
        isReply: i > 0,
        parentText: i > 0 ? messages[i - 1]!.text : undefined,
        parentExists: i === 0 || true,
        eventId: event.eventId,
        artistName: event.artistName,
        venueName: event.venueName,
        city: event.city,
        eventLocalDate: event.occurredAt?.slice(0, 10),
        eventLocalTimeLabel: timeLabel,
        sourceUrl: event.sourceUrl,
        sourceRetrievedAt: event.retrievedAt,
        dataSegment: 'fixture',
        roomTimezone: ROOM_TIMEZONE,
        scheduledAtUtc: when.toISOString(),
        eventStartsAtUtc: event.occurredAt,
        priorNormalized: [...approvedNormalized, ...pending.map((p) => p.normalized_key)],
        priorExactTexts: [
          ...approvedExact,
          ...pending.map((p) => p.content.toLowerCase().replace(/\s+/g, ' ').trim()),
        ],
        priorFingerprints: [],
        priorFingerprintsSameTurn: [
          ...(approvedFingerprintsByTurn.get(i + 1) ?? []),
          ...pending.filter((p) => p.turn_number === i + 1).map((p) => p.structural_fingerprint),
        ],
        familyShare,
        lastAiAtUtc: i === 0 ? lastAt || null : Date.parse(pending[i - 1]!.scheduled_at),
        conversationStartsToday: startsByRoomDay.get(`${roomKey}:${local.ymd}`) ?? 1,
        graphValid: true,
        intent: derived.primary,
      });

      if (!result.passed) {
        if (result.rejectionCodes.includes('EXACT_DUPLICATE')) exactDupPrevented += 1;
        if (result.rejectionCodes.includes('STRUCTURAL_DUPLICATE')) structuralDupPrevented += 1;
        convoFailed = true;
        rejected += 1;
        // Do not burn exact text on reject — that exhausted small banks.
        // Structural fingerprints still block true template spam for this turn.
        if (result.rejectionCodes.includes('STRUCTURAL_DUPLICATE')) {
          const turnFps = approvedFingerprintsByTurn.get(i + 1) ?? [];
          turnFps.push(result.fingerprint);
          approvedFingerprintsByTurn.set(i + 1, turnFps);
        }
        break;
      }

      // Human interruption: leave prior turns; do not schedule remaining AI replies
      if (options?.includeHumanInterruptionDemo && conversations % 19 === 18 && i >= 1) {
        break;
      }

      pending.push({
        id: newId(),
        conversation_id: conversationId,
        turn_number: i + 1,
        reply_to_turn: i === 0 ? null : i,
        genre_id: genreId,
        room_key: roomKey,
        room_timezone: ROOM_TIMEZONE,
        persona_id: persona.id,
        persona_name: persona.displayName,
        persona_archetype: persona.archetype,
        sender_name: persona.displayName,
        content: msg.text,
        intent: derived.primary,
        intent_confidence: derived.confidence,
        status: 'candidate',
        data_segment: 'fixture',
        scheduled_at: when.toISOString(),
        scheduled_at_local: `${local.ymd} ${String(local.hour).padStart(2, '0')}:${String(local.minute).padStart(2, '0')} ${ROOM_TIMEZONE}`,
        posted_at: null,
        event_id: event.eventId ?? null,
        artist_name: event.artistName ?? null,
        venue_name: event.venueName ?? null,
        city: event.city ?? null,
        event_local_date: event.occurredAt?.slice(0, 10) ?? null,
        event_local_time: timeLabel,
        event_starts_at_utc: event.occurredAt ?? null,
        source_url: event.sourceUrl,
        source_retrieved_at: event.retrievedAt,
        source_field_path: 'events.startDate+performer+location',
        fact_confidence: event.confidence,
        contains_setlist_spoiler: msg.containsSetlistSpoiler,
        reviewer_decision: null,
        failure_reasons: '',
        gate_summary: gateSummaryFromEvidence(result.gates),
        similarity_score: 0,
        normalized_key: result.normalizedKey,
        structural_fingerprint: result.fingerprint,
        template_family: result.familyId,
        nearest_message_id: null,
        guide_version: WRITING_GUIDE_VERSION,
        generator_version: GENERATOR_VERSION,
        rule_version: RULE_VERSION,
        human_interruption_outcome: null,
        audit: {
          gates: result.gates,
          rejectionCodes: result.rejectionCodes,
          graphValid: true,
        },
      });
    }

    if (convoFailed || pending.length < 1) {
      rejected += pending.length;
      continue;
    }

    const finalGraph = validateConversationGraph(
      pending.map((p) => ({
        turnNumber: p.turn_number,
        replyToTurn: p.reply_to_turn,
        personaId: p.persona_id,
      })),
    );
    if (!finalGraph.valid) {
      graphRejected += 1;
      rejected += pending.length;
      continue;
    }

    conversations += 1;
    if (pending.length === 1) topology.standalone += 1;
    else if (pending.length === 2) topology.one_reply += 1;
    else topology.two_replies += 1;

    const firstLocal = localPartsInTimezone(pending[0]!.scheduled_at, ROOM_TIMEZONE);
    const startDayKey = `${roomKey}:${firstLocal.ymd}`;
    startsByRoomDay.set(startDayKey, (startsByRoomDay.get(startDayKey) ?? 0) + 1);

    for (const row of pending) {
      row.status = 'scheduled';
      rows.push(row);
      approvedNormalized.push(row.normalized_key);
      approvedExact.push(row.content.toLowerCase().replace(/\s+/g, ' ').trim());
      const tfp = approvedFingerprintsByTurn.get(row.turn_number) ?? [];
      tfp.push(row.structural_fingerprint);
      approvedFingerprintsByTurn.set(row.turn_number, tfp);
      familyCounts.set(row.template_family, (familyCounts.get(row.template_family) ?? 0) + 1);
      lastRoomAt.set(roomKey, Date.parse(row.scheduled_at));
      const loc = localPartsInTimezone(row.scheduled_at, ROOM_TIMEZONE);
      const dayKey = `${roomKey}:${loc.ymd}`;
      msgsByRoomDay.set(dayKey, (msgsByRoomDay.get(dayKey) ?? 0) + 1);
      genreCounts[genreId] = (genreCounts[genreId] ?? 0) + 1;
      if (rows.length >= target) break;
    }
  }

  return {
    rows: rows.slice(0, target),
    rejected,
    conversations,
    stats: {
      uniqueTexts: new Set(rows.map((r) => r.content)).size,
      exactDupPrevented,
      structuralDupPrevented,
      graphRejected,
      genres: genreCounts,
      quietHourPrevented,
      topology,
    },
  };
}

export function qualitySeedCsv(rows: QualitySeedRow[]): string {
  const headers = [
    'id',
    'conversation_id',
    'turn_number',
    'reply_to_turn',
    'genre_id',
    'room_timezone',
    'persona_id',
    'persona_name',
    'persona_archetype',
    'content',
    'intent',
    'intent_confidence',
    'status',
    'data_segment',
    'scheduled_at',
    'scheduled_at_local',
    'posted_at',
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
    'fact_confidence',
    'contains_setlist_spoiler',
    'reviewer_decision',
    'failure_reasons',
    'gate_summary',
    'normalized_key',
    'structural_fingerprint',
    'template_family',
    'nearest_message_id',
    'similarity_score',
    'guide_version',
    'generator_version',
    'rule_version',
    'human_interruption_outcome',
  ];
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(','),
    ...rows.map((r) => headers.map((h) => esc((r as Record<string, unknown>)[h])).join(',')),
  ].join('\n');
}

export { PILOT_EVENTS, AUTHOR_TYPE_AI, DISCLOSURE_LABEL };
