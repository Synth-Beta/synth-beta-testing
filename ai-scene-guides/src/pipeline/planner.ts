import { createHash, randomUUID } from 'crypto';
import type {
  AiGuidePersona,
  ConversationPlanDraft,
  GroundedFact,
  Objective,
  SceneGuidesRuntimeSettings,
} from '../types.js';
import { ConversationPlanDraftSchema } from '../types.js';

export type TriggerType =
  | 'T-7d'
  | 'T-48h'
  | 'T-24h'
  | 'T-2h'
  | 'T+30m'
  | 'T+12h'
  | 'T+36h'
  | 'release'
  | 'tour_announce';

function isFresh(fact: GroundedFact, now: Date, freshnessHours: number): boolean {
  const expires = Date.parse(fact.expiresAt);
  const retrieved = Date.parse(fact.retrievedAt);
  if (!Number.isFinite(expires) || expires < now.getTime()) return false;
  const ageH = (now.getTime() - retrieved) / 3600_000;
  return ageH <= freshnessHours;
}

function hasReliableSetlist(facts: GroundedFact[], settings: SceneGuidesRuntimeSettings): boolean {
  if (!settings.setlistGenerationEnabled) {
    // Fixture segment setlists only when settings explicitly allow OR fact is fixture with high confidence
    return facts.some(
      (f) =>
        f.kind === 'setlist' &&
        f.dataSegment === 'fixture' &&
        f.confidence >= settings.confidenceThreshold &&
        Date.parse(f.expiresAt) > Date.now(),
    );
  }
  return facts.some((f) => f.kind === 'setlist' && f.confidence >= settings.confidenceThreshold);
}

function pickObjective(
  trigger: TriggerType,
  facts: GroundedFact[],
  settings: SceneGuidesRuntimeSettings,
): Objective | null {
  const hasEvent = facts.some((f) => f.kind === 'event');
  if (!hasEvent && !facts.some((f) => f.kind === 'topic_signal')) return null;

  if (trigger === 'T+30m' || trigger === 'T+12h' || trigger === 'T+36h') {
    if (!hasReliableSetlist(facts, settings)) {
      if (trigger === 'T+30m') return null;
      return 'invite_attendee_context';
    }
    return trigger === 'T+36h' ? 'support_discovery' : 'compare_setlists';
  }
  if (trigger === 'T-48h' || trigger === 'T-2h') return 'practical_event_help';
  if (trigger === 'T-24h') return 'support_discovery';
  return 'inform';
}

export function planConversation(options: {
  roomId: string;
  genreId: string;
  triggerType: TriggerType;
  facts: GroundedFact[];
  personas: AiGuidePersona[];
  settings: SceneGuidesRuntimeSettings;
  recentHumanTexts?: string[];
  now?: Date;
}): ConversationPlanDraft | null {
  const {
    roomId,
    genreId,
    triggerType,
    facts,
    personas,
    settings,
    recentHumanTexts = [],
    now = new Date(),
  } = options;

  if (settings.perRoomEnabled[roomId] === false) return null;
  if (settings.perGenreEnabled[genreId] === false) return null;

  const fresh = facts.filter(
    (f) =>
      isFresh(f, now, settings.freshnessHours) &&
      f.confidence >= settings.confidenceThreshold,
  );
  if (fresh.length === 0) return null;

  // Drop if humans already covering same artist/venue names
  const humanBlob = recentHumanTexts.join(' ').toLowerCase();
  const covered = fresh.every((f) => {
    const keys = [f.artistName, f.venueName].filter(Boolean).map((s) => s!.toLowerCase());
    return keys.length > 0 && keys.every((k) => humanBlob.includes(k));
  });
  if (covered && humanBlob.length > 40) return null;

  const objective = pickObjective(triggerType, fresh, settings);
  if (!objective) return null;

  if (objective === 'compare_setlists' && !hasReliableSetlist(fresh, settings)) {
    return null;
  }

  const factIds = fresh.slice(0, 6).map((f) => f.id);
  const distinct = personas.slice(0, Math.min(3, personas.length));
  if (distinct.length === 0) return null;

  const spoilerMode = objective === 'compare_setlists';
  const maxMessages = Math.min(settings.maxBotChainLength, spoilerMode ? 3 : 4);
  const spacingSeconds = Array.from({ length: maxMessages }, (_, i) =>
    i === 0 ? 0 : settings.consecutiveDelaySeconds * i,
  );

  const draft: ConversationPlanDraft = {
    roomId,
    genreId,
    triggerType,
    objective,
    factIds,
    personaIds: distinct.map((p) => p.id),
    maxMessages,
    spacingSeconds,
    spoilerMode,
    expiresAt: new Date(now.getTime() + 6 * 3600_000).toISOString(),
    whyGenerated: `${triggerType} plan for ${genreId} using ${factIds.length} grounded facts (${fresh[0]?.dataSegment ?? 'live'})`,
    dataSegment: fresh[0]?.dataSegment ?? 'live',
  };

  return ConversationPlanDraftSchema.parse(draft);
}

export function planIdFromDraft(draft: ConversationPlanDraft): string {
  const h = createHash('sha256')
    .update(
      JSON.stringify({
        roomId: draft.roomId,
        triggerType: draft.triggerType,
        factIds: draft.factIds,
        objective: draft.objective,
      }),
    )
    .digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-b${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export function newPlanId(): string {
  return randomUUID();
}
