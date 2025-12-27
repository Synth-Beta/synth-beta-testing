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
      const { data, error } = await supabase
        .from('passport_identity')
        .select('*, home_scene:scenes(*)')
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
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
      let query = supabase
        .from('passport_entries')
        .select('*')
        .eq('user_id', userId)
        .order('unlocked_at', { ascending: false });

      if (rarity) {
        query = query.eq('rarity', rarity);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as PassportEntry[];
    } catch (error) {
      console.error('Error fetching stamps by rarity:', error);
      return [];
    }
  }

  /**
   * Get timeline highlights
   */
  static async getTimeline(userId: string, limit: number = 20) {
    try {
      const { data, error } = await supabase
        .from('passport_timeline')
        .select('*, event:events(*), review:reviews(*)')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data || [];
    } catch (error) {
      console.error('Error fetching timeline:', error);
      return [];
    }
  }

  /**
   * Pin timeline event (max 5)
   */
  static async pinTimelineEvent(userId: string, eventId: string, reviewId?: string) {
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
          event_id: eventId,
          review_id: reviewId || null,
          is_pinned: true,
          updated_at: new Date().toISOString(),
        }, {
          onConflict: 'user_id,event_id,review_id',
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










