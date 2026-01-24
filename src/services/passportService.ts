import { supabase } from '@/integrations/supabase/client';

export interface PassportEntry {
  id: string;
  user_id: string;
  type: 'city' | 'venue' | 'artist' | 'scene' | 'era' | 'festival' | 'artist_milestone';
  entity_id: string | null; // Legacy external ID (for cities/scenes, or metadata)
  entity_uuid: string | null; // UUID foreign key (for venues/artists, primary identity)
  entity_name: string;
  unlocked_at: string;
  metadata: Record<string, any>;
  rarity?: 'common' | 'uncommon' | 'legendary';
  cultural_context?: string;
}

export interface PassportProgress {
  cities: PassportEntry[];
  venues: PassportEntry[];
  artists: PassportEntry[];
  scenes: PassportEntry[];
  totalCount: number;
}

export interface NextToUnlock {
  type: 'city' | 'venue' | 'artist' | 'scene';
  entity_name: string;
  hint: string;
  progress?: number;
  goal?: number;
}

export class PassportService {
  /**
   * Get all passport progress for a user
   */
  static async getPassportProgress(userId: string): Promise<PassportProgress> {
    try {
      const { data, error } = await supabase
        .from('passport_entries')
        .select('*')
        .eq('user_id', userId)
        .order('unlocked_at', { ascending: false });

      if (error) throw error;

      const entries = (data || []) as PassportEntry[];

      return {
        cities: entries.filter(e => e.type === 'city'),
        venues: entries.filter(e => e.type === 'venue'),
        artists: entries.filter(e => e.type === 'artist'),
        scenes: entries.filter(e => e.type === 'scene'),
        totalCount: entries.length,
      };
    } catch (error) {
      console.error('Error fetching passport progress:', error);
      return {
        cities: [],
        venues: [],
        artists: [],
        scenes: [],
        totalCount: 0,
      };
    }
  }

  /**
   * Unlock a passport entry
   */
  static async unlockPassportEntry(
    userId: string,
    type: 'city' | 'venue' | 'artist' | 'scene',
    entityId: string | null,
    entityName: string,
    entityUuid?: string | null,
    metadata?: Record<string, any>
  ): Promise<PassportEntry | null> {
    try {
      const { data, error } = await supabase
        .from('passport_entries')
        .insert({
          user_id: userId,
          type,
          entity_id: entityId,
          entity_uuid: entityUuid || null,
          entity_name: entityName,
          metadata: metadata || {},
        })
        .select()
        .single();

      if (error) {
        // If entry already exists, fetch it
        // Try matching by entity_uuid first (for venues/artists), then entity_id
        if (error.code === '23505') {
          // Build query with proper filtering to avoid .single() errors
          let query = supabase
            .from('passport_entries')
            .select('*')
            .eq('user_id', userId)
            .eq('type', type);
          
          // Must have at least one identifier to avoid matching multiple rows
          if (entityUuid) {
            query = query.eq('entity_uuid', entityUuid);
          } else if (entityId) {
            query = query.eq('entity_id', entityId);
          } else {
            // If both are null/falsy, we can't uniquely identify the entry
            // This shouldn't happen for venues/artists, but handle gracefully
            console.warn('PassportService: Cannot fetch duplicate entry - both entityUuid and entityId are null');
            return null;
          }
          
          const { data: existing, error: fetchError } = await query.single();
          
          if (fetchError) {
            // If .single() fails (multiple matches or not found), log and return null
            console.warn('PassportService: Error fetching duplicate entry:', fetchError);
            return null;
          }
          
          return existing as PassportEntry;
        }
        throw error;
      }

      return data as PassportEntry;
    } catch (error) {
      console.error('Error unlocking passport entry:', error);
      return null;
    }
  }

