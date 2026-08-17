/**
 * Take 3 grounded conversation builder.
 * - App code supplies canonical time labels (never "5:00 p.")
 * - No QA / source-of-truth / natural-stop language
 * - No unsupported venue/crowd claims
 * - Turn goals differ by persona lens + contribution type
 */

import {
  AUTHOR_TYPE_AI,
  DISCLOSURE_LABEL,
  type AiGuidePersona,
  type ConversationPlanDraft,
  type GeneratedConversation,
  type GeneratedGuideMessage,
  type GroundedFact,
} from '../types.js';
import { classifyIntent, formatLocalTimeLabel } from './writingGuide.js';

export type ContributionType =
  | 'grounded_fact'
  | 'specific_reaction'
  | 'reasoned_disagreement'
  | 'focused_question'
  | 'useful_context';

type VoiceLens =
  | 'doors_practical'
  | 'catalog_deep'
  | 'opener_watch'
  | 'production'
  | 'discovery'
  | 'subgenre'
  | 'setlist_careful';

function lensForPersona(p: AiGuidePersona): VoiceLens {
  const a = p.archetype;
  if (a === 'setlist nerd') return 'setlist_careful';
  if (a === 'new-listener guide' || a === 'discovery connector') return 'discovery';
  if (a === 'deep-catalog fan') return 'catalog_deep';
  if (a === 'production/gear listener') return 'production';
  if (a === 'festival planner') return 'opener_watch';
  if (a === 'dance-floor energy reader') return 'subgenre';
  return 'doors_practical';
}

function localDateLabel(iso?: string): string {
  if (!iso) return '';
  return iso.slice(0, 10);
}

/** Extract doors label from claim WITHOUT truncating at first period (fixes "p." bug). */
export function doorsLabelFromClaim(claim: string): string | null {
  const m = claim.match(/Doors\s+(\d{1,2}:\d{2}\s*[ap]\.m\.)/i);
  return m?.[1] ?? null;
}

export function timeLabelFromIso(iso?: string): string | null {
  if (!iso || !iso.includes('T')) return null;
  const h = Number(iso.slice(11, 13));
  const min = Number(iso.slice(14, 16));
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return formatLocalTimeLabel(h, min);
}

function sentenceDoors(doors: string): string {
  return `Doors ${doors.replace(/\.$/, '')}.`;
}

function sceneLabel(genreId: string): string {
  switch (genreId) {
    case 'indie':
      return 'indie and alternative';
    case 'metal':
      return 'metal and punk';
    case 'hip-hop':
      return 'hip-hop';
    case 'edm':
      return 'electronic';
    case 'pop':
      return 'pop';
    default:
      return genreId.replace(/-/g, ' ');
  }
}

function pickVariant<T>(arr: T[], variant: number): T {
  return arr[variant % arr.length]!;
}

export function buildGroundedConversation(options: {
  plan: ConversationPlanDraft;
  event: GroundedFact;
  personas: AiGuidePersona[];
  setlist?: GroundedFact | null;
  conversationId: string;
  variant?: number;
}): GeneratedConversation {
  const { plan, event, personas, setlist, variant = 0 } = options;
  const artist = event.artistName;
  const venue = event.venueName;
  const city = event.city;
  if (!artist || !venue || !event.eventId || !event.sourceUrl || !event.occurredAt) {
    return { messages: [] };
  }

  const uniquePersonas = [...new Map(personas.map((p) => [p.id, p])).values()];
  if (uniquePersonas.length < 2) return { messages: [] };

  const p0 = uniquePersonas[0]!;
  const p1 = uniquePersonas[1]!;
  const p2 = uniquePersonas[2] ?? p0;

  const date = localDateLabel(event.occurredAt);
  const doors = doorsLabelFromClaim(event.claim);
  const startLabel = timeLabelFromIso(event.occurredAt);
  const scene = sceneLabel(plan.genreId);
  const max = Math.min(Math.max(plan.maxMessages, 3), 5);

  const speakers = [p0, p1, p2, p1, p0];
  const contributions: ContributionType[] = [
    'grounded_fact',
    'specific_reaction',
    'reasoned_disagreement',
    'focused_question',
    'useful_context',
  ];

  const messages: GeneratedGuideMessage[] = [];
  for (let i = 0; i < max; i++) {
    const persona = speakers[i]!;
    const contribution = contributions[i]!;
    const text = buildTurnText({
      turn: i + 1,
      contribution,
      lens: lensForPersona(persona),
      artist,
      venue,
      city,
      date,
      doors,
      startLabel,
      scene,
      setlist: setlist ?? null,
      objective: plan.objective,
      variant: variant + i * 7 + persona.displayName.length,
      parentText: messages[i - 1]?.text,
    });
    if (!text) return { messages: [] };

    const derived = classifyIntent(text, i > 0);
    messages.push({
      personaId: persona.id,
      text,
      replyToDraftIndex: i > 0 ? i - 1 : undefined,
      citedFactIds: setlist && i === 0 && plan.objective === 'compare_setlists'
        ? [event.id, setlist.id]
        : [event.id],
      containsSetlistSpoiler: Boolean(
        setlist && plan.objective === 'compare_setlists' && i === 0,
      ),
      intent: derived.primary,
      confidence: derived.confidence,
      authorType: AUTHOR_TYPE_AI,
      disclosureLabel: DISCLOSURE_LABEL,
    });
  }

  return { messages };
}

