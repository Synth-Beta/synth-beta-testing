/**
 * Human-conversation contribution generator (update(1).md).
 * One message at a time. Entity decay. No JamBase in copy. Answer-first replies.
 */

import {
  AUTHOR_TYPE_AI,
  DISCLOSURE_LABEL,
  type AiGuidePersona,
  type GeneratedGuideMessage,
  type GroundedFact,
} from '../types.js';
import { classifyIntent, formatLocalTimeLabel, wordCount } from './writingGuide.js';

export type ContributionType =
  | 'fact'
  | 'answer'
  | 'reaction'
  | 'preference'
  | 'disagreement'
  | 'joke'
  | 'question'
  | 'list_item';

export type EpisodeShape = 'standalone' | 'one_reply' | 'two_replies';

type VoiceLens =
  | 'doors'
  | 'catalog'
  | 'opener'
  | 'production'
  | 'discovery'
  | 'energy'
  | 'setlist';

function lens(p: AiGuidePersona): VoiceLens {
  const a = p.archetype;
  if (a === 'setlist nerd') return 'setlist';
  if (a === 'new-listener guide' || a === 'discovery connector') return 'discovery';
  if (a === 'deep-catalog fan') return 'catalog';
  if (a === 'production/gear listener') return 'production';
  if (a === 'festival planner') return 'opener';
  if (a === 'dance-floor energy reader') return 'energy';
  return 'doors';
}

function pick<T>(arr: T[], v: number): T {
  return arr[v % arr.length]!;
}

function doorsLabel(claim: string): string | null {
  const m = claim.match(/Doors\s+(\d{1,2}:\d{2}\s*[ap]\.m\.)/i);
  // Keep the trailing period on "p.m." — stripping it yields "p.m" and fails time validation.
  return m?.[1] ?? null;
}

function timeLabel(iso?: string): string | null {
  if (!iso?.includes('T')) return null;
  return formatLocalTimeLabel(Number(iso.slice(11, 13)), Number(iso.slice(14, 16)));
}

function dateLabel(iso?: string): string {
  return iso?.slice(0, 10) ?? '';
}

