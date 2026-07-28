import { supabase } from '@/integrations/supabase/client';

export interface DraftReviewData {
  selectedArtist?: any;
  selectedVenue?: any;
  eventDate?: string;
  performanceRating?: number;
  venueRating?: number;
  overallExperienceRating?: number;
  reviewText?: string;
  photos?: string[];
  videos?: string[];
  moodTags?: string[];
  genreTags?: string[];
  contextTags?: string[];
  reactionEmoji?: string;
  selectedSetlist?: any;
  customSetlist?: any;
}

export interface DraftReview {
  id: string;
  event_id: string;
  draft_data: DraftReviewData;
  last_saved_at: string;
  event_title?: string;
  artist_name?: string;
  venue_name?: string;
  event_date?: string;
}

export class DraftReviewService {
  /**
   * Auto-save draft review data
   */
  static async saveDraft(
    userId: string,
    eventId: string,
    draftData: DraftReviewData
  ): Promise<string | null> {
    try {
      console.log('💾 Saving draft:', { userId, eventId, draftData });
      
      // Validate inputs
      if (!userId || !eventId) {
        console.error('❌ Missing required parameters:', { userId, eventId });
        return null;
      }

      // Check if eventId is a valid UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(eventId)) {
        console.error('❌ Event ID is not a valid UUID:', eventId);
        return null;
      }

      const { data, error } = await (supabase as any).rpc('save_review_draft', {
        p_user_id: userId,
        p_event_id: eventId,
        p_draft_data: draftData
      });

      if (error) {
        console.error('❌ Error saving draft:', error);
        console.error('❌ Error details:', JSON.stringify(error, null, 2));
        return null;
      }

      console.log('✅ Draft saved successfully:', data);
      return data;
    } catch (error) {
      console.error('❌ Exception saving draft:', error);
      return null;
    }
  }

  /**
   * Get user's draft reviews
   */
  static async getUserDrafts(userId: string): Promise<DraftReview[]> {
    try {
      const { data, error } = await (supabase as any).rpc('get_user_draft_reviews', {
        p_user_id: userId
      });

      if (error) {
        console.error('Error fetching drafts:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('Error fetching drafts:', error);
      return [];
    }
  }

  /**
   * Publish a draft review (convert to final review)
   */
  static async publishDraft(
    draftId: string,
    finalData: DraftReviewData
  ): Promise<string | null> {
    try {
      const { data, error } = await (supabase as any).rpc('publish_review_draft', {
        p_draft_id: draftId,
        p_final_data: finalData
      });

      if (error) {
        console.error('Error publishing draft:', error);
        return null;
      }

      return data;
    } catch (error) {
      console.error('Error publishing draft:', error);
      return null;
    }
  }

  /**
   * Delete a draft review
   */
  static async deleteDraft(draftId: string, userId: string): Promise<boolean> {
    try {
      const { data, error } = await (supabase as any).rpc('delete_review_draft', {
        p_draft_id: draftId,
        p_user_id: userId
      });

      if (error) {
        console.error('Error deleting draft:', error);
        return false;
      }

      return data;
    } catch (error) {
      console.error('Error deleting draft:', error);
      return false;
    }
  }

  /**
   * Load draft data for a specific event
   */
  static async loadDraftForEvent(
    userId: string,
    eventId: string
  ): Promise<DraftReviewData | null> {
    try {
      const { data, error } = await (supabase as any)
        .from('user_reviews')
        .select('draft_data')
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .eq('is_draft', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          // No draft found
          return null;
        }
        console.error('Error loading draft:', error);
        return null;
      }

      return data?.draft_data || null;
    } catch (error) {
      console.error('Error loading draft:', error);
      return null;
    }
  }

  /**
   * Check if user has a draft for a specific event
   */
  static async hasDraftForEvent(
    userId: string,
    eventId: string
  ): Promise<boolean> {
    try {
      const { data, error } = await (supabase as any)
        .from('user_reviews')
        .select('id')
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .eq('is_draft', true)
        .single();

      if (error) {
        if (error.code === 'PGRST116') {
          return false;
        }
        console.error('Error checking draft:', error);
        return false;
      }

      return !!data;
    } catch (error) {
      console.error('Error checking draft:', error);
      return false;
    }
  }
}
