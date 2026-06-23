/**
 * Content Moderation Service
 * Handles content reporting, user blocking, and moderation workflows
 */

import { supabase } from '@/integrations/supabase/client';

export type ContentType = 'event' | 'review' | 'comment' | 'profile' | 'message';
export type FlagReason =
  | 'spam'
  | 'inappropriate_content'
  | 'harassment'
  | 'misinformation'
  | 'copyright_violation'
  | 'fake_event'
  | 'duplicate'
  | 'other';

export interface ReportContentRequest {
  content_type: ContentType;
  content_id: string;
  flag_reason: FlagReason;
  flag_details?: string;
}

export interface BlockUserRequest {
  blocked_user_id: string;
  block_reason?: string;
}

export const FLAG_REASONS = {
  spam: {
    label: 'Spam',
    description: 'Unwanted or repetitive content',
    icon: '🚫',
  },
  inappropriate_content: {
    label: 'Inappropriate Content',
    description: 'Offensive, explicit, or disturbing content',
    icon: '⚠️',
  },
  harassment: {
    label: 'Harassment or Bullying',
    description: 'Targeting someone with hateful or threatening content',
    icon: '🛡️',
  },
  misinformation: {
    label: 'False Information',
    description: 'Spreading false or misleading information',
    icon: '❌',
  },
  copyright_violation: {
    label: 'Copyright Violation',
    description: 'Unauthorized use of copyrighted material',
    icon: '©️',
  },
  fake_event: {
    label: 'Fake or Fraudulent Event',
    description: 'Event that doesn\'t exist or is misleading',
    icon: '🎭',
  },
  duplicate: {
    label: 'Duplicate Content',
    description: 'Same content posted multiple times',
    icon: '🔄',
  },
  other: {
    label: 'Other',
    description: 'Something else that violates guidelines',
    icon: '📝',
  },
};