function end(s: string): string {
  return /[.!?]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`;
}

function hasQuestion(text: string): boolean {
  return text.includes('?');
}

function parentAsk(parent: string): string {
  const t = parent.trim();
  if (/opener or headliner/i.test(t)) return 'opener_headliner';
  if (/live cut|start with|which (track|cut|song)/i.test(t)) return 'track';
  if (/catalog era|which era/i.test(t)) return 'era';
  if (/lighting or mix|production/i.test(t)) return 'production';
  if (/early or late/i.test(t)) return 'timing';
  if (/doors|door time/i.test(t)) return 'doors';
  if (/\?/.test(t)) return 'generic';
  return 'none';
}

export function pickEpisodeShape(rng: () => number): EpisodeShape {
  const r = rng();
  if (r < 0.6) return 'standalone';
  if (r < 0.9) return 'one_reply';
  return 'two_replies';
}

export function buildOpener(options: {
  event: GroundedFact;
  persona: AiGuidePersona;
  variant: number;
}): GeneratedGuideMessage | null {
  const { event, persona, variant } = options;
  const artist = event.artistName;
  const venue = event.venueName;
  if (!artist || !venue || !event.eventId) return null;

  const doors = doorsLabel(event.claim);
  const start = timeLabel(event.occurredAt);
  const date = dateLabel(event.occurredAt);
  const v = lens(persona);
  const energy = (persona.voiceTraits as { enthusiastic?: boolean })?.enthusiastic;
  const city = event.city?.split(',')[0]?.trim() ?? '';

  const texts: string[] = [];

  // Prefer 8–20 word openers; keep a few shorter ones for asymmetry
  if (doors) {
    texts.push(
      end(`${artist} at ${venue} on ${date}. Doors are ${doors}`),
      end(`Doors are ${doors} for ${artist} that night at ${venue}`),
      end(`${artist} lands at ${venue} on ${date}, with doors at ${doors}`),
      end(`For ${artist} on ${date}, doors are listed at ${doors}`),
    );
  }
  if (start) {
    texts.push(
      end(`${artist} at ${venue} on ${date}, starting at ${start}`),
      end(`${start} start time for ${artist} on ${date}`),
      end(`${artist} is on at ${start} on ${date} at ${venue}`),
    );
  }
  texts.push(
    end(`${artist} plays ${venue} on ${date}`),
    end(`${venue} gets ${artist} on ${date}`),
  );
  if (city) {
    texts.push(end(`${artist} hits ${city} on ${date} at ${venue}`));
  }
  // Occasional short opener (~Reddit asymmetry)
  if (variant % 7 === 0) {
    texts.push(end(`${artist} on ${date}`), end(`${artist} that week`));
  }

  if (v === 'catalog') {
    texts.push(
      end(`I'd rather hear deep cuts from ${artist} than the single that night`),
      end(`For ${artist}, I'd take an album cut over the radio edit`),
      end(`Not the singles era of ${artist} for me. Earlier stuff`),
      end(`For ${artist} on ${date}, I'd skip the streaming single`),
    );
  } else if (v === 'opener') {
    texts.push(
      end(`For ${artist}, the opener is honestly the interesting part`),
      end(`I'd show early for ${artist} only if support looks good`),
      end(`Opener quality is what decides ${artist} nights for me`),
      end(`For ${artist} on ${date}, support is the interesting part`),
    );
  } else if (v === 'production') {
    texts.push(
      end(`I'd take the later slot for ${artist}. Lighting matters more to me`),
      end(`For ${artist}, I care more about the mix than the drop`),
      end(`Production-first take on ${artist} that night for me`),
    );
  } else if (v === 'discovery') {
    texts.push(
      end(`If ${artist} is new to you, start with a live cut`),
      end(`For ${artist}: live take first, then the studio record`),
      end(`New to ${artist}? One live clip is enough to decide`),
    );
  } else if (v === 'energy') {
    texts.push(
      end(`${artist} that night is a pace test more than a hits parade`),
      end(`Club-set energy from ${artist} beats a seated night for me`),
      end(`${artist} on ${date} reads more dance-floor than theater to me`),
    );
  } else if (v === 'setlist') {
    texts.push(
      end(`No confirmed setlist for ${artist} yet. Treat song guesses as predictions`),
      end(`I'd wait on ${artist} encore talk until there's a real setlist`),
      end(`Setlist rumors for ${artist} on ${date} aren't facts yet`),
    );
  } else {
    texts.push(
      end(
        doors
          ? `Timing note for ${artist} on ${date}: doors ${doors}`
          : `Worth marking ${artist} on ${date} if you're planning around it`,
      ),
    );
  }

  if (energy) {
    texts.push(end(`${artist} that week. I'm looking forward to it`));
  }

  // Occasional short question openers (keep rare)
  if (variant % 11 === 0) {
    texts.push(`Opener or headliner for ${artist}?`, `Which recent live cut for ${artist}?`);
  }

  const long = texts.filter((t) => wordCount(t) >= 8);
  const brief = texts.filter((t) => wordCount(t) < 8);
  // ~12% brief openers; otherwise prefer 8+ words
  const openerPool =
    variant % 8 === 0 && brief.length ? brief : long.length ? long : texts;
  const text = pick(openerPool, variant + persona.displayName.length);
  const derived = classifyIntent(text, false);
  return {
    personaId: persona.id,
    text,
    citedFactIds: [event.id],
    containsSetlistSpoiler: false,
    intent: derived.primary,
    confidence: derived.confidence,
    authorType: AUTHOR_TYPE_AI,
    disclosureLabel: DISCLOSURE_LABEL,
  };
}

