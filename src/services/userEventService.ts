import { supabase } from '@/integrations/supabase/client';
import { Tables, TablesInsert, TablesUpdate } from '@/integrations/supabase/types';
import { trackInteraction } from '@/services/interactionTrackingService';

export type UserJamBaseEvent = Tables<'user_jambase_events'>;
export type UserJamBaseEventInsert = TablesInsert<'user_jambase_events'>;
export type UserJamBaseEventUpdate = TablesUpdate<'user_jambase_events'>;

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
      console.log('🔍 setEventInterest called with:', { userId, jambaseEventId, interested });
      
      // Presence-based interest model: if interested=true ensure row exists; if false, delete it
      // Use SECURITY DEFINER function to avoid recursive RLS
      const { error } = await supabase.rpc('set_user_interest' as any, {
        event_id: jambaseEventId,
        interested
      });
      
      console.log('🔍 RPC call result:', { error });
      if (error) {
        console.error('🔍 Detailed RPC error:', JSON.stringify(error, null, 2));
        throw error;
      }

      // Return fresh state
      const { data, error: fetchError } = await supabase
        .from('user_jambase_events')
        .select('*')
        .eq('user_id', userId)
        .eq('jambase_event_id', jambaseEventId)
        .maybeSingle();
      if (fetchError) throw fetchError;
      try {
        trackInteraction.interest('event', jambaseEventId, interested);
        console.log('🎯 Tracked interest interaction:', { jambaseEventId, interested });
      } catch (error) {
        console.error('Error tracking interest interaction:', error);
      }
      return (data as UserJamBaseEvent) || ({} as UserJamBaseEvent);
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
      try {
        trackInteraction.interest('event', jambaseEventId, false, { action: 'remove' });
      } catch {}
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
        .select('id')
        .eq('user_id', userId)
        .eq('jambase_event_id', jambaseEventId)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;
      return Boolean(data);
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
        .order('created_at', { ascending: false });

      if (error) throw error;

      return {
        events: Array.isArray(data)
          ? data.map((row: any) => ({
              interest: {
                id: row.id,
                user_id: row.user_id,
                jambase_event_id: row.jambase_event_id,
                created_at: row.created_at,
              },
              event: row.jambase_event,
            }))
          : [],
        total: Array.isArray(data) ? data.length : 0
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
  ): Promise<EventReview> {
    try {
      // First check if the user already has a review for this event
      const { data: existingReview, error: checkError } = await supabase
        .from('user_event_reviews' as any)
        .select('*')
        .eq('user_id', userId)
        .eq('jambase_event_id', jambaseEventId)
        .maybeSingle();

      if (checkError) {
        throw checkError;
      }

      if (existingReview) {
        // Update existing review
        const { data, error } = await supabase
          .from('user_event_reviews' as any)
          .update({
            ...reviewData,
            updated_at: new Date().toISOString()
          })
          .eq('user_id', userId)
          .eq('jambase_event_id', jambaseEventId)
          .select()
          .single();

        if (error) throw error;
        if (!data || typeof data !== 'object' || (data as any).id === undefined) {
          throw new Error('Failed to update event review');
        }
        return data as EventReview;
      } else {
        // Create new review
        const { data, error } = await supabase
          .from('user_event_reviews' as any)
          .insert({
            user_id: userId,
            jambase_event_id: jambaseEventId,
            ...reviewData
          })
          .select()
          .single();

        if (error) throw error;
        if (!data || typeof data !== 'object' || (data as any).id === undefined) {
          throw new Error('Failed to create event review');
        }
        return data as EventReview;
      }
    } catch (error) {
      console.error('Error setting event review:', error);
      throw new Error(`Failed to set event review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get user's review for an event
   */
  static async getUserEventReview(userId: string, jambaseEventId: string): Promise<EventReview | null> {
    try {
      const { data, error } = await supabase
        .from('user_event_reviews' as any)
        .select('*')
        .eq('user_id', userId)
        .eq('jambase_event_id', jambaseEventId)
        .single();

      if (error && error.code !== 'PGRST116') {
        throw error;
      }

      if (!data || typeof data !== 'object' || (data as any).id === undefined) {
        return null;
      }
      return data as EventReview;
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
      review: EventReview;
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
      // Use 'any' to avoid deep type instantiation issues with Supabase's select
      const { data, error } = await (supabase
        .from('public_reviews_with_profiles')
        .select(`
          id,
          user_id,
          jambase_event_id,
          rating,
          review,
          created_at,
          profiles (
            id,
            name,
            avatar_url
          )
        `) as any)
        .eq('jambase_event_id', jambaseEventId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch event reviews: ${error.message}`);
      }

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
      review: EventReview;
      event: any; // JamBase event data
    }>;
    total: number;
  }> {
    try {
      // Use 'any' to avoid deep type instantiation issues with Supabase's select
      const { data, error } = await (supabase
        .from('public_reviews_with_profiles')
        .select(`
          id,
          user_id,
          jambase_event_id,
          rating,
          review,
          created_at,
          profiles (
            id,
            name,
            avatar_url
          ),
          jambase_event:jambase_events(*)
        `) as any)
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw new Error(`Failed to fetch user event history: ${error.message}`);
      }

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
      // Use the correct view/table for deletion: 'user_event_reviews' is not a valid table in the Supabase types.
      // Instead, delete from 'public_reviews_with_profiles' if that's the correct view, or from the actual table storing reviews.
      // Assuming the actual table is 'user_jambase_events' and reviews are stored there:
      const { error } = await supabase
        .from('user_jambase_events')
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
      const now = new Date();
      now.setHours(0, 0, 0, 0); // Set to start of today for more reliable date comparison
      const nowISOString = now.toISOString().split('T')[0]; // Get YYYY-MM-DD for date comparison

      // Use explicit typing to avoid deep type instantiation
      const { data, error } = await (supabase
        .from('user_jambase_events')
        .select(`
          *,
          jambase_event:jambase_events(*)
        `) as any)
        .eq('user_id', userId)
        .gte('jambase_event.event_date', nowISOString)
        .order('jambase_event.event_date', { ascending: true });

      if (error) {
        throw new Error(`Failed to fetch upcoming events: ${error.message}`);
      }

      return {
        events: (data || []).map((row: any) => ({
          interest: {
            id: row.id,
            user_id: row.user_id,
            jambase_event_id: row.jambase_event_id,
            created_at: row.created_at,
            // add other UserJamBaseEvent fields if needed
          },
          event: row.jambase_event
        })),
        total: data?.length || 0
      };
    } catch (error) {
      console.error('Error getting user upcoming events:', error);
      throw new Error(`Failed to get user upcoming events: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Mark user as having attended an event (without requiring a review)
   */
  static async markUserAttendance(
    userId: string,
    eventId: string,
    wasThere: boolean
  ): Promise<void> {
    try {
      // Check if user already has a review for this event
      const { data: existingReview, error: checkError } = await (supabase as any)
        .from('user_reviews')
        .select('id, was_there, review_text')
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .maybeSingle();

      if (checkError && checkError.code !== 'PGRST116') {
        throw checkError;
      }

      if (existingReview) {
        if (wasThere) {
          // Update existing review to mark as attended
          const { error } = await (supabase as any)
            .from('user_reviews')
            .update({
              was_there: wasThere,
              updated_at: new Date().toISOString()
            })
            .eq('user_id', userId)
            .eq('event_id', eventId);

          if (error) throw error;
        } else {
          // If unmarking attendance and it's an attendance-only record, delete it entirely
          if (existingReview.review_text === 'ATTENDANCE_ONLY') {
            console.log('🗑️ Deleting ATTENDANCE_ONLY record for:', { userId, eventId });
            const { error } = await (supabase as any)
              .from('user_reviews')
              .delete()
              .eq('user_id', userId)
              .eq('event_id', eventId);

            if (error) {
              console.error('❌ Error deleting ATTENDANCE_ONLY record:', error);
              throw error;
            }
            console.log('✅ Successfully deleted ATTENDANCE_ONLY record');
          } else {
            // If it's a real review, just update was_there to false
            const { error } = await (supabase as any)
              .from('user_reviews')
              .update({
                was_there: wasThere,
                updated_at: new Date().toISOString()
              })
              .eq('user_id', userId)
              .eq('event_id', eventId);

            if (error) throw error;
          }
        }
      } else if (wasThere) {
        // Only create a new record if marking as attended
        // Create a minimal review record just for attendance tracking
        // IMPORTANT: These records should NOT appear in public feeds
        console.log('🎯 Creating ATTENDANCE_ONLY record for:', { userId, eventId, wasThere });
        
        const attendanceRecord = {
          user_id: userId,
          event_id: eventId,
          rating: 1, // Minimum valid rating for attendance-only records
          review_text: 'ATTENDANCE_ONLY', // Special marker for attendance-only records
          was_there: wasThere,
          is_public: false, // EXPLICITLY keep attendance private - should NOT appear in feeds
          is_draft: false, // Not a draft, but also not a public review
          draft_data: null, // No draft data
          likes_count: 0,
          comments_count: 0,
          shares_count: 0,
          review_type: 'event', // Use valid enum value
          performance_rating: null, // No specific rating for attendance-only records
          venue_rating_new: null, // No specific rating for attendance-only records
          overall_experience_rating: null, // No specific rating for attendance-only records
          rank_order: 0
        };
        
        console.log('🎯 ATTENDANCE_ONLY record data:', attendanceRecord);
        
        const { data, error } = await (supabase as any)
          .from('user_reviews')
          .insert(attendanceRecord)
          .select('id, is_public, review_text')
          .single();

        if (error) {
          console.error('❌ Error creating ATTENDANCE_ONLY record:', error);
          throw error;
        }
        
        console.log('✅ ATTENDANCE_ONLY record created:', data);
        
        // Double-check that the record was created with is_public = false
        if (data && data.is_public === true) {
          console.error('🚨 CRITICAL: ATTENDANCE_ONLY record was created as PUBLIC! This should not happen!');
          console.error('🚨 Record data:', data);
          
          // Try to fix it immediately
          const { error: fixError } = await (supabase as any)
            .from('user_reviews')
            .update({ is_public: false })
            .eq('id', data.id);
            
          if (fixError) {
            console.error('❌ Failed to fix is_public flag:', fixError);
          } else {
            console.log('✅ Fixed is_public flag for ATTENDANCE_ONLY record');
          }
        }
      }
      // If wasThere is false and no existing review, do nothing (no record to delete)

      try {
        trackInteraction.interest('event', eventId, wasThere, { action: 'attendance' });
      } catch {}
    } catch (error) {
      console.error('Error marking user attendance:', error);
      throw new Error(`Failed to mark attendance: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if user attended an event
   */
  static async getUserAttendance(userId: string, eventId: string): Promise<boolean> {
    try {
      const { data, error } = await (supabase as any)
        .from('user_reviews')
        .select('was_there, review_text, id, created_at')
        .eq('user_id', userId)
        .eq('event_id', eventId)
        .maybeSingle();

      console.log('🔍 getUserAttendance:', { userId, eventId, data, error });

      if (error && error.code !== 'PGRST116') throw error;
      
      // If there's a review record, they attended (even if was_there is null/false)
      if (data) {
        const hasReview = data.review_text && data.review_text !== 'ATTENDANCE_ONLY';
        const wasThere = Boolean(data.was_there);
        console.log('🔍 Attendance check:', { hasReview, wasThere, reviewText: data.review_text, reviewId: data.id });
        
        // If they have a review but was_there is false/null, fix it
        if (hasReview && !wasThere) {
          console.log('🔧 Auto-fixing attendance for review:', eventId);
          await (supabase as any)
            .from('user_reviews')
            .update({ was_there: true })
            .eq('user_id', userId)
            .eq('event_id', eventId);
          return true;
        }
        
        return wasThere;
      }
      
      // Debug: Let's see if there are ANY reviews for this user/event combination
      console.log('🔍 No review found, checking for any reviews for this user...');
      const { data: allUserReviews, error: allError } = await (supabase as any)
        .from('user_reviews')
        .select('id, event_id, review_text, was_there, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(5);
      
      console.log('🔍 Recent reviews for user:', { allUserReviews, allError });
      
      return false;
    } catch (error) {
      console.error('Error checking user attendance:', error);
      return false;
    }
  }

  /**
   * Get attendance count for an event
   */
  static async getEventAttendanceCount(eventId: string): Promise<number> {
    try {
      const { count, error } = await (supabase as any)
        .from('user_reviews')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', eventId)
        .eq('was_there', true);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error getting event attendance count:', error);
      return 0;
    }
  }

  /**
   * Get users who attended an event (for display purposes)
   */
  static async getEventAttendees(eventId: string, limit: number = 10): Promise<Array<{
    user_id: string;
    name: string;
    avatar_url?: string;
  }>> {
    try {
      const { data, error } = await (supabase as any)
        .from('user_reviews')
        .select(`
          user_id,
          profiles(
            user_id,
            name,
            avatar_url
          )
        `)
        .eq('event_id', eventId)
        .eq('was_there', true)
        .limit(limit);

      if (error) throw error;

      return (data || []).map((row: any) => ({
        user_id: row.user_id,
        name: row.profiles.name,
        avatar_url: row.profiles.avatar_url
      }));
    } catch (error) {
      console.error('Error getting event attendees:', error);
      return [];
    }
  }
}
