import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/types/eventTypes';

export interface SceneParticipant {
  id: string;
  participant_type: 'artist' | 'venue' | 'city' | 'genre';
  artist_id?: string;
  venue_id?: string;
  text_value?: string;
  // Joined data
  artist_name?: string;
  venue_name?: string;
}

export interface Scene {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  short_description: string | null;
  energy_level: 'intimate' | 'vibrant' | 'intense' | 'laid-back' | 'eclectic' | null;
  era_start_year: number | null;
  era_end_year: number | null;
  cultural_significance: string | null;
  image_url: string | null;
  scene_url: string | null;
  color_theme: string | null;
  // Legacy array fields (deprecated, use participants instead)
  participating_artists: string[];
  participating_venues: string[];
  participating_cities: string[];
  participating_genres: string[];
  // New normalized participants
  participants?: SceneParticipant[];
  discovery_threshold: number;
  completion_threshold: number;
  is_active: boolean;
  is_featured: boolean;
  sort_order: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  // Computed fields
  upcomingEventsCount?: number;
  activeReviewersCount?: number;
  // User progress (if provided)
  userProgress?: UserSceneProgress;
}

export interface UserSceneProgress {
  id: string;
  user_id: string;
  scene_id: string;
  discovery_state: 'undiscovered' | 'discovered' | 'in_progress' | 'completed';
  artists_experienced: number;
  venues_experienced: number;
  cities_experienced: number;
  genres_experienced: number;
  events_experienced: number;
  progress_percentage: number;
  discovered_at: string | null;
  started_at: string | null;
  completed_at: string | null;
  last_activity_at: string | null;
  metadata: Record<string, any>;
}

export interface SceneDetail extends Scene {
  upcomingEvents: JamBaseEvent[];
  activeReviewers: Array<{
    user_id: string;
    name: string;
    avatar_url?: string;
    review_count: number;
  }>;
}

export class SceneService {
  /**
   * Get scenes from database (replaces generateScenes)
   */
  static async getScenes(limit: number = 10, userId?: string): Promise<Scene[]> {
    try {
      // Query active scenes from database
      let query = supabase
        .from('scenes')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true })
        .order('is_featured', { ascending: false })
        .limit(limit);

      const { data: scenes, error } = await query;
          
      if (error) throw error;
      if (!scenes || scenes.length === 0) return [];

      // Get user progress if userId provided (fail silently if table/RLS issues)
      let userProgressMap = new Map<string, UserSceneProgress>();
      if (userId) {
        try {
          const sceneIds = scenes.map(s => s.id);
          const { data: progress, error: progressError } = await supabase
            .from('user_scene_progress')
            .select('*')
            .eq('user_id', userId)
            .in('scene_id', sceneIds);

          // Only use progress if no error (ignore 406/RLS errors silently)
          if (!progressError && progress) {
            progress.forEach(p => {
              userProgressMap.set(p.scene_id, p as UserSceneProgress);
            });
          }
        } catch (error) {
          // Silently fail - progress is optional
        }
      }

      // Fetch participants for all scenes
      const sceneIds = scenes.map(s => s.id);
      const { data: participantsData } = await supabase
        .from('scene_participants')
        .select(`
          id,
          scene_id,
          participant_type,
          artist_id,
          venue_id,
          text_value
        `)
        .in('scene_id', sceneIds);

      // Get artist and venue IDs to fetch names
      const artistIds = [...new Set(participantsData?.filter(p => p.artist_id).map(p => p.artist_id) || [])];
      const venueIds = [...new Set(participantsData?.filter(p => p.venue_id).map(p => p.venue_id) || [])];

      // Fetch artist names
      const artistMap = new Map<string, string>();
      if (artistIds.length > 0) {
        const { data: artists } = await supabase
          .from('artists')
          .select('id, name')
          .in('id', artistIds);
        artists?.forEach(a => artistMap.set(a.id, a.name));
      }

      // Fetch venue names
      const venueMap = new Map<string, string>();
      if (venueIds.length > 0) {
        const { data: venues } = await supabase
          .from('venues')
          .select('id, name')
          .in('id', venueIds);
        venues?.forEach(v => venueMap.set(v.id, v.name));
      }

      // Group participants by scene_id
      const participantsByScene = new Map<string, SceneParticipant[]>();
      if (participantsData) {
        participantsData.forEach((p: any) => {
          if (!participantsByScene.has(p.scene_id)) {
            participantsByScene.set(p.scene_id, []);
          }
          participantsByScene.get(p.scene_id)!.push({
            id: p.id,
            participant_type: p.participant_type,
            artist_id: p.artist_id,
            venue_id: p.venue_id,
            text_value: p.text_value,
            artist_name: p.artist_id ? artistMap.get(p.artist_id) : undefined,
            venue_name: p.venue_id ? venueMap.get(p.venue_id) : undefined,
          });
        });
      }