function buildTurnText(ctx: {
  turn: number;
  contribution: ContributionType;
  lens: VoiceLens;
  artist: string;
  venue: string;
  city?: string;
  date: string;
  doors: string | null;
  startLabel: string | null;
  scene: string;
  setlist: GroundedFact | null;
  objective: ConversationPlanDraft['objective'];
  variant: number;
  parentText?: string;
}): string {
  const { artist, venue, city, date, doors, startLabel, scene, turn, lens, variant } = ctx;
  const cityBit = city ? ` in ${city}` : '';

  if (turn === 1) {
    if (ctx.objective === 'compare_setlists' && ctx.setlist) {
      return pickVariant(
        [
          `Confirmed setlist for ${artist} at ${venue} includes an encore. Keep song titles behind spoiler view.`,
          `${artist} at ${venue}: the setlist record marks encore tracks. Open spoiler before reading titles.`,
          `Setlist for ${artist} at ${venue} is confirmed in the source. Spoiler control first.`,
        ],
        variant,
      );
    }
    if (doors) {
      const d = doors.replace(/\.$/, '');
      return pickVariant(
        [
          `JamBase lists ${artist} at ${venue}${cityBit} on ${date}. ${sentenceDoors(doors)}`,
          `On ${date}, JamBase has ${artist} at ${venue}${cityBit}, doors ${d}.`,
          `${artist} is on JamBase for ${venue}${cityBit} on ${date} with doors ${d}.`,
          `JamBase: ${artist} / ${venue} / ${date}. ${sentenceDoors(doors)}`,
          `${venue} hosts ${artist}${cityBit} on ${date} per JamBase, doors ${d}.`,
          `Upcoming on JamBase: ${artist} at ${venue} (${date}), doors ${d}.`,
          `Door time ${d} for ${artist} at ${venue} on ${date} comes from JamBase.`,
          `JamBase date for ${artist} is ${date} at ${venue}${cityBit}. Doors ${d}.`,
          `${artist} lands at ${venue} on ${date}. JamBase lists doors ${d}.`,
          `From JamBase, ${artist} plays ${venue}${cityBit} on ${date}; doors ${d}.`,
          `${date} brings ${artist} to ${venue}. JamBase shows doors ${d}.`,
          `Listing check: ${artist}, ${venue}, ${date}, doors ${d} on JamBase.`,
          `JamBase put ${artist} at ${venue}${cityBit} for ${date} with doors ${d}.`,
          `${artist} / ${date} / ${venue}: JamBase doors read ${d}.`,
          `According to JamBase, ${artist} is at ${venue} on ${date}. Doors ${d}.`,
        ],
        variant,
      );
    }
    if (startLabel) {
      return pickVariant(
        [
          `JamBase lists ${artist} at ${venue}${cityBit} on ${date} at ${startLabel}.`,
          `On ${date} at ${startLabel}, JamBase has ${artist} at ${venue}${cityBit}.`,
          `${artist} hits ${venue}${cityBit} on ${date} at ${startLabel} per JamBase.`,
          `${venue} gets ${artist} on ${date} at ${startLabel} according to JamBase.`,
          `JamBase start time for ${artist} at ${venue} is ${startLabel} on ${date}.`,
          `${artist} at ${venue}${cityBit}: ${date}, ${startLabel} on JamBase.`,
          `Marked on JamBase for ${date}: ${artist} at ${venue}, ${startLabel}.`,
          `${startLabel} on ${date} is the JamBase start for ${artist} at ${venue}.`,
        ],
        variant,
      );
    }
    return pickVariant(
      [
        `JamBase lists ${artist} at ${venue}${cityBit} on ${date}. The start time is not listed.`,
        `On ${date}, JamBase has ${artist} at ${venue}${cityBit}. Start time is not listed.`,
        `${artist} is on the JamBase calendar for ${venue} on ${date} without a door time.`,
        `${venue} shows ${artist} on ${date} in JamBase, but no door time is listed.`,
        `JamBase has the ${artist} date at ${venue} (${date}) with no start time field.`,
        `${artist} / ${venue} / ${date} is on JamBase. Start time is not listed.`,
        `No door time yet on the JamBase row for ${artist} at ${venue} on ${date}.`,
        `JamBase confirms ${artist} at ${venue}${cityBit} on ${date}; start time blank.`,
      ],
      variant,
    );
  }

  // Later turns: many distinct structures (entity substitution alone is not originality)
  if (lens === 'catalog_deep') {
    const pool = [
      `For ${artist}, I would rather hear an earlier LP cut than the streaming single at ${venue}.`,
      `${artist} deep cuts fit ${venue} better than the current single.`,
      `At ${venue}, I pick ${artist} album tracks over the radio edit.`,
      `Disagree on the single for ${artist}. An earlier album track carries more at ${venue}.`,
      `Counterpoint on ${artist}: the older LP cut beats the new single in that room.`,
      `I still take earlier ${artist} material over the hit at ${venue}.`,
      `Which ${artist} deep cut would you put early at ${venue}?`,
      `For ${artist} at ${venue}, which older track belongs in the first half?`,
      `Name one ${artist} deep cut that fits ${venue} better than the single.`,
      `On ${artist}, the catalog angle feels stronger than chasing the single at ${venue}.`,
      `${artist} at ${venue} keeps pointing me back to the earlier records.`,
      `Skip the ${artist} single at ${venue}. Start with a B-side or album cut.`,
      `If ${artist} opens with the hit at ${venue}, I hope a deep cut follows soon.`,
      `The ${artist} studio single is fine, but ${venue} calls for something denser.`,
      `I measure ${artist} at ${venue} by how many deep cuts land before the encore.`,
    ];
    return pickVariant(pool, variant);
  }

  if (lens === 'production') {
    const pool = [
      `I would take the later ${artist} slot for lighting at ${venue}.`,
      `For ${artist}, lighting on soft songs at ${venue} matters more than early entry.`,
      `Later set for ${artist} at ${venue} if the lighting cue is the priority.`,
      `Disagree on early arrival for ${artist}. Production detail at ${venue} shows more later.`,
      `I would trade rail space at ${venue} for a fuller lighting look on ${artist}.`,
      `For ${artist} at ${venue}, does lighting or mix matter more on the soft songs?`,
      `On ${artist}, which production detail at ${venue} do you watch first?`,
      `${artist} mixes often hide detail until ${venue} goes darker.`,
      `Watch the low end on ${artist} at ${venue} before judging the set.`,
      `I care more about ${artist} dynamics at ${venue} than about how loud the drop is.`,
      `If ${venue} washes ${artist} in bright light, the quieter songs lose shape.`,
      `For ${artist}, I listen for vocal space at ${venue} more than for crowd volume.`,
    ];
    return pickVariant(pool, variant);
  }

  if (lens === 'discovery') {
    const pool = [
      `If ${artist} is new before ${venue}, which recent live cut would you start with?`,
      `New to ${artist}? Which live cut beats the studio album ahead of ${venue}?`,
      `For first-time ${artist} listeners before ${venue}, live cut or latest LP?`,
      `On ${artist}, I would compare one live cut to the studio version before ${venue}.`,
      `Useful ${artist} entry before ${venue}: one live take, then the studio record.`,
      `For ${artist} newcomers heading toward ${venue}, start live, then studio.`,
      `What is the shortest ${artist} track you would send someone before ${venue}?`,
      `Before ${venue}, I would skip ${artist} compilations and pick one album side.`,
      `If someone only knows one ${artist} song, which cut prepares them for ${venue}?`,
      `${artist} clickbait rankings do not help. Pick one record before ${venue}.`,
    ];
    return pickVariant(pool, variant);
  }

  if (lens === 'opener_watch') {
    const pool = [
      `For ${artist} at ${venue}, I would rather catch support than arrive mid-headliner.`,
      `${artist} at ${venue}: opener quality changes whether early arrival is worth it.`,
      `Support billing for ${artist} at ${venue} is the next detail I would check.`,
      `On ${artist}, do you prioritize openers at ${venue} or just the headliner block?`,
      `I show up early for ${artist} only when ${venue} lists a support act I already follow.`,
      `If ${artist} has a local opener at ${venue}, that changes my arrival plan.`,
      `Skip the lobby hang for ${artist} at ${venue} if the opener is strong.`,
      `Who is opening for ${artist} at ${venue}, and is that enough reason to go early?`,
    ];
    return pickVariant(pool, variant);
  }

  if (lens === 'setlist_careful') {
    const pool = [
      `Until a confirmed setlist appears for ${artist}, treat song requests as predictions only.`,
      `No confirmed setlist for ${artist} at ${venue} yet. Keep encore guesses labeled prediction.`,
      `Song titles for ${artist} stay prediction-level without a setlist source.`,
      `For ${artist} at ${venue}, I would not treat fan set guesses as confirmed.`,
      `I ignore ${artist} setlist screenshots until a reliable source backs ${venue}.`,
      `Prediction only for ${artist} at ${venue}: no contracted setlist field yet.`,
      `If ${artist} rotates deep cuts, ${venue} set guesses are weak without a source.`,
      `Hold encore talk for ${artist} until something stronger than a forum guess appears.`,
    ];
    return pickVariant(pool, variant);
  }

  if (lens === 'subgenre') {
    const pool = [
      `${artist} at ${venue} reads more club-set than arena staging for this ${scene} crowd.`,
      `Within ${scene}, ${artist} at ${venue} leans dance-floor pacing over ballad stacks.`,
      `${venue} plus ${artist} suggests ${scene} club energy rather than seated staging.`,
      `On ${artist}, does ${venue} feel club-set or bigger-room ${scene} to you?`,
      `I slot ${artist} at ${venue} closer to ${scene} club nights than festival midday sets.`,
      `For ${scene} fans, ${artist} at ${venue} is a pace test more than a hits parade.`,
      `${artist} can go soft or hard. ${venue} usually pulls the ${scene} side forward.`,
      `Is ${artist} at ${venue} a ${scene} dance night or a listen-close night for you?`,
    ];
    return pickVariant(pool, variant);
  }

  // doors_practical default — many structures
  const practical = [
    doors
      ? `Doors ${doors} for ${artist} at ${venue} leaves room for a long opener set.`
      : null,
    doors ? `With doors ${doors} on the ${artist} listing, plan buffer before ${venue}.` : null,
    doors ? `${doors} doors for ${artist} at ${venue} is the practical detail to re-check.` : null,
    `${artist} at ${venue} on ${date} is the concrete listing. Which catalog era fits that room?`,
    `Given ${artist} at ${venue}, which era of the catalog matches that room size?`,
    `The ${date} ${artist} date at ${venue} is clear. Catalog era is the open question.`,
    `On ${artist} at ${venue}, the JamBase date is the listing I would share.`,
    `Does ${artist} at ${venue} on ${date} look like an early or late night for you?`,
    `I treat the ${artist} ${venue} date as locked only after the JamBase row matches.`,
    `For ${artist}, the ${date} ${venue} listing is enough to start planning around.`,
    `Is ${artist} at ${venue} a must on ${date}, or wait for another stop?`,
    `The ${artist} billing at ${venue} on ${date} is the part I would screenshot carefully.`,
  ].filter(Boolean) as string[];
  return pickVariant(practical, variant);
}
