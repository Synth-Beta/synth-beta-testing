import { supabase } from '../integrations/supabase/client';

/**
 * Minimal mobile counterpart to web's ContentModerationService, covering the one case
 * mobile needs today: reporting a chat message. Web maps 'message' onto the 'review'
 * content_type bucket because moderation_flags.content_type only accepts
 * event/review/artist/venue - this must stay in sync with
 * src/services/contentModerationService.ts or the admin queue splits in two.
 */
export type MessageFlagReason = 'spam' | 'harassment' | 'inappropriate_content' | 'other';

const FLAG_CATEGORY: Record<MessageFlagReason, string> = {
    spam: 'spam',
    harassment: 'harassment',
    inappropriate_content: 'inappropriate_content',
    other: 'other',
};

export class ContentModerationService {
    /**
     * Files a moderation flag for a chat message.
     * Returns 'already_reported' rather than throwing when the reporter has flagged this
     * message before - to the person tapping Report that is the same outcome as success.
     */
    static async reportMessage(
        messageId: string,
        reason: MessageFlagReason,
        details?: string
    ): Promise<'reported' | 'already_reported'> {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError) throw authError;
        if (!user) throw new Error('You must be signed in to report a message');

        const { error } = await supabase.from('moderation_flags').insert({
            flagged_by_user_id: user.id,
            content_type: 'review',
            content_id: messageId,
            flag_reason: reason,
            flag_category: FLAG_CATEGORY[reason],
            additional_details: details?.trim() || null,
            status: 'pending',
        });

        if (error) {
            if (error.code === '23505') return 'already_reported';
            throw error;
        }
        return 'reported';
    }
}