      // Calculate upcoming events count and active reviewers for each scene
      const scenesWithCounts = await Promise.all(
        scenes.map(async (scene) => {
          const participants = participantsByScene.get(scene.id) || [];
          
          // Build legacy arrays for backward compatibility
          const participating_artists = participants
            .filter(p => p.participant_type === 'artist' && p.artist_id)
            .map(p => p.artist_id!);
          const participating_venues = participants
            .filter(p => p.participant_type === 'venue' && p.venue_id)
            .map(p => p.venue_id!);
          const participating_cities = participants
            .filter(p => p.participant_type === 'city' && p.text_value)
            .map(p => p.text_value!);
          const participating_genres = participants
            .filter(p => p.participant_type === 'genre' && p.text_value)
            .map(p => p.text_value!);

          const upcomingCount = await this.getUpcomingEventsCount({
            ...scene,
            participating_artists,
            participating_venues,
            participating_cities,
            participating_genres,
          });
          const reviewersCount = await this.getActiveReviewersCount(scene.id, participating_genres);
          
          return {
            ...scene,
            participants,
            participating_artists,
            participating_venues,
            participating_cities,
            participating_genres,
            upcomingEventsCount: upcomingCount,
            activeReviewersCount: reviewersCount,
            userProgress: userProgressMap.get(scene.id),
          } as Scene;
        })
      );

