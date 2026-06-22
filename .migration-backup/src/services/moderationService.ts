/**
 * Moderation Service
 * 
 * Handles content flagging and moderation actions
 */

import { supabase } from '@/integrations/supabase/client';

export interface ModerationFlag {
  id: string;
  flagged_by_user_id: string;
  content_type: 'event' | 'review' | 'artist' | 'venue';
  content_id: string;
  flag_reason: string;
  flag_category?: 'spam' | 'harassment' | 'inappropriate_content' | 'misinformation' | 'copyright_violation' | 'fake_content' | 'other';
  additional_details?: string;
  status: 'pending' | 'under_review' | 'resolved' | 'dismissed' | 'escalated';
  resolved_by_user_id?: string;
  resolution_notes?: string;
  resolution_action?: 'no_action' | 'content_removed' | 'content_edited' | 'user_warned' | 'user_suspended' | 'user_banned' | 'escalated_to_admin';
  resolved_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateFlagInput {
  content_type: 'event' | 'review' | 'artist' | 'venue';
  content_id: string;
  flag_reason: string;
  flag_category?: 'spam' | 'harassment' | 'inappropriate_content' | 'misinformation' | 'copyright_violation' | 'fake_content' | 'other';
  additional_details?: string;
}

export class ModerationService {
  /**
   * Flag content (event, review, artist, or venue)
   * Matches the moderation_flags table schema:
   * - status (not flag_status)
   * - flag_category (separate field)
   * - additional_details (not flag_details)
   */
  static async flagContent(input: CreateFlagInput): Promise<ModerationFlag> {
    try {
      // Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error('User must be authenticated to flag content');
      }

      // In Supabase, users.user_id typically equals auth.users.id
      // Get the user_id from the users table to ensure we have the correct reference
      const { data: userData, error: userError } = await supabase
        .from('users')
        .select('user_id')
        .eq('user_id', user.id)
        .maybeSingle();

      // If user_id lookup fails, use auth.uid() directly (it's usually the same)
      const userId = userData?.user_id || user.id;

      const { data, error } = await supabase
        .from('moderation_flags')
        .insert({
          flagged_by_user_id: userId,
          content_type: input.content_type,
          content_id: input.content_id,
          flag_reason: input.flag_reason.trim(),
          flag_category: input.flag_category || null,
          additional_details: input.additional_details?.trim() || null,
          status: 'pending',
        })
        .select()
        .single();

      if (error) {
        // Handle unique constraint violation (user already flagged this content)
        if (error.code === '23505') {
          throw new Error('You have already flagged this content');
        }
        console.error('Database error flagging content:', error);
        throw error;
      }

      return data as ModerationFlag;
    } catch (error) {
      console.error('Error flagging content:', error);
      if (error instanceof Error) {
      throw error;
      }
      throw new Error('Failed to flag content');
    }
  }

  /**
   * Check if user has already flagged specific content
   */
  static async hasUserFlagged(
    userId: string,
    content_type: 'event' | 'review' | 'artist' | 'venue',
    content_id: string
  ): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('moderation_flags')
        .select('id')
        .eq('flagged_by_user_id', userId)
        .eq('content_type', content_type)
        .eq('content_id', content_id)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking if user flagged content:', error);
      return false;
    }
  }

  /**
   * Get flags for a specific content item
   */
  static async getFlagsForContent(
    content_type: 'event' | 'review' | 'artist' | 'venue',
    content_id: string
  ): Promise<ModerationFlag[]> {
    try {
      const { data, error } = await supabase
        .from('moderation_flags')
        .select('*')
        .eq('content_type', content_type)
        .eq('content_id', content_id)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return (data || []) as ModerationFlag[];
    } catch (error) {
      console.error('Error getting flags for content:', error);
      return [];
    }
  }
}