  /**
   * Get cities visited count
   */
  static async getCitiesVisited(userId: string): Promise<number> {
    try {
      const { count } = await supabase
        .from('passport_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'city');

      return count || 0;
    } catch (error) {
      console.error('Error counting cities:', error);
      return 0;
    }
  }

  /**
   * Get iconic venues unlocked count
   */
  static async getIconicVenuesUnlocked(userId: string): Promise<number> {
    try {
      const { count } = await supabase
        .from('passport_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'venue');

      return count || 0;
    } catch (error) {
      console.error('Error counting venues:', error);
      return 0;
    }
  }

  /**
   * Get artist milestones count
   */
  static async getArtistMilestones(userId: string): Promise<number> {
    try {
      const { count } = await supabase
        .from('passport_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'artist');

      return count || 0;
    } catch (error) {
      console.error('Error counting artists:', error);
      return 0;
    }
  }

  /**
   * Get scene participation count
   */
  static async getSceneParticipation(userId: string): Promise<number> {
    try {
      const { count } = await supabase
        .from('passport_entries')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('type', 'scene');

      return count || 0;
    } catch (error) {
      console.error('Error counting scenes:', error);
      return 0;
    }
  }

  /**
   * Get next items to unlock (suggestions)
   */
  static async getNextToUnlock(userId: string): Promise<NextToUnlock[]> {
    try {
      const hints: NextToUnlock[] = [];

      // Get user's current progress
      const progress = await this.getPassportProgress(userId);

      // Check for nearby cities user hasn't visited
      const { data: userProfile } = await supabase
        .from('users')
        .select('location_city, location_state')
        .eq('user_id', userId)
        .single();

      if (userProfile?.location_city) {
        const visitedCities = new Set(progress.cities.map(c => c.entity_id?.toLowerCase()));
        const userCityId = `${userProfile.location_city.toLowerCase()}_${(userProfile.location_state || '').toLowerCase()}`;
        
        if (!visitedCities.has(userCityId)) {
          hints.push({
            type: 'city',
            entity_name: userProfile.location_city,
            hint: `Review an event in ${userProfile.location_city} to unlock this city`,
            progress: progress.cities.length,
            goal: progress.cities.length + 1,
          });
        }
      }

      // Check for upcoming events with artists user hasn't seen
      const { data: upcomingEvents } = await supabase
        .from('events')
        .select('artist_id, artists!inner(name)')
        .gte('event_date', new Date().toISOString())
        .not('artist_id', 'is', null)
        .limit(10);

      if (upcomingEvents && upcomingEvents.length > 0) {
        const seenArtists = new Set(progress.artists.map(a => a.entity_id));
        const unseenArtist = upcomingEvents.find((e: any) => {
          const artistId = e.artist_id || (e.artists?.id);
          return artistId && !seenArtists.has(artistId);
        });
        
        if (unseenArtist) {
          const artistName = (unseenArtist as any).artists?.name || 'Unknown Artist';
          hints.push({
            type: 'artist',
            entity_name: artistName,
            hint: `Attend a show by ${artistName} to unlock this artist`,
            progress: progress.artists.length,
            goal: progress.artists.length + 1,
          });
        }
      }

      return hints.slice(0, 3); // Return top 3 hints
    } catch (error) {
      console.error('Error getting next to unlock:', error);
      return [];
    }
  }

  /**
   * Get passport identity (fan type, home scene, join year)
   */
  static async getPassportIdentity(userId: string) {
    try {
      // Use explicit column selection to avoid 406 errors with PostgREST
      // Note: home_scene is no longer used, fetched from users.location_city instead
      const { data, error } = await supabase
        .from('passport_identity')
        .select('user_id, fan_type, home_scene_id, join_year, calculated_at, updated_at')
        .eq('user_id', userId)
        .maybeSingle();

      // Handle 406 (Not Acceptable) errors specifically
      if (error) {
        if (error.code === '406' || error.message?.includes('406')) {
          console.warn('Received 406 error for passport_identity query, trying alternative approach');
          // Try without maybeSingle as fallback
          const { data: altData, error: altError } = await supabase
            .from('passport_identity')
            .select('user_id, fan_type, home_scene_id, join_year, calculated_at, updated_at')
            .eq('user_id', userId)
            .limit(1);
          
          if (altError) {
            console.error('Alternative passport_identity query also failed:', altError);
            throw altError;
          }
          
          return altData && altData.length > 0 ? altData[0] : null;
        }
        
        if (error.code !== 'PGRST116') throw error;
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching passport identity:', error);
      return null;
    }
  }

  /**
   * Get stamps filtered by rarity
   */
  static async getStampsByRarity(userId: string, rarity?: 'common' | 'uncommon' | 'legendary') {
    try {
      console.log('PassportService.getStampsByRarity: Fetching stamps for userId:', userId, 'rarity:', rarity);
      
      let query = supabase
        .from('passport_entries')
        .select('*')
        .eq('user_id', userId)
        .order('unlocked_at', { ascending: false });

      if (rarity) {
        query = query.eq('rarity', rarity);
      }

      const { data, error } = await query;
      
      if (error) {
        console.error('PassportService.getStampsByRarity: Database error:', {
          error,
          message: error.message,
          details: error.details,
          hint: error.hint,
          code: error.code,
        });
        throw error;
      }
      
      const stamps = (data || []) as PassportEntry[];
      console.log('PassportService.getStampsByRarity: Successfully fetched', stamps.length, 'stamps');
      
      return stamps;
    } catch (error) {
      console.error('PassportService.getStampsByRarity: Error fetching stamps by rarity:', error);
      return [];
    }
  }

  /**
   * Get timeline highlights - includes ALL events user has reviewed, with milestones attached
   */
  static async getTimeline(userId: string, limit: number = 1000) {
    try {
      // First, get all reviews the user has posted
      const { data: reviews, error: reviewsError } = await supabase
        .from('reviews')
        .select(`
          id,
          rating,
          review_text,
          created_at,
          event_id,
          artist_id,
          venue_id,
          "Event_date"
        `)
        .eq('user_id', userId)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (reviewsError) throw reviewsError;
      if (!reviews || reviews.length === 0) return [];

      // Get all timeline entries (milestones) for these reviews
      const reviewIds = reviews.map(r => r.id);
      const { data: timelineEntries, error: timelineError } = await supabase
        .from('passport_timeline')
        .select('*')
        .eq('user_id', userId)
        .in('review_id', reviewIds);

      if (timelineError) throw timelineError;

      // Create a map of review_id -> timeline entry for quick lookup
      const timelineMap = new Map<string, any>();
      (timelineEntries || []).forEach(entry => {
        if (entry.review_id) {
          timelineMap.set(entry.review_id, entry);
        }
      });

      // Build event names for reviews
      const reviewsWithDetails = await Promise.all(
        reviews.map(async (review) => {
          let artistName: string | null = null;
          let venueName: string | null = null;
          let eventName: string | null = null;

          // Determine which IDs to use (prefer from event, fallback to review)
          let artistId: string | null = null;
          let venueId: string | null = null;

          if (review.event_id) {
            // Get event to find artist_uuid and venue_uuid (UUID foreign keys)
            const { data: event } = await supabase
              .from('events')
              .select('artist_uuid, venue_uuid, artist_name, venue_name')
              .eq('id', review.event_id)
              .single();
            
            // Use UUID from event if available, otherwise use from review
            artistId = event?.artist_uuid || review.artist_id;
            venueId = event?.venue_uuid || review.venue_id;
            
            // Try to get names from event first
            if (event?.artist_name && event?.venue_name) {
              artistName = event.artist_name;
              venueName = event.venue_name;
              eventName = `${artistName} @ ${venueName}`;
            }
          } else {
            artistId = review.artist_id;
            venueId = review.venue_id;
          }

          // If we don't have names yet, fetch them
          if (!artistName && artistId) {
            const { data: artist } = await supabase
              .from('artists')
              .select('name')
              .eq('id', artistId)
              .single();
            artistName = artist?.name || null;
          }

          if (!venueName && venueId) {
            const { data: venue } = await supabase
              .from('venues')
              .select('name')
              .eq('id', venueId)
              .single();
            venueName = venue?.name || null;
          }

          // Build event name if we have artist/venue
          if (!eventName) {
            if (artistName && venueName) {
              eventName = `${artistName} @ ${venueName}`;
            } else if (artistName) {
              eventName = artistName;
            } else if (venueName) {
              eventName = venueName;
            }
          }

          // Get timeline entry (milestone) if it exists
          const timelineEntry = timelineMap.get(review.id);

          // Build the timeline entry object
          // Use timeline entry data if it exists, otherwise create a basic entry from review
          // If there's no timeline entry, mark it as auto_selected (can't edit/delete, but can add milestone)
          const hasTimelineEntry = !!timelineEntry;
          
          return {
            id: timelineEntry?.id || `review-${review.id}`, // Use timeline ID if exists, otherwise generate one
            review_id: review.id,
            is_pinned: timelineEntry?.is_pinned || false,
            is_auto_selected: hasTimelineEntry ? (timelineEntry.is_auto_selected || false) : true, // Auto-selected if no milestone
            significance: timelineEntry?.significance || null,
            description: timelineEntry?.description || null,
            Event_name: timelineEntry?.Event_name || eventName,
            created_at: timelineEntry?.created_at || review.created_at,
            review: {
              id: review.id,
              rating: review.rating,
              review_text: review.review_text,
              Event_date: review.Event_date || review.created_at,
              event_id: review.event_id,
            },
          };
        })
      );

      return reviewsWithDetails;
    } catch (error) {
      console.error('Error fetching timeline:', error);
      return [];
    }
  }

  /**
   * Pin timeline event (max 5)
   */
  static async pinTimelineEvent(userId: string, reviewId: string) {
    try {
      // Check current pin count
      const { count } = await supabase
        .from('passport_timeline')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_pinned', true);

      if (count && count >= 5) {
        throw new Error('Maximum of 5 pinned timeline items allowed');
      }

      // Insert or update timeline entry
      const { data, error } = await supabase
        .from('passport_timeline')
        .upsert({
          user_id: userId,
          review_id: reviewId,
          is_pinned: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,review_id',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error pinning timeline event:', error);
      throw error;
    }
  }

  /**
   * Unpin timeline event
   */
  static async unpinTimelineEvent(userId: string, timelineId: string) {
    try {
      const { error } = await supabase
        .from('passport_timeline')
        .update({ is_pinned: false })
        .eq('id', timelineId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      console.error('Error unpinning timeline event:', error);
      throw error;
    }
  }

  /**
   * Add or update timeline entry with significance text (user-created milestone)
   */
  static async addTimelineMilestone(
    userId: string,
    reviewId: string,
    significance: string,
    description?: string | null
  ) {
    try {
      // Get review to build Event_name
      const { data: review, error: reviewError } = await supabase
        .from('reviews')
        .select(`
          id,
          event_id,
          artist_id,
          venue_id,
          events:event_id (
            artist_id,
            venue_id
          )
        `)
        .eq('id', reviewId)
        .eq('user_id', userId)
        .single();

      if (reviewError || !review) {
        throw new Error('Review not found');
      }

      // Build Event_name from artist and venue names
      const resolvedArtistId = (review.events as any)?.artist_id || review.artist_id;
      const resolvedVenueId = (review.events as any)?.venue_id || review.venue_id;
      
      let eventName: string | null = null;
      if (resolvedArtistId || resolvedVenueId) {
        const [artistResult, venueResult] = await Promise.all([
          resolvedArtistId ? supabase.from('artists').select('name').eq('id', resolvedArtistId).single() : Promise.resolve({ data: null }),
          resolvedVenueId ? supabase.from('venues').select('name').eq('id', resolvedVenueId).single() : Promise.resolve({ data: null })
        ]);
        
        const artistName = (artistResult.data as any)?.name;
        const venueName = (venueResult.data as any)?.name;
        
        if (artistName && venueName) {
          eventName = `${artistName} @ ${venueName}`;
        } else if (artistName) {
          eventName = artistName;
        } else if (venueName) {
          eventName = venueName;
        }
      }

      // Insert or update timeline entry
      const { data, error } = await supabase
        .from('passport_timeline')
        .upsert({
          user_id: userId,
          review_id: reviewId,
          significance: significance,
          description: description || null,
          Event_name: eventName,
          is_auto_selected: false,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,review_id',
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error adding timeline milestone:', error);
      throw error;
    }
  }

  /**
   * Update timeline entry significance
   */
  static async updateTimelineMilestone(
    userId: string,
    timelineId: string,
    significance: string,
    description?: string | null
  ) {
    try {
      const { data, error } = await supabase
        .from('passport_timeline')
        .update({
          significance: significance,
          description: description !== undefined ? description : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', timelineId)
        .eq('user_id', userId)
        .select()
        .single();

      if (error) throw error;
      return data;
    } catch (error) {
      console.error('Error updating timeline milestone:', error);
      throw error;
    }
  }

  /**
   * Delete timeline entry
   */
  static async deleteTimelineEntry(userId: string, timelineId: string) {
    try {
      const { error } = await supabase
        .from('passport_timeline')
        .delete()
        .eq('id', timelineId)
        .eq('user_id', userId);

      if (error) throw error;
    } catch (error) {
      console.error('Error deleting timeline entry:', error);
      throw error;
    }
  }

  /**
   * Get user's reviews for timeline selection
   */
  static async getUserReviewsForTimeline(userId: string, limit: number = 100) {
    try {
      // First, get reviews with event_id
      const { data: reviews, error } = await supabase
        .from('reviews')
        .select(`
          id,
          rating,
          review_text,
          created_at,
          event_id,
          artist_id,
          venue_id,
          "Event_date"
        `)
        .eq('user_id', userId)
        .eq('is_draft', false)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      if (!reviews) return [];

      // For each review, fetch artist and venue names
      const reviewsWithDetails = await Promise.all(
        reviews.map(async (review) => {
          let artistName: string | null = null;
          let venueName: string | null = null;

          // Determine which IDs to use (prefer from event, fallback to review)
          let artistId: string | null = null;
          let venueId: string | null = null;

          if (review.event_id) {
            // Get event to find artist_uuid and venue_uuid (UUID foreign keys)
            const { data: event } = await supabase
              .from('events')
              .select('artist_uuid, venue_uuid')
              .eq('id', review.event_id)
              .single();
            
            // Use UUID from event if available, otherwise use from review
            artistId = event?.artist_uuid || review.artist_id;
            venueId = event?.venue_uuid || review.venue_id;
          } else {
            artistId = review.artist_id;
            venueId = review.venue_id;
          }

          // Fetch artist name
          if (artistId) {
            const { data: artist } = await supabase
              .from('artists')
              .select('name')
              .eq('id', artistId)
              .single();
            artistName = artist?.name || null;
          }

          // Fetch venue name
          if (venueId) {
            const { data: venue } = await supabase
              .from('venues')
              .select('name')
              .eq('id', venueId)
              .single();
            venueName = venue?.name || null;
          }

          // Build event object similar to what was expected
          const eventName = artistName && venueName 
            ? `${artistName} @ ${venueName}`
            : artistName || venueName || 'Event';

          return {
            ...review,
            event: {
              id: review.event_id || null,
              title: eventName,
              artist_name: artistName,
              venue_name: venueName,
              event_date: review.Event_date || review.created_at,
            },
          };
        })
      );

      return reviewsWithDetails;
    } catch (error) {
      console.error('Error fetching user reviews for timeline:', error);
      return [];
    }
  }

  /**
   * Get taste map data
   */
  static async getTasteMap(userId: string) {
    try {
      const { data, error } = await supabase
        .from('passport_taste_map')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle(); // Use maybeSingle() instead of single() to avoid 406 errors when no row exists

      if (error && error.code !== 'PGRST116') throw error;
      return data;
    } catch (error) {
      console.error('Error fetching taste map:', error);
      return null;
    }
  }

  /**
   * Trigger identity recalculation
   */
  static async calculateAndUpdateIdentity(userId: string) {
    try {
      const { error } = await supabase.rpc('recalculate_passport_data', {
        p_user_id: userId,
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error recalculating passport identity:', error);
      return false;
    }
  }
}