      return scenesWithCounts;
    } catch (error) {
      console.error('Error getting scenes:', error);
      return [];
    }
  }

  /**
   * Get active reviewers count for a scene
   * Counts unique users who have reviewed events matching the scene criteria
   */
  private static async getActiveReviewersCount(sceneId: string, genres: string[]): Promise<number> {
    try {
      // Get scene to access its criteria
      const { data: scene } = await supabase
        .from('scenes')
        .select('*')
        .eq('id', sceneId)
        .single();

      if (!scene) return 0;

      // Build query for upcoming events matching scene criteria
      let eventsQuery = supabase
        .from('events')
        .select('id')
        .gte('event_date', new Date().toISOString());

      // Apply scene filters
      if (scene.participating_artists && scene.participating_artists.length > 0) {
        eventsQuery = eventsQuery.in('artist_id', scene.participating_artists).not('artist_id', 'is', null);
      }
      if (scene.participating_venues && scene.participating_venues.length > 0) {
        eventsQuery = eventsQuery.in('venue_id', scene.participating_venues).not('venue_id', 'is', null);
      }
      if (scene.participating_cities && scene.participating_cities.length > 0) {
        eventsQuery = eventsQuery.in('venue_city', scene.participating_cities);
      }
      if (genres && genres.length > 0) {
        eventsQuery = eventsQuery.overlaps('genres', genres);
      }

      const { data: events } = await eventsQuery.limit(100);

      if (!events || events.length === 0) return 0;

      const eventIds = events.map(e => e.id);

      // Count unique reviewers
      const { count, error } = await supabase
        .from('reviews')
        .select('user_id', { count: 'exact', head: true })
        .in('event_id', eventIds)
        .eq('is_draft', false)
        .eq('was_there', true);

      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error counting active reviewers:', error);
      return 0;
    }
  }

  /**
   * Get upcoming events count for a scene
   * Uses JamBase IDs (artist_id, venue_id) for matching
   */
  private static async getUpcomingEventsCount(scene: any): Promise<number> {
    try {
      let query = supabase
        .from('events')
        .select('id', { count: 'exact', head: true })
        .gte('event_date', new Date().toISOString());

      // Apply scene filters - use JamBase IDs
      if (scene.participating_artists && scene.participating_artists.length > 0) {
        query = query.in('artist_id', scene.participating_artists).not('artist_id', 'is', null);
      }
      if (scene.participating_venues && scene.participating_venues.length > 0) {
        query = query.in('venue_id', scene.participating_venues).not('venue_id', 'is', null);
      }
      if (scene.participating_cities && scene.participating_cities.length > 0) {
        query = query.in('venue_city', scene.participating_cities);
      }
      if (scene.participating_genres && scene.participating_genres.length > 0) {
        query = query.overlaps('genres', scene.participating_genres);
      }

      const { count, error } = await query;
      if (error) throw error;
      return count || 0;
    } catch (error) {
      console.error('Error counting upcoming events:', error);
      return 0;
    }
  }

  /**
   * Get user's scene progress
   */
  static async getUserSceneProgress(userId: string, sceneId: string): Promise<UserSceneProgress | null> {
    try {
      // Skip RPC function entirely - use direct table query
      // The RPC function has PostgREST exposure issues, so we'll use direct queries
      // which work fine with proper RLS policies
      const { data, error } = await supabase
        .from('user_scene_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('scene_id', sceneId)
        .maybeSingle();

      if (error) {
        // Handle various error codes gracefully
        if (error.code === 'PGRST116') return null; // Not found
        if (error.code === 'PGRST301' || error.status === 406) {
          // RLS policy issue - log for debugging but return null gracefully
          console.warn('RLS blocking access to user_scene_progress:', {
            code: error.code,
            status: error.status,
            message: error.message
          });
          return null;
        }
        // For other errors, log but don't throw
        console.warn('Error getting user scene progress:', error);
        return null;
      }

      return data as UserSceneProgress | null;
    } catch (error) {
      // Catch any unexpected errors
      console.warn('Error getting user scene progress:', error);
      return null;
    }
  }

  /**
   * Refresh user's scene progress (triggers calculation)
   * Returns false if the operation fails (non-critical)
   */
  static async refreshSceneProgress(userId: string, sceneId: string): Promise<boolean> {
    try {
      const { error } = await supabase.rpc('calculate_scene_progress', {
        p_user_id: userId,
        p_scene_id: sceneId,
      });

      if (error) {
        // Log but don't throw - this is non-critical for scene display
        console.warn('Scene progress calculation failed (non-critical):', error);
        return false;
      }
      return true;
    } catch (error) {
      // Log but don't throw - scene can still be displayed without progress
      console.warn('Error refreshing scene progress (non-critical):', error);
      return false;
    }
  }

  /**
   * Get all user's scene progress
   */
  static async getAllUserSceneProgress(userId: string): Promise<UserSceneProgress[]> {
    try {
      // Try using the function first (bypasses RLS)
      const { data: functionData, error: functionError } = await supabase
        .rpc('get_all_user_scene_progress', {
          p_user_id: userId
        });

      // If function works and returns data, use it
      if (!functionError && functionData) {
        return functionData as UserSceneProgress[];
      }

      // If function returns 406 or other access errors, skip to direct query
      // Don't log 406 errors as warnings since they're expected if function isn't accessible
      if (functionError && functionError.status !== 406) {
        console.warn('RPC function error (non-critical):', functionError);
      }

      // Fallback to direct table query if function doesn't exist or fails
      const { data, error } = await supabase
        .from('user_scene_progress')
        .select('*')
        .eq('user_id', userId)
        .order('last_activity_at', { ascending: false });

      if (error) {
        // Handle RLS/access errors gracefully
        if (error.code === 'PGRST301' || error.status === 406) {
          // Don't log as this is expected if RLS blocks access
          return [];
        }
        // For other errors, log but don't throw
        console.warn('Error getting all user scene progress:', error);
        return [];
      }
      return (data || []) as UserSceneProgress[];
    } catch (error) {
      console.warn('Error getting all user scene progress:', error);
      return [];
    }
  }

  /**
   * Legacy method - kept for backward compatibility but now queries database
   * @deprecated Use getScenes instead
   */
  static async generateScenes(limit: number = 10): Promise<Scene[]> {
    return this.getScenes(limit);
  }

  /**
   * Get scene details from database
   */
  static async getSceneDetails(sceneId: string, userId?: string): Promise<SceneDetail | null> {
    try {
      // Get scene from database
      const { data: scene, error: sceneError } = await supabase
        .from('scenes')
        .select('*')
        .eq('id', sceneId)
        .eq('is_active', true)
        .single();

      if (sceneError || !scene) {
        return null;
      }

      // Get user progress if userId provided (fail silently if table/RLS issues)
      let userProgress: UserSceneProgress | null = null;
      if (userId) {
        try {
          userProgress = await this.getUserSceneProgress(userId, sceneId);
        } catch (error) {
          // Silently fail - progress is optional
        }
      }

      // Fetch participants from normalized table
      const { data: participantsData } = await supabase
        .from('scene_participants')
        .select(`
          id,
          participant_type,
          artist_id,
          venue_id,
          text_value
        `)
        .eq('scene_id', sceneId);

      // Get artist and venue IDs to fetch names
      const artistIds = [...new Set(participantsData?.filter(p => p.artist_id).map(p => p.artist_id) || [])];
      const venueIds = [...new Set(participantsData?.filter(p => p.venue_id).map(p => p.venue_id) || [])];

      // Fetch artist names and identifiers
      const artistMap = new Map<string, { name: string; identifier: string }>();
      if (artistIds.length > 0) {
        const { data: artists } = await supabase
          .from('artists')
          .select('id, name, identifier')
          .in('id', artistIds);
        artists?.forEach(a => artistMap.set(a.id, { name: a.name, identifier: a.identifier }));
      }

      // Fetch venue names and identifiers
      const venueMap = new Map<string, { name: string; identifier: string }>();
      if (venueIds.length > 0) {
        const { data: venues } = await supabase
          .from('venues')
          .select('id, name, identifier')
          .in('id', venueIds);
        venues?.forEach(v => venueMap.set(v.id, { name: v.name, identifier: v.identifier }));
      }

      // Build legacy arrays from participants for backward compatibility
      const participating_artists: string[] = [];
      const participating_venues: string[] = [];
      const participating_cities: string[] = [];
      const participating_genres: string[] = [];
      const participants: SceneParticipant[] = [];

      if (participantsData) {
        participantsData.forEach((p: any) => {
          participants.push({
            id: p.id,
            participant_type: p.participant_type,
            artist_id: p.artist_id,
            venue_id: p.venue_id,
            text_value: p.text_value,
            artist_name: p.artist_id ? artistMap.get(p.artist_id)?.name : undefined,
            venue_name: p.venue_id ? venueMap.get(p.venue_id)?.name : undefined,
          });

          if (p.participant_type === 'artist' && p.artist_id) {
            const artist = artistMap.get(p.artist_id);
            if (artist?.identifier) {
              participating_artists.push(artist.identifier);
            }
          } else if (p.participant_type === 'venue' && p.venue_id) {
            const venue = venueMap.get(p.venue_id);
            if (venue?.identifier) {
              participating_venues.push(venue.identifier);
            }
          } else if (p.participant_type === 'city' && p.text_value) {
            participating_cities.push(p.text_value);
          } else if (p.participant_type === 'genre' && p.text_value) {
            participating_genres.push(p.text_value);
          }
        });
      }

      // Build query for upcoming events - fetch events matching any scene criteria
      const eventQueries: Promise<any>[] = [];
      const eventSet = new Set<string>();
      const allEvents: any[] = [];

      // Query by artists - match by identifier with flexible matching
      if (participating_artists.length > 0) {
        const artistQueryPromise = supabase
          .from('events')
          .select('*')
          .gte('event_date', new Date().toISOString())
          .not('artist_id', 'is', null)
          .order('event_date', { ascending: true })
          .limit(200)
          .then(({ data: artistEvents, error }) => {
            if (error) throw error;
            if (!artistEvents) return [];
            
            // Filter events where artist_id matches any of our artist identifiers
            const filtered = artistEvents.filter((event: any) => {
              if (!event.artist_id) return false;
              return participating_artists.some(artistId => {
                // Try exact match
                if (event.artist_id === artistId) return true;
                // Try with/without jambase: prefix
                const eventId = event.artist_id.replace(/^jambase:/, '');
                const artistIdClean = artistId.replace(/^jambase:/, '');
                if (eventId === artistIdClean) return true;
                return false;
              });
            });
            
            return filtered;
          });
        
        eventQueries.push(artistQueryPromise);
      }

      // Query by venues - match by identifier with flexible matching, fallback to name
      if (participating_venues.length > 0) {
        // Get venue names for fallback matching from participants we just built
        const venueNames = participants
          .filter(p => p.participant_type === 'venue' && p.venue_name)
          .map(p => p.venue_name!)
          .filter(Boolean);
        
        // Build a promise that fetches and filters events
        const venueQueryPromise = supabase
          .from('events')
          .select('*')
          .gte('event_date', new Date().toISOString())
          .order('event_date', { ascending: true })
          .limit(500) // Get more events to filter
          .then(({ data: venueEvents, error }) => {
            if (error) throw error;
            if (!venueEvents) return [];
            
            // Filter events where venue_id OR venue_name matches
            const filtered = venueEvents.filter((event: any) => {
              // Try identifier matching first
              if (event.venue_id) {
                const matches = participating_venues.some(venueId => {
                  // Try exact match
                  if (event.venue_id === venueId) return true;
                  // Try with/without jambase: prefix
                  const eventId = event.venue_id.replace(/^jambase:/, '');
                  const venueIdClean = venueId.replace(/^jambase:/, '');
                  if (eventId === venueIdClean) return true;
                  return false;
                });
                if (matches) return true;
              }
              
              // Fallback to name matching
              if (event.venue_name && venueNames.length > 0) {
                return venueNames.some(name => {
                  const eventName = event.venue_name?.toLowerCase().trim();
                  const venueName = name?.toLowerCase().trim();
                  if (!eventName || !venueName) return false;
                  // Exact match or contains
                  return eventName === venueName || 
                         eventName.includes(venueName) || 
                         venueName.includes(eventName);
                });
              }
              
              return false;
            });
            
            return filtered;
          });
        
        eventQueries.push(venueQueryPromise);
      }

      // Query by cities
      if (participating_cities.length > 0) {
        const query = supabase
        .from('events')
        .select('*')
        .gte('event_date', new Date().toISOString())
          .in('venue_city', participating_cities)
        .order('event_date', { ascending: true })
          .limit(50);
        eventQueries.push(query);
      }

      // Query by genres
      if (participating_genres.length > 0) {
        const query = supabase
        .from('events')
          .select('*')
        .gte('event_date', new Date().toISOString())
          .overlaps('genres', participating_genres)
          .order('event_date', { ascending: true })
          .limit(50);
        eventQueries.push(query);
      }

      // Execute all queries and combine results
      if (eventQueries.length > 0) {
        try {
          const results = await Promise.all(eventQueries);
          
          results.forEach((result, idx) => {
            // Handle both array results (from filtering) and Supabase response objects
            let events: any[] = [];
            if (Array.isArray(result)) {
              events = result;
            } else if (result && typeof result === 'object' && 'data' in result) {
              events = result.data || [];
            }
            
            events.forEach((event: any) => {
              if (event && event.id && !eventSet.has(event.id)) {
                eventSet.add(event.id);
                allEvents.push(event);
              }
            });
          });
        } catch (error) {
          console.error('Error fetching scene events:', error);
          // Continue with empty events array - don't break the scene display
        }
      }

      // Sort by date and limit
      const events = allEvents
        .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())
        .slice(0, 20);

      // Get event IDs for reviewer lookup
      const eventIds = (events || []).map(e => e.id);

      // Get active reviewers for these events
      let reviewersQuery = supabase
        .from('reviews')
        .select('user_id, event_id')
        .eq('is_draft', false)
        .eq('was_there', true)
        .limit(100);

      if (eventIds.length > 0) {
        reviewersQuery = reviewersQuery.in('event_id', eventIds);
      } else {
        // If no events, return empty reviewers
        reviewersQuery = reviewersQuery.eq('event_id', '00000000-0000-0000-0000-000000000000'); // Dummy ID to return empty
      }

      const { data: reviewers } = await reviewersQuery;

      // Get user profiles
      const userIds = [...new Set((reviewers || []).map(r => r.user_id))];
      const { data: userProfiles } = await supabase
        .from('users')
        .select('user_id, name, avatar_url')
        .in('user_id', userIds.length > 0 ? userIds : ['']);

      const reviewerMap = new Map<string, {
        user_id: string;
        name: string;
        avatar_url?: string;
        review_count: number;
      }>();

      const usersMap = new Map((userProfiles || []).map((u: any) => [u.user_id, u]));

      (reviewers || []).forEach((r: any) => {
        const userId = r.user_id;
        const user = usersMap.get(userId);
        if (userId && user) {
          const existing = reviewerMap.get(userId) || {
            user_id: userId,
            name: user.name || 'User',
            avatar_url: user.avatar_url,
            review_count: 0,
          };
          existing.review_count += 1;
          reviewerMap.set(userId, existing);
        }
      });

      return {
        ...scene,
        participants,
        participating_artists,
        participating_venues,
        participating_cities,
        participating_genres,
        userProgress: userProgress || undefined,
        upcomingEvents: (events || []) as JamBaseEvent[],
        activeReviewers: Array.from(reviewerMap.values())
          .sort((a, b) => b.review_count - a.review_count)
          .slice(0, 10),
      } as SceneDetail;
    } catch (error) {
      console.error('Error getting scene details:', error);
      return null;
    }
  }

  /**
   * Get upcoming events for a scene
   */
  static async getSceneEvents(sceneId: string, limit: number = 20): Promise<JamBaseEvent[]> {
    try {
      const scene = await this.getSceneDetails(sceneId);
      if (!scene) return [];

      return scene.upcomingEvents.slice(0, limit);
    } catch (error) {
      console.error('Error getting scene events:', error);
      return [];
    }
  }

  /**
   * Get active reviewers for a scene
   */
  static async getSceneReviewers(sceneId: string): Promise<SceneDetail['activeReviewers']> {
    try {
      const scene = await this.getSceneDetails(sceneId);
      if (!scene) return [];

      return scene.activeReviewers;
    } catch (error) {
      console.error('Error getting scene reviewers:', error);
      return [];
    }
  }
}

