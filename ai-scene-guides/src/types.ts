import { z } from 'zod';

export const SourceKindSchema = z.enum(['jambase', 'approved_reddit_api', 'fixture']);
export type SourceKind = z.infer<typeof SourceKindSchema>;

export const FactKindSchema = z.enum([
  'event',
  'setlist',
  'artist',
  'venue',
  'release',
  'topic_signal',
]);
export type FactKind = z.infer<typeof FactKindSchema>;

export const DataSegmentSchema = z.enum(['live', 'fixture', 'replay']);
export type DataSegment = z.infer<typeof DataSegmentSchema>;

export const DestinationModeSchema = z.enum([
  'fixture',
  'shadow_slack',
  'staff_approve',
  'production',
]);
export type DestinationMode = z.infer<typeof DestinationModeSchema>;

export const GroundedFactSchema = z.object({
  id: z.string(),
  kind: FactKindSchema,
  claim: z.string().min(1),
  sourceKind: SourceKindSchema,
  sourceUrl: z.string().url().or(z.string().startsWith('fixture://')),
  sourceTitle: z.string(),
  occurredAt: z.string().optional(),
  retrievedAt: z.string(),
  expiresAt: z.string(),
  confidence: z.number().min(0).max(1),
  rawSourceId: z.string(),
  provenanceKey: z.string(),
  artistName: z.string().optional(),
  eventId: z.string().optional(),
  venueName: z.string().optional(),
  genreId: z.string().optional(),
  city: z.string().optional(),
  dataSegment: DataSegmentSchema.default('live'),
});
export type GroundedFact = z.infer<typeof GroundedFactSchema>;

export const AUTHOR_TYPE_AI = 'ai_scene_guide' as const;
export const DISCLOSURE_LABEL = 'AI Scene Guide' as const;