export function buildReply(options: {
  event: GroundedFact;
  persona: AiGuidePersona;
  parentText: string;
  variant: number;
}): GeneratedGuideMessage | null {
  const { event, persona, parentText, variant } = options;
  const ask = parentAsk(parentText);
  const v = lens(persona);
  const doors = doorsLabel(event.claim);
  const date = dateLabel(event.occurredAt);
  const salt = variant + persona.displayName.length;

  if (ask !== 'none') {
    const answers = answerBank(ask, doors, v);
    if (!answers.length) return null;
    const text = pick(answers, salt);
    return msg(persona.id, text, event.id, true);
  }

  const short: string[] = [];
  const medium: string[] = [];

  if (v === 'catalog') {
    short.push(`I'd go album cut.`, `Album cut. Easy.`, `Not the single.`, `Not that era.`);
    medium.push(
      `Earlier LP stuff hits harder than the streaming single for me.`,
      `I'd take a deep cut over the radio edit on that bill.`,
      `I don't hear the single as the real live moment here.`,
      `I'd skip the hit and stay on the album side instead.`,
    );
  } else if (v === 'opener') {
    short.push(`Honestly, the opener.`, `Support first.`, `I'd rather catch support.`);
    medium.push(
      `The opener is honestly the interesting part of that bill.`,
      `I'd show early only if the support bill looks good.`,
      `Headliner block alone isn't enough to pull me in.`,
      `I'd flip it and catch the headliner only if I'm late.`,
    );
  } else if (v === 'production') {
    short.push(`Later set. Lighting.`, `Lighting, yeah.`, `Dynamics > drop.`);
    medium.push(
      `I'd rather hear the mix than chase the spectacle.`,
      `I'd take the darker room over a bright wash any night.`,
      `Not for me if it's all drop and no dynamics.`,
      `I'd take the mix over the lights on that one.`,
    );
  } else if (v === 'discovery') {
    short.push(`Live cut first.`, `Start live, then studio.`);
    medium.push(
      `One live take is usually enough for me to decide.`,
      `I'd skip the compilation and pick one LP side instead.`,
      `Studio record after one live clip is how I'd start.`,
      `Entry point is a live take, then the studio record.`,
    );
  } else if (v === 'energy') {
    short.push(`I'm in.`, `High pace.`, `Not for me.`);
    medium.push(
      `Club energy beats a seated night for me on that bill.`,
      `Reads like a pace test more than a hits parade.`,
      `I get the appeal, but it's not really for me.`,
      `That bill reads dance-floor more than theater to me.`,
    );
  } else if (v === 'setlist') {
    short.push(`Encore talk can wait.`, `Not a confirmed set.`);
    medium.push(
      `Treat it as a prediction until there's a real setlist.`,
      `I'd ignore the forum guesses until something solid lands.`,
      `Wait on the encore claims until a real source shows up.`,
    );
  } else {
    short.push(`Fair.`, `Yeah.`, `Works.`, `Noted.`);
    medium.push(
      `Doors matter more to me than the start-time rumor.`,
      `I'd re-check doors before committing to an arrival plan.`,
      `That timing actually works pretty well for me.`,
      `Not my first pick on the bill, but I get it.`,
      `Hard pass from me on the late slot that night.`,
    );
  }

  if (/\bsingle\b|radio\b|hit\b/i.test(parentText)) {
    short.push(`I'd skip the hit.`);
    medium.push(`Disagree on the single for that night.`);
  }
  if (/\bopener\b|support\b/i.test(parentText)) {
    short.push(`Same. Opener.`);
    medium.push(`I'd flip it: headliner if I'm late.`);
  }
  if (/\blighting\b|mix\b|production\b/i.test(parentText)) {
    short.push(`Lighting, yeah.`);
    medium.push(`I'd take mix over lights on that.`);
  }
  if (/\bdoors\b/i.test(parentText) && doors) {
    short.push(`Yeah, ${doors}.`);
    medium.push(`Plan around doors at ${doors}.`);
  }
  if (/\bdeep cut|album cut|live cut\b/i.test(parentText)) {
    short.push(`Same.`, `Album cut.`);
    medium.push(`Live cut for me on that one.`);
  }

  if (date && salt % 5 === 0) {
    medium.push(`That ${date} timing works for me.`);
  }

  const humor = (persona.voiceTraits as { dry?: boolean; enthusiastic?: boolean }) ?? {};
  if (humor.dry) short.push(`Sure.`, `If you say so.`);
  if (humor.enthusiastic) {
    short.push(`I'm in!`, `Let's go!`);
    medium.push(`That rules.`, `I'm into that take!`);
  }

  // Light date salt so medium replies stay unique across events
  if (date) {
    medium.push(
      `That ${date} timing actually works pretty well for me.`,
      `I'd plan around ${date} more than the rumor mill.`,
    );
  }

  // ~20% short fragments; otherwise medium
  let text =
    salt % 5 === 0
      ? pick(short.length ? short : medium, salt)
      : pick(medium.length ? medium : short, salt);
  if (
    event.artistName &&
    event.venueName &&
    text.includes(event.artistName) &&
    text.includes(event.venueName)
  ) {
    text = pick([`I'd go album cut.`, `Honestly, the opener.`, `Not for me.`], salt);
  }
  return msg(persona.id, text, event.id, true);
}