export class ContentModerationService {
  /**
   * Report content
   * Uses direct insert to match the moderation_flags table schema:
   * - status (not flag_status)
   * - additional_details (not flag_details)
   * - flag_category is optional and can be inferred from flag_reason
   */
  static async reportContent(request: ReportContentRequest): Promise<string> {
    try {
      // Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('User must be authenticated to report content');
      }

      // Map flag_reason to flag_category if possible
      const flagCategoryMap: Record<FlagReason, string> = {
        spam: 'spam',
        inappropriate_content: 'inappropriate_content',
        harassment: 'harassment',
        misinformation: 'misinformation',
        copyright_violation: 'copyright_violation',
        fake_event: 'fake_content',
        duplicate: 'spam', // Treat duplicates as spam
        other: 'other',
      };

      const flag_category = flagCategoryMap[request.flag_reason] || 'other';

      // Map content_type - only event, review, artist, venue are allowed
      let contentType = request.content_type;
      if (contentType === 'comment' || contentType === 'profile' || contentType === 'message') {
        // Map unsupported types to supported ones or use 'other' category
        if (contentType === 'comment') {
          contentType = 'review'; // Treat comments as reviews for moderation
        } else if (contentType === 'profile') {
          contentType = 'artist'; // Treat profiles as artist content
        } else {
          throw new Error(`Content type ${contentType} is not supported for moderation flags`);
        }
      }

      // Get user_id from users table
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      const userId = userData?.user_id || user.id;

      // Insert directly into moderation_flags table
      const { data, error } = await supabase
        .from('moderation_flags')
        .insert({
          flagged_by_user_id: userId,
          content_type: contentType as 'event' | 'review' | 'artist' | 'venue',
          content_id: request.content_id,
          flag_reason: request.flag_reason,
          flag_category: flag_category as any,
          additional_details: request.flag_details?.trim() || null,
          status: 'pending',
        })
        .select('id')
        .single();

      if (error) {
        // Handle unique constraint violation (user already flagged this content)
        if (error.code === '23505') {
          throw new Error('You have already reported this content');
        }
        throw error;
      }

      return data.id; // Returns flag_id
    } catch (error) {
      console.error('Error reporting content:', error);
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Failed to report content');
    }
  }

  /**
   * Block user
   */
  static async blockUser(request: BlockUserRequest): Promise<string> {
    try {
      const { data, error } = await supabase.rpc('block_user', {
        p_blocked_user_id: request.blocked_user_id,
        p_block_reason: request.block_reason || null,
      });

      if (error) throw error;
      return data; // Returns block_id
    } catch (error) {
      console.error('Error blocking user:', error);
      throw error;
    }
  }

  /**
   * Unblock user
   */
  static async unblockUser(blockedUserId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('unblock_user', {
        p_blocked_user_id: blockedUserId,
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error unblocking user:', error);
      throw error;
    }
  }

  /**
   * Check if user is blocked
   */
  static async isUserBlocked(
    userId: string,
    byUserId?: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase.rpc('is_user_blocked', {
        p_user_id: userId,
        p_by_user_id: byUserId || null,
      });

      if (error) throw error;
      return data || false;
    } catch (error) {
      console.error('Error checking block status:', error);
      return false;
    }
  }

  /**
   * Get blocked users list
   */
  static async getBlockedUsers(): Promise<any[]> {
    try {
      const { data, error } = await supabase.rpc('get_blocked_users');

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching blocked users:', error);
      throw error;
    }
  }

  /**
   * Get user's reports
   */
  static async getUserReports(userId?: string): Promise<any[]> {
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      const targetUserId = userId || user.id;

      const { data, error } = await supabase
        .from('moderation_flags')
        .select('*')
        .eq('flagged_by_user_id', targetUserId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching user reports:', error);
      throw error;
    }
  }

  /**
   * Moderate content (admin)
   */
  static async moderateContent(
    flagId: string,
    action: 'remove' | 'warn' | 'dismiss',
    reviewNotes?: string,
    notifyUser: boolean = true
  ): Promise<void> {
    try {
      const { error } = await supabase.rpc('moderate_content', {
        p_flag_id: flagId,
        p_action: action,
        p_review_notes: reviewNotes || null,
        p_notify_user: notifyUser,
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error moderating content:', error);
      throw error;
    }
  }

  /**
   * Get content details for flag
   */
  static async getFlaggedContentDetails(
    contentType: ContentType,
    contentId: string
  ): Promise<any> {
    try {
      let query;
      
      switch (contentType) {
        case 'event':
          query = supabase
            .from('events')
            .select('*')
            .eq('id', contentId)
            .single();
          break;
        case 'review':
          query = supabase
            .from('reviews')
            .select(`
              *,
              user:users!reviews_user_id_fkey(name, avatar_url)
            `)
            .eq('id', contentId)
            .single();
          break;
        case 'comment':
          query = supabase
            .from('comments')
            .select(`
              *,
              user:users!comments_user_id_fkey(name, avatar_url)
            `)
            .eq('id', contentId)
            .single();
          break;
        case 'profile':
          query = supabase
            .from('users')
            .select('*')
            .eq('user_id', contentId)
            .single();
          break;
        default:
          throw new Error('Unsupported content type');
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching content details:', error);
      throw error;
    }
  }

  /**
   * Get flag reasons with descriptions
   */
  static getFlagReasons(): typeof FLAG_REASONS {
    return FLAG_REASONS;
  }

  /**
   * Get user moderation status
   */
  static async getUserModerationStatus(userId: string): Promise<any> {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('moderation_status, warning_count, last_warned_at, suspended_until, ban_reason')
        .eq('user_id', userId)
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error fetching moderation status:', error);
      throw error;
    }
  }

  /**
   * Check if current user can report content
   */
  static async canReportContent(
    contentType: ContentType,
    contentId: string
  ): Promise<boolean> {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      // Check if user already reported this content
      const { data, error } = await supabase
        .from('moderation_flags')
        .select('id')
        .eq('flagged_by_user_id', user.id)
        .eq('content_type', contentType)
        .eq('content_id', contentId)
        .single();

      // If error (not found), user hasn't reported yet
      if (error && error.code === 'PGRST116') return true;
      
      // If data exists, user already reported
      return !data;
    } catch (error) {
      console.error('Error checking report eligibility:', error);
      return false;
    }
  }

  /**
   * Get content type display name
   */
  static getContentTypeDisplayName(contentType: ContentType): string {
    const names: Record<ContentType, string> = {
      event: 'Event',
      review: 'Review',
      comment: 'Comment',
      profile: 'Profile',
      message: 'Message',
    };
    return names[contentType] || contentType;
  }
}

export default ContentModerationService;

