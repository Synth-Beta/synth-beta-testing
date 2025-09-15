import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';

export type UserJamBaseEvent = Tables<'user_jambase_events'>;
export type UserJamBaseEventInsert = TablesInsert<'user_jambase_events'>;
export type UserJamBaseEventUpdate = TablesUpdate<'user_jambase_events'>;

export type UserEventReview = Tables<'user_event_reviews'>;
export type UserEventReviewInsert = TablesInsert<'user_event_reviews'>;
export type UserEventReviewUpdate = TablesUpdate<'user_event_reviews'>;

export interface EventInterest {
  id: string;
  user_id: string;
  jambase_event_id: string;
  interested: boolean;
  created_at: string;
  updated_at: string;
}

export interface EventReview {
  id: string;
  user_id: string;
  jambase_event_id: string;
  rating: number;
  review_text?: string;
  was_there: boolean;
  created_at: string;
  updated_at: string;
}

export class UserEventService {
  /**
   * Add or update user interest in an event
   */
  static async setEventInterest(
    userId: string, 
    jambaseEventId: string, 
    interested: boolean
  ): Promise<UserJamBaseEvent> {
    try {
      // First check if the user already has an interest record for this event
      const { data: existingInterest, error: checkError } = await supabase
        .from('user_jambase_events')
        .select('*')
        .eq('user_id', userId)
        .eq('jambase_event_id', jambaseEventId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingInterest) {
        // Update existing interest
        const { data, error } = await supabase
          .from('user_jambase_events')
          .update({ 
            interested,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingInterest.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new interest record
        const { data, error } = await supabase
          .from('user_jambase_events')
          .insert({
            user_id: userId,
            jambase_event_id: jambaseEventId,
            interested
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error('Error setting event interest:', error);
      throw new Error(`Failed to set event interest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove user interest in an event
   */
  static async removeEventInterest(userId: string, jambaseEventId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_jambase_events')
        .delete()
        .eq('user_id', userId)
        .eq('jambase_event_id', jambaseEventId);

      if (error) throw error;
    } catch (error) {
      console.error('Error removing event interest:', error);
      throw new Error(`Failed to remove event interest: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if user is interested in an event
   */
  static async isUserInterested(userId: string, jambaseEventId: string): Promise<boolean> {
    try {
      const { data, error } = await supabase
        .from('user_jambase_events')
        .select('interested')
        .eq('user_id', userId)
        .eq('jambase_event_id', jambaseEventId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data?.interested || false;
    } catch (error) {
      console.error('Error checking event interest:', error);
      return false;
    }
  }

  /**
   * Get all events user is interested in
   */
  static async getUserInterestedEvents(userId: string): Promise<{
    events: Array<{
      interest: UserJamBaseEvent;
      event: any; // JamBase event data
    }>;
    total: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('user_jambase_events')
        .select(`
          *,
          jambase_event:jambase_events(*)
        `)
        .eq('user_id', userId)
        .eq('interested', true)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return {
        events: data || [],
        total: data?.length || 0
      };
    } catch (error) {
      console.error('Error getting user interested events:', error);
      throw new Error(`Failed to get user interested events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add or update a review for an event
   */
  static async setEventReview(
    userId: string,
    jambaseEventId: string,
    reviewData: {
      rating: number;
      review_text?: string;
      was_there: boolean;
    }
  ): Promise<UserEventReview> {
    try {
      // First check if the user already has a review for this event
      const { data: existingReview, error: checkError } = await supabase
        .from('user_event_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('jambase_event_id', jambaseEventId)
        .single();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingReview) {
        // Update existing review
        const { data, error } = await supabase
          .from('user_event_reviews')
          .update({
            ...reviewData,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingReview.id)
          .select()
          .single();

        if (error) throw error;
        return data;
      } else {
        // Create new review
        const { data, error } = await supabase
          .from('user_event_reviews')
          .insert({
            user_id: userId,
            jambase_event_id: jambaseEventId,
            ...reviewData
          })
          .select()
          .single();

        if (error) throw error;
        return data;
      }
    } catch (error) {
      console.error('Error setting event review:', error);
      throw new Error(`Failed to set event review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's review for an event
   */
  static async getUserEventReview(userId: string, jambaseEventId: string): Promise<UserEventReview | null> {
    try {
      const { data, error } = await supabase
        .from('user_event_reviews')
        .select('*')
        .eq('user_id', userId)
        .eq('jambase_event_id', jambaseEventId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      return data || null;
    } catch (error) {
      console.error('Error getting user event review:', error);
      return null;
    }
  }

  /**
   * Get all reviews for an event
   */
  static async getEventReviews(jambaseEventId: string): Promise<{
    reviews: Array<{
      review: UserEventReview;
      user: {
        id: string;
        name: string;
        avatar_url?: string;
      };
    }>;
    averageRating: number;
    totalReviews: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('user_event_reviews')
        .select(`
          *,
          user:profiles(id, name, avatar_url)
        `)
        .eq('jambase_event_id', jambaseEventId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const reviews = data || [];
      const totalReviews = reviews.length;
      const averageRating = totalReviews > 0 
        ? reviews.reduce((sum, item) => sum + item.rating, 0) / totalReviews 
        : 0;

      return {
        reviews,
        averageRating,
        totalReviews
      };
    } catch (error) {
      console.error('Error getting event reviews:', error);
      throw new Error(`Failed to get event reviews: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's event history (all events they've reviewed)
   */
  static async getUserEventHistory(userId: string): Promise<{
    reviews: Array<{
      review: UserEventReview;
      event: any; // JamBase event data
    }>;
    total: number;
  }> {
    try {
      const { data, error } = await supabase
        .from('user_event_reviews')
        .select(`
          *,
          jambase_event:jambase_events(*)
        `)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return {
        reviews: data || [],
        total: data?.length || 0
      };
    } catch (error) {
      console.error('Error getting user event history:', error);
      throw new Error(`Failed to get user event history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a review
   */
  static async deleteEventReview(userId: string, jambaseEventId: string): Promise<void> {
    try {
      const { error } = await supabase
        .from('user_event_reviews')
        .delete()
        .eq('user_id', userId)
        .eq('jambase_event_id', jambaseEventId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting event review:', error);
      throw new Error(`Failed to delete event review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's upcoming events (events they're interested in that are in the future)
   */
  static async getUserUpcomingEvents(userId: string): Promise<{
    events: Array<{
      interest: UserJamBaseEvent;
      event: any; // JamBase event data
    }>;
    total: number;
  }> {
    try {
      const now = new Date().toISOString();
      
      const { data, error } = await supabase
        .from('user_jambase_events')
        .select(`
          *,
          jambase_event:jambase_events(*)
        `)
        .eq('user_id', userId)
        .eq('interested', true)
        .gte('jambase_events.event_date', now)
        .order('jambase_events.event_date', { ascending: true });

      if (error) throw error;

      return {
        events: data || [],
        total: data?.length || 0
      };
    } catch (error) {
      console.error('Error getting user upcoming events:', error);
      throw new Error(`Failed to get user upcoming events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