function answerBank(ask: string, doors: string | null, v: VoiceLens): string[] {
  switch (ask) {
    case 'opener_headliner':
      return [
        `Opener. Their new record is the interesting part of that bill.`,
        `Opener, for me.`,
        `Headliner if I'm late. Opener if I'm awake.`,
        `I'd take support.`,
        `Support first.`,
        `Opener.`,
      ];
    case 'track':
      return v === 'catalog'
        ? [`Album cut. Easy.`, `Earlier LP track. Gets there faster.`, `Not the single. Deep cut.`]
        : [`A recent live cut.`, `Live take first.`, `Whatever's on the latest live clip.`];
    case 'era':
      return [`Earlier era.`, `Not the singles era.`, `Mid-catalog, for me.`];
    case 'production':
      return [`Lighting.`, `Mix.`, `Lighting over mix.`, `I'd take dynamics over spectacle.`];
    case 'timing':
      return [
        `Early.`,
        `Later.`,
        `Early if doors are real.`,
        doors ? `Depends. Doors ${doors} changes it.` : `Later, probably.`,
      ];
    case 'doors':
      return doors
        ? [`${doors}.`, `Doors ${doors}.`, `${doors}. Plan around that.`]
        : [`Not listed.`, `Start time isn't listed.`];
    case 'generic':
      return [`Album cut.`, `Opener.`, `Not for me, but I get it.`, `I'd go early.`, `Yeah.`];
    default:
      return [];
  }
}

function msg(
  personaId: string,
  text: string,
  eventId: string,
  isReply: boolean,
): GeneratedGuideMessage {
  const derived = classifyIntent(text, isReply);
  return {
    personaId,
    text,
    replyToDraftIndex: isReply ? 0 : undefined,
    citedFactIds: [eventId],
    containsSetlistSpoiler: false,
    intent: derived.primary,
    confidence: derived.confidence,
    authorType: AUTHOR_TYPE_AI,
    disclosureLabel: DISCLOSURE_LABEL,
  };
}

/** Build a small episode: 1, 2, or 3 messages (never 4+). */
export function buildEpisode(options: {
  event: GroundedFact;
  personas: AiGuidePersona[];
  shape: EpisodeShape;
  variant: number;
}): GeneratedGuideMessage[] {
  const { event, personas, shape, variant } = options;
  const unique = [...new Map(personas.map((p) => [p.id, p])).values()];
  if (!unique.length) return [];

  const p0 = unique[variant % unique.length]!;
  const opener = buildOpener({ event, persona: p0, variant });
  if (!opener) return [];

  if (shape === 'standalone') return [opener];

  const others = unique.filter((p) => p.id !== p0.id);
  if (!others.length) return [opener];

  const p1 = others[variant % others.length]!;
  const reply = buildReply({
    event,
    persona: p1,
    parentText: opener.text,
    variant: variant + 3,
  });
  if (!reply) return [opener];
  reply.replyToDraftIndex = 0;

  if (shape === 'one_reply') return [opener, reply];

  const p2 = others.find((p) => p.id !== p1.id) ?? p0;
  // If parent is a question, answer it; else react
  const parentForThird = hasQuestion(opener.text) && !hasQuestion(reply.text) ? opener.text : reply.text;
  const reply2 = buildReply({
    event,
    persona: p2,
    parentText: parentForThird,
    variant: variant + 7,
  });
  if (!reply2) return [opener, reply];
  reply2.replyToDraftIndex = parentForThird === opener.text ? 0 : 1;
  return [opener, reply, reply2];
}
