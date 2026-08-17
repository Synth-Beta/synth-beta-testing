import { FixtureSourceAdapter } from '../adapters/fixture.js';
import { gatherFacts } from '../adapters/index.js';
import { FIXTURE_ROOM_HINTS } from '../fixtures/packs.js';
import { loadEnvSettings } from '../config.js';
import { seedPersonas } from '../seed/personas.js';
import { selectDailyPersonas } from './scheduler.js';
import { newPlanId, planConversation, type TriggerType } from './planner.js';
import { generateConversation } from './generator.js';
import { verifyConversation } from './verifier.js';
import {
  ForbiddenSynthMessageWriter,
  applyHumanInterruption,
  buildCandidates,
  evaluatePublish,
} from './publisher.js';
import type {
  ConversationPlanRecord,
  SceneGuidesRuntimeSettings,
  SimulatedRoomState,
} from '../types.js';
import { DEFAULT_SETTINGS } from '../types.js';

export interface RunPipelineOptions {
  fixtureScenario: string;
  settings?: Partial<SceneGuidesRuntimeSettings>;
  seed?: number;
  simulateHuman?: boolean;
  now?: Date;
}

export async function runFixturePipeline(
  options: RunPipelineOptions,
): Promise<ConversationPlanRecord> {
  const settings: SceneGuidesRuntimeSettings = {
    ...DEFAULT_SETTINGS,
    ...loadEnvSettings(),
    ...options.settings,
    mode: 'fixture',
    dryRun: true,
    // Fixture setlists allowed when scenario includes them
    setlistGenerationEnabled: false,
  };

  const hint = FIXTURE_ROOM_HINTS[options.fixtureScenario];
  if (!hint) throw new Error(`Unknown fixture: ${options.fixtureScenario}`);

  const adapter = new FixtureSourceAdapter(options.fixtureScenario);
  let facts = await gatherFacts([adapter], {
    genreId: hint.genreId,
    includeSetlists: true,
  });
  // Ensure setlist fixtures load even when no artist filter was provided
  if (adapter.fetchRecentSetlists) {
    const eventArtist = facts.find((f) => f.kind === 'event')?.artistName;
    const setlists = await adapter.fetchRecentSetlists({
      artistName: eventArtist || '',
    });
    const seen = new Set(facts.map((f) => f.provenanceKey));
    for (const s of setlists) {
      if (!seen.has(s.provenanceKey)) facts.push(s);
    }
  }

  const { personas } = seedPersonas({
    genreId: hint.genreId,
    count: 75,
    seed: options.seed ?? 42,
  });
  const daily = selectDailyPersonas({
    catalog: personas,
    settings: {
      ...settings,
      // Avoid quiet-hours empty selection in dry-run
      quietHours: { startHour: 3, endHour: 4 },
    },
    now: options.now ?? new Date('2026-08-06T15:00:00.000Z'),
  });

  const trigger = (hint.triggerHint ?? 'T-7d') as TriggerType;
  const recentHumanTexts = hint.humansActive
    ? [
        'Anyone else going to Deafheaven?',
        'Black Cat rules for this one',
        'Setlist predictions?',
      ]
    : [];

  const draft = planConversation({
    roomId: hint.roomId,
    genreId: hint.genreId,
    triggerType: trigger,
    facts,
    personas: daily,
    settings: {
      ...settings,
      // Allow fixture setlist objective when setlist facts present
      setlistGenerationEnabled: facts.some((f) => f.kind === 'setlist' && f.dataSegment === 'fixture'),
    },
    recentHumanTexts,
    now: options.now ?? new Date('2026-08-06T15:00:00.000Z'),
  });

  if (!draft) {
    return {
      id: newPlanId(),
      draft: {
        roomId: hint.roomId,
        genreId: hint.genreId,
        triggerType: trigger,
        objective: 'inform',
        factIds: facts.slice(0, 1).map((f) => f.id),
        personaIds: daily.slice(0, 1).map((p) => p.id),
        maxMessages: 1,
        spacingSeconds: [0],
        spoilerMode: false,
        expiresAt: new Date(Date.now() + 3600_000).toISOString(),
        whyGenerated: 'No plan — dropped by planner',
        dataSegment: 'fixture',
      },
      status: 'suppressed',
      candidates: [],
    };
  }

  const planId = newPlanId();
  const generated = await generateConversation({
    plan: draft,
    facts,
    personas: daily,
    useHeuristicIfNoKey: true,
  });

  const verifiers = verifyConversation({
    messages: generated.messages,
    facts,
    setlistGenerationEnabled: draft.objective === 'compare_setlists',
    now: options.now ?? new Date('2026-08-06T15:00:00.000Z'),
  });

  const room: SimulatedRoomState = {
    roomId: hint.roomId,
    genreId: hint.genreId,
    timezone: 'America/New_York',
    aiMessagesLast24h: 0,
    consecutiveAiCount: 0,
    recentMessageTexts: recentHumanTexts,
    muteAiGuides: false,
    roomEnabled: true,
    lastHumanAt: hint.humansActive
      ? (options.now ?? new Date('2026-08-06T15:00:00.000Z')).toISOString()
      : undefined,
  };

  // Ensure writer cannot touch Synth messages
  const writer = new ForbiddenSynthMessageWriter();
  void writer;

  let decisions = generated.messages.map((message, draftIndex) =>
    evaluatePublish({
      settings: { ...settings, enabled: true },
      plan: draft,
      planId,
      planStatus: 'verified',
      message,
      draftIndex,
      verifier: verifiers[draftIndex]!,
      room,
      facts,
      now: options.now ?? new Date('2026-08-06T18:00:00.000Z'),
    }),
  );

  let candidates = buildCandidates({
    planId,
    plan: draft,
    messages: generated.messages,
    verifiers,
    decisions,
    now: options.now ?? new Date('2026-08-06T18:00:00.000Z'),
  });

  let simulatedHumanAt: string | undefined;
  if (options.simulateHuman || hint.humansActive) {
    simulatedHumanAt = (options.now ?? new Date('2026-08-06T18:05:00.000Z')).toISOString();
    candidates = applyHumanInterruption(candidates, { allowOneHelpful: false });
  }

  return {
    id: planId,
    draft,
    status: candidates.some((c) => c.publisherDecision === 'would_publish')
      ? 'reviewable'
      : 'suppressed',
    candidates,
    simulatedHumanAt,
  };
}
