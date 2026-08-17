/**
 * Gated producer that writes AI Scene Guide messages into Synth `messages`.
 * Only callable when mode is staff_approve or production AND enabled AND not dry_run.
 * Shadow/fixture must use ForbiddenSynthMessageWriter instead.
 */

import { canWriteToSynthMessages } from '../config.js';
import type { SceneGuidesRuntimeSettings } from '../types.js';
import type { MessageWriter } from './publisher.js';

export interface SupabaseLike {
  from: (table: string) => {
    insert: (row: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>;
  };
}

export function createSynthMessageWriter(options: {
  settings: SceneGuidesRuntimeSettings;
  supabase: SupabaseLike;
  /** Single system sender — not a consumer persona account. */
  systemSenderId: string;
}): MessageWriter {
  return {
    async insertAiMessage(input) {
      if (!canWriteToSynthMessages(options.settings)) {
        throw new Error('Refusing Synth chat write: destination mode/kill switch closed');
      }
      if (input.authorType !== 'ai_scene_guide') {
        throw new Error('author_type must be ai_scene_guide');
      }
      if (!input.personaId || !input.planId) {
        throw new Error('persona_id and plan_id required for AI messages');
      }

      const { error } = await options.supabase.from('messages').insert({
        chat_id: input.roomId,
        sender_id: options.systemSenderId,
        content: input.text,
        message_type: 'text',
        is_encrypted: false,
        author_type: 'ai_scene_guide',
        persona_id: input.personaId,
        plan_id: input.planId,
        cited_fact_ids: input.citedFactIds,
        contains_setlist_spoiler: input.containsSetlistSpoiler,
        metadata: {
          author_type: 'ai_scene_guide',
          disclosure_label: 'AI Scene Guide',
          persona_id: input.personaId,
          plan_id: input.planId,
          cited_fact_ids: input.citedFactIds,
        },
      });

      if (error) throw new Error(error.message);
      return { messageId: `${input.planId}:${input.personaId}:${Date.now()}` };
    },
  };
}