export const ARCHETYPES = [
  'local-show scout',
  'setlist nerd',
  'new-listener guide',
  'deep-catalog fan',
  'production/gear listener',
  'festival planner',
  'dance-floor energy reader',
  'lyric/theme analyst',
  'scene historian',
  'discovery connector',
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

export interface AiGuidePersona {
  id: string;
  genreId: string;
  displayName: string;
  avatarAsset: string | null;
  archetype: Archetype;
  voiceTraits: Record<string, unknown>;
  interestWeights: Record<string, number>;
  messageLengthDistribution: { short: number; medium: number; long: number };
  emojiRate: number;
  questionRate: number;
  slangLevel: number;
  activityWindows: Array<{ startHour: number; endHour: number }>;
  disclosureLabel: typeof DISCLOSURE_LABEL;
  isActive: boolean;
  seedKey: string;
}

export const ObjectiveSchema = z.enum([
  'inform',
  'invite_attendee_context',
  'compare_setlists',
  'support_discovery',
  'practical_event_help',
]);
export type Objective = z.infer<typeof ObjectiveSchema>;

export const ConversationPlanDraftSchema = z.object({
  roomId: z.string(),
  genreId: z.string(),
  triggerType: z.string(),
  objective: ObjectiveSchema,
  factIds: z.array(z.string()).min(1),
  personaIds: z.array(z.string()).min(1),
  maxMessages: z.number().int().min(1).max(5),
  spacingSeconds: z.array(z.number().int().min(0)),
  spoilerMode: z.boolean(),
  expiresAt: z.string(),
  whyGenerated: z.string(),
  dataSegment: DataSegmentSchema,
});
export type ConversationPlanDraft = z.infer<typeof ConversationPlanDraftSchema>;

export const GeneratedGuideMessageSchema = z.object({
  personaId: z.string(),
  text: z.string().min(1).max(500),
  replyToDraftIndex: z.number().int().optional(),
  citedFactIds: z.array(z.string()),
  containsSetlistSpoiler: z.boolean(),
  intent: z.enum([
    'fact',
    'opinion',
    'question',
    'reply',
    'moderation',
    'reaction',
    'correction',
    'discovery',
  ]),
  confidence: z.number().min(0).max(1),
  authorType: z.literal(AUTHOR_TYPE_AI),
  disclosureLabel: z.literal(DISCLOSURE_LABEL),
});
export type GeneratedGuideMessage = z.infer<typeof GeneratedGuideMessageSchema>;

export const GeneratedConversationSchema = z.object({
  messages: z.array(GeneratedGuideMessageSchema),
});
export type GeneratedConversation = z.infer<typeof GeneratedConversationSchema>;

export interface FetchEventsInput {
  genreId: string;
  city?: string;
  fromIso?: string;
  toIso?: string;
  limit?: number;
}

export interface FetchSetlistsInput {
  artistName: string;
  eventId?: string;
}

export interface FetchArtistInput {
  artistName: string;
  genreId?: string;
}

export interface FetchTopicSignalsInput {
  genreId: string;
  artistName?: string;
  venueName?: string;
  queryHints?: string[];
}

export interface MusicSourceAdapter {
  readonly name: string;
  fetchUpcomingEvents(input: FetchEventsInput): Promise<GroundedFact[]>;
  fetchRecentSetlists?(input: FetchSetlistsInput): Promise<GroundedFact[]>;
  fetchArtistFacts(input: FetchArtistInput): Promise<GroundedFact[]>;
  fetchTopicSignals?(input: FetchTopicSignalsInput): Promise<GroundedFact[]>;
}

export interface SceneGuidesRuntimeSettings {
  enabled: boolean;
  dryRun: boolean;
  mode: DestinationMode;
  maxAiMessagesPerRoomDay: number;
  maxBotChainLength: number;
  maxConsecutiveAiWithoutDelay: number;
  consecutiveDelaySeconds: number;
  activePersonaCountMin: number;
  activePersonaCountMax: number;
  quietHours: { startHour: number; endHour: number };
  confidenceThreshold: number;
  freshnessHours: number;
  pauseOnHumanActivity: boolean;
  /** Live JamBase has no setlist field in this project's contract — keep false. */
  setlistGenerationEnabled: boolean;
  perGenreEnabled: Record<string, boolean>;
  perRoomEnabled: Record<string, boolean>;
  staffRoomAllowlist: string[];
}

export const DEFAULT_SETTINGS: SceneGuidesRuntimeSettings = {
  enabled: false,
  dryRun: true,
  mode: 'fixture',
  maxAiMessagesPerRoomDay: 30,
  maxBotChainLength: 4,
  maxConsecutiveAiWithoutDelay: 2,
  consecutiveDelaySeconds: 720,
  activePersonaCountMin: 3,
  activePersonaCountMax: 7,
  quietHours: { startHour: 0, endHour: 7 },
  confidenceThreshold: 0.55,
  freshnessHours: 72,
  pauseOnHumanActivity: true,
  setlistGenerationEnabled: false,
  perGenreEnabled: {},
  perRoomEnabled: {},
  staffRoomAllowlist: [],
};

export const LAUNCH_GENRES = ['indie', 'hip-hop', 'edm', 'metal', 'pop'] as const;

export const ROOM_NOTICE =
  'This room includes AI Scene Guides that share sourced concert updates and conversation starters.';

export const PROFILE_DRAWER_COPY = {
  operatedBy: 'AI Scene Guide operated by Synth',
  whatItDoes:
    'Shares sourced concert updates, artist context, and conversation starters. It does not attend shows or speak as a real person.',
  whySeeingThis:
    'Why am I seeing this? Genre rooms use disclosed AI guides so new rooms are not empty while real fans join the conversation.',
};

export interface VerifierCheckResult {
  ok: boolean;
  code: string;
  detail: string;
  severity: 'style' | 'high_risk';
}

export interface VerifierResult {
  passed: boolean;
  checks: VerifierCheckResult[];
  allowRegen: boolean;
}

export type PublisherDecision = 'would_publish' | 'published' | 'rejected' | 'suppressed';

export interface SimulatedRoomState {
  roomId: string;
  genreId: string;
  timezone: string;
  aiMessagesLast24h: number;
  consecutiveAiCount: number;
  lastAiAt?: string;
  lastHumanAt?: string;
  recentMessageTexts: string[];
  muteAiGuides: boolean;
  roomEnabled: boolean;
}

export interface CandidateMessage {
  id: string;
  planId: string;
  draftIndex: number;
  message: GeneratedGuideMessage;
  intendedPublishAt: string;
  verifier: VerifierResult;
  publisherDecision: PublisherDecision;
  suppressionReason?: string;
}

export interface ConversationPlanRecord {
  id: string;
  draft: ConversationPlanDraft;
  status: string;
  candidates: CandidateMessage[];
  simulatedHumanAt?: string;
}
