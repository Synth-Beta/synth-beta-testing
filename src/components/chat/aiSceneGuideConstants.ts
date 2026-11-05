/**
 * Shared constants/helpers for Scene Guide messages in chat UI.
 * Keep in sync with ai-scene-guides trust rules.
 */

export const AI_AUTHOR_TYPE = 'ai_scene_guide' as const;
/** User-facing label — do not say "AI". */
export const AI_DISCLOSURE_LABEL = 'Scene Guide' as const;
/** Older messages may still carry this metadata value. */
export const LEGACY_AI_DISCLOSURE_LABEL = 'AI Scene Guide' as const;

/** Mute control only — no room-level AI marketing. */
export const AI_ROOM_NOTICE = '';

export const AI_PROFILE_COPY = {
  operatedBy: 'Scene Guide operated by Synth',
  whatItDoes:
    'Shares sourced concert updates, artist context, and conversation starters. It does not attend shows or speak as a real person.',
  whySeeingThis:
    'Scene guides keep genre rooms from going quiet so fans have something to react to while the conversation grows.',
} as const;

export function isAiSceneGuideMessage(message: {
  author_type?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (message.author_type === AI_AUTHOR_TYPE) return true;
  const meta = message.metadata ?? {};
  return (
    meta.author_type === AI_AUTHOR_TYPE ||
    meta.disclosure_label === AI_DISCLOSURE_LABEL ||
    meta.disclosure_label === LEGACY_AI_DISCLOSURE_LABEL
  );
}

export type SourceChipFact = {
  id: string;
  sourceTitle: string;
  sourceUrl: string;
  sourceKind: string;
  retrievedAt?: string;
  confidence?: number;
  kind?: string;
};
