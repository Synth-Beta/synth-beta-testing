/// <reference types="vite/client" />

declare module '@synth/ai-scene-guides/quality' {
  export type ContextualDecision = {
    decision_id: string;
    generation_id: string;
    generated_at: string;
    action: 'POST' | 'REPLY' | 'SILENCE';
    silence_reason: string | null;
    genre_id: string;
    room_timezone: string;
    persona_id: string | null;
    persona_name: string | null;
    persona_archetype: string | null;
    sender_slot: number | null;
    content: string | null;
    intent: string | null;
    contribution_type: string | null;
    conversation_id: string | null;
    turn_number: number | null;
    reply_to_turn: number | null;
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
    status: string;
    gate_summary: string;
    normalized_key: string | null;
    structural_fingerprint: string | null;
    template_family: string | null;
    guide_version: string;
    generator_version: string;
    rule_version: string;
    contains_setlist_spoiler: boolean;
    failure_reasons: string;
    audit: unknown;
  };

  export type BoundPersona = {
    id: string;
    genreId: string;
    displayName: string;
    archetype: string;
    senderSlot: number;
    voiceTraits?: Record<string, unknown>;
    messageLengthDistribution?: Record<string, number>;
  };

  export function runContextualSeed(options?: {
    targetDecisions?: number;
    seed?: number;
    genres?: string[];
    senderCount?: number;
    strategy?: {
      voice?: string;
      strategy?: string;
      openerTemplates?: string[];
    } | null;
  }): {
    decisions: ContextualDecision[];
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
      lengthBuckets: {
        under8: number;
        mid8_20: number;
        mid21_45: number;
        mid46_90: number;
      };
      genres: Record<string, number>;
    };
  };

  export function contextualDecisionsCsv(decisions: ContextualDecision[]): string;
  export const ROOM_TIMEZONE: string;
  export const DEFAULT_WRITING_STRATEGY: {
    voice: string;
    strategy: string;
    openerTemplates: string[];
  };
  export function mergeWritingStrategy(
    raw?: Partial<{
      voice: string;
      strategy: string;
      openerTemplates: string[];
    }> | null,
  ): {
    voice: string;
    strategy: string;
    openerTemplates: string[];
  };
  export function templatesToText(templates: string[]): string;
  export function textToTemplates(text: string): string[];
}
