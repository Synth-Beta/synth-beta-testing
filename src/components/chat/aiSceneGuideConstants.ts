/**
 * Shared constants/helpers for AI Scene Guide disclosure in chat UI.
 * Keep in sync with ai-scene-guides trust rules.
 */

export const AI_AUTHOR_TYPE = 'ai_scene_guide' as const;
export const AI_DISCLOSURE_LABEL = 'AI Scene Guide' as const;

export const AI_ROOM_NOTICE =
  'This room includes AI Scene Guides that share sourced concert updates and conversation starters.';

export const AI_PROFILE_COPY = {
  operatedBy: 'AI Scene Guide operated by Synth',
  whatItDoes:
    'Shares sourced concert updates, artist context, and conversation starters. It does not attend shows or speak as a real person.',
  whySeeingThis:
    'Why am I seeing this? Genre rooms use disclosed AI guides so new rooms are not empty while real fans join the conversation.',
} as const;

export function isAiSceneGuideMessage(message: {
  author_type?: string | null;
  metadata?: Record<string, unknown> | null;
}): boolean {
  if (message.author_type === AI_AUTHOR_TYPE) return true;
  const meta = message.metadata ?? {};
  return meta.author_type === AI_AUTHOR_TYPE || meta.disclosure_label === AI_DISCLOSURE_LABEL;
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
