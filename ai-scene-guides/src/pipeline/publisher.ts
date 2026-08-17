import { createHash } from 'crypto';
import { canWriteToSynthMessages } from '../config.js';
import type {
  CandidateMessage,
  ConversationPlanDraft,
  GeneratedGuideMessage,
  GroundedFact,
  PublisherDecision,
  SceneGuidesRuntimeSettings,
  SimulatedRoomState,
  VerifierResult,
} from '../types.js';

export interface PublishAttemptResult {
  decision: PublisherDecision;
  reason?: string;
  /** Always false in fixture/shadow modes — no Synth messages insert. */
  wroteToSynthMessages: boolean;
}

export interface MessageWriter {
  insertAiMessage(input: {
    roomId: string;
    personaId: string;
    planId: string;
    text: string;
    citedFactIds: string[];
    containsSetlistSpoiler: boolean;
    authorType: 'ai_scene_guide';
  }): Promise<{ messageId: string }>;
}

/** Shadow/fixture writer that refuses Synth chat writes. */
export class ForbiddenSynthMessageWriter implements MessageWriter {
  async insertAiMessage(): Promise<{ messageId: string }> {
    throw new Error('Shadow/fixture mode cannot write to Synth chat messages');
  }
}

export function candidateId(planId: string, draftIndex: number, text: string): string {
  const h = createHash('sha256').update(`${planId}:${draftIndex}:${text}`).digest('hex');
  return `cand-${h.slice(0, 16)}`;
}

/**
 * Idempotent publisher checks. Re-evaluate before every scheduled message.
 */
export function evaluatePublish(options: {
  settings: SceneGuidesRuntimeSettings;
  plan: ConversationPlanDraft;
  planId: string;
  planStatus: string;
  message: GeneratedGuideMessage;
  draftIndex: number;
  verifier: VerifierResult;
  room: SimulatedRoomState;
  facts: GroundedFact[];
  now?: Date;
  aiReplyAlreadySentForHuman?: boolean;
}): PublishAttemptResult {
  const {
    settings,
    plan,
    planStatus,
    message,
    verifier,
    room,
    facts,
    now = new Date(),
    aiReplyAlreadySentForHuman = false,
  } = options;

  if (!settings.enabled && settings.mode !== 'fixture') {
    // Fixture dry-run still evaluates would_publish for review
    if (settings.mode !== 'fixture') {
      return { decision: 'suppressed', reason: 'global_kill_switch', wroteToSynthMessages: false };
    }
  }
  if (settings.mode !== 'fixture' && !settings.enabled) {
    return { decision: 'suppressed', reason: 'global_kill_switch', wroteToSynthMessages: false };
  }

  if (settings.perRoomEnabled[room.roomId] === false || !room.roomEnabled) {
    return { decision: 'suppressed', reason: 'room_disabled', wroteToSynthMessages: false };
  }
  if (room.muteAiGuides) {
    return { decision: 'suppressed', reason: 'mute_ai_guides', wroteToSynthMessages: false };
  }

  if (['paused', 'rejected', 'suppressed', 'completed'].includes(planStatus)) {
    return { decision: 'suppressed', reason: `plan_status_${planStatus}`, wroteToSynthMessages: false };
  }

  if (Date.parse(plan.expiresAt) < now.getTime()) {
    return { decision: 'suppressed', reason: 'plan_expired', wroteToSynthMessages: false };
  }

  if (!verifier.passed) {
    return {
      decision: 'rejected',
      reason: verifier.checks.find((c) => !c.ok)?.code ?? 'verifier_failed',
      wroteToSynthMessages: false,
    };
  }

  // Freshness re-check
  const byId = new Map(facts.map((f) => [f.id, f]));
  for (const id of message.citedFactIds) {
    const f = byId.get(id);
    if (!f || Date.parse(f.expiresAt) < now.getTime()) {
      return { decision: 'rejected', reason: 'stale_fact', wroteToSynthMessages: false };
    }
  }

  // Human interruption
  if (room.lastHumanAt && settings.pauseOnHumanActivity) {
    const humanAt = Date.parse(room.lastHumanAt);
    if (Number.isFinite(humanAt)) {
      if (aiReplyAlreadySentForHuman) {
        return {
          decision: 'suppressed',
          reason: 'human_entered_room_already_replied',
          wroteToSynthMessages: false,
        };
      }
      // Allow at most one high-confidence helpful reply
      if (message.confidence < 0.8 || message.intent === 'reaction') {
        return {
          decision: 'suppressed',
          reason: 'human_entered_room',
          wroteToSynthMessages: false,
        };
      }
    }
  }

  if (room.aiMessagesLast24h >= settings.maxAiMessagesPerRoomDay) {
    return { decision: 'suppressed', reason: 'daily_cap', wroteToSynthMessages: false };
  }

  if (room.consecutiveAiCount >= settings.maxBotChainLength) {
    return { decision: 'suppressed', reason: 'max_chain_length', wroteToSynthMessages: false };
  }

  if (
    room.consecutiveAiCount >= settings.maxConsecutiveAiWithoutDelay &&
    room.lastAiAt
  ) {
    const elapsed = now.getTime() - Date.parse(room.lastAiAt);
    if (elapsed < settings.consecutiveDelaySeconds * 1000) {
      return {
        decision: 'suppressed',
        reason: 'consecutive_delay',
        wroteToSynthMessages: false,
      };
    }
  }

  // Quiet hours
  const hour = now.getUTCHours(); // simplified; room TZ applied by caller on room state
  const { startHour, endHour } = settings.quietHours;
  const inQuiet =
    startHour < endHour
      ? hour >= startHour && hour < endHour
      : hour >= startHour || hour < endHour;
  if (inQuiet) {
    return { decision: 'suppressed', reason: 'quiet_hours', wroteToSynthMessages: false };
  }

  // Duplicate against recent room texts
  const norm = message.text.toLowerCase().trim();
  if (room.recentMessageTexts.some((t) => t.toLowerCase().trim() === norm)) {
    return { decision: 'suppressed', reason: 'duplicate', wroteToSynthMessages: false };
  }

  if (message.authorType !== 'ai_scene_guide') {
    return { decision: 'rejected', reason: 'missing_author_type', wroteToSynthMessages: false };
  }

  return { decision: 'would_publish', wroteToSynthMessages: false };
}

export async function publishCandidate(options: {
  settings: SceneGuidesRuntimeSettings;
  plan: ConversationPlanDraft;
  planId: string;
  planStatus: string;
  message: GeneratedGuideMessage;
  draftIndex: number;
  verifier: VerifierResult;
  room: SimulatedRoomState;
  facts: GroundedFact[];
  writer?: MessageWriter;
  now?: Date;
  aiReplyAlreadySentForHuman?: boolean;
}): Promise<PublishAttemptResult> {
  const result = evaluatePublish(options);

  if (result.decision !== 'would_publish') return result;

  if (!canWriteToSynthMessages(options.settings)) {
    return { decision: 'would_publish', wroteToSynthMessages: false };
  }

  if (!options.writer) {
    return {
      decision: 'rejected',
      reason: 'missing_writer',
      wroteToSynthMessages: false,
    };
  }

  await options.writer.insertAiMessage({
    roomId: options.plan.roomId,
    personaId: options.message.personaId,
    planId: options.planId,
    text: options.message.text,
    citedFactIds: options.message.citedFactIds,
    containsSetlistSpoiler: options.message.containsSetlistSpoiler,
    authorType: 'ai_scene_guide',
  });

  return { decision: 'published', wroteToSynthMessages: true };
}

export function buildCandidates(options: {
  planId: string;
  plan: ConversationPlanDraft;
  messages: GeneratedGuideMessage[];
  verifiers: VerifierResult[];
  decisions: PublishAttemptResult[];
  now?: Date;
}): CandidateMessage[] {
  const now = options.now ?? new Date();
  return options.messages.map((message, i) => {
    const spacing = options.plan.spacingSeconds[i] ?? i * 90;
    const decision = options.decisions[i]!;
    return {
      id: candidateId(options.planId, i, message.text),
      planId: options.planId,
      draftIndex: i,
      message,
      intendedPublishAt: new Date(now.getTime() + spacing * 1000).toISOString(),
      verifier: options.verifiers[i]!,
      publisherDecision: decision.decision,
      suppressionReason: decision.reason,
    };
  });
}

/**
 * Simulate human entering the room: cancel all pending bot-to-bot messages.
 */
export function applyHumanInterruption(
  candidates: CandidateMessage[],
  opts?: { allowOneHelpful?: boolean },
): CandidateMessage[] {
  let allowedOne = false;
  return candidates.map((c) => {
    if (c.publisherDecision !== 'would_publish') return c;
    if (
      opts?.allowOneHelpful &&
      !allowedOne &&
      c.message.confidence >= 0.8 &&
      (c.message.intent === 'fact' || c.message.intent === 'question')
    ) {
      allowedOne = true;
      return c;
    }
    return {
      ...c,
      publisherDecision: 'suppressed',
      suppressionReason: 'HUMAN ENTERED ROOM',
    };
  });
}
