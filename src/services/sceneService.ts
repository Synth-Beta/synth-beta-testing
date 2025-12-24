import { supabase } from '@/integrations/supabase/client';
import type { JamBaseEvent } from '@/types/eventTypes';

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
  participating_artists: string[];
  participating_venues: string[];
  participating_cities: string[];
  participating_genres: string[];
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

      // Get user progress if userId provided
      let userProgressMap = new Map<string, UserSceneProgress>();
      if (userId) {
        const sceneIds = scenes.map(s => s.id);
        const { data: progress } = await supabase
          .from('user_scene_progress')
          .select('*')
          .eq('user_id', userId)
          .in('scene_id', sceneIds);

        if (progress) {
          progress.forEach(p => {
            userProgressMap.set(p.scene_id, p as UserSceneProgress);
              });
            }
      }

      // Calculate upcoming events count and active reviewers for each scene
      const scenesWithCounts = await Promise.all(
        scenes.map(async (scene) => {
          const upcomingCount = await this.getUpcomingEventsCount(scene);
          const reviewersCount = await this.getActiveReviewersCount(scene.id, scene.participating_genres || []);
          
          return {
            ...scene,
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
      const { data, error } = await supabase
        .from('user_scene_progress')
        .select('*')
        .eq('user_id', userId)
        .eq('scene_id', sceneId)
        .single();

      if (error) {
        if (error.code === 'PGRST116') return null; // Not found
        throw error;
      }

      return data as UserSceneProgress;
    } catch (error) {
      console.error('Error getting user scene progress:', error);
      return null;
      }
  }

  /**
   * Refresh user's scene progress (triggers calculation)
   */
  static async refreshSceneProgress(userId: string, sceneId: string): Promise<void> {
    try {
      const { error } = await supabase.rpc('calculate_scene_progress', {
        p_user_id: userId,
        p_scene_id: sceneId,
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error refreshing scene progress:', error);
      throw error;
    }
  }

  /**
   * Get all user's scene progress
   */
  static async getAllUserSceneProgress(userId: string): Promise<UserSceneProgress[]> {
    try {
      const { data, error } = await supabase
        .from('user_scene_progress')
        .select('*')
        .eq('user_id', userId)
        .order('last_activity_at', { ascending: false });

      if (error) throw error;
      return (data || []) as UserSceneProgress[];
    } catch (error) {
      console.error('Error getting all user scene progress:', error);
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

      // Get user progress if userId provided
      let userProgress: UserSceneProgress | null = null;
      if (userId) {
        userProgress = await this.getUserSceneProgress(userId, sceneId);
      }

      // Build query for upcoming events - fetch events matching any scene criteria
      const eventQueries: Promise<any>[] = [];
      const eventSet = new Set<string>();
      const allEvents: any[] = [];

      // Query by artists - use JamBase artist_id
      if (scene.participating_artists && scene.participating_artists.length > 0) {
        const query = supabase
          .from('events')
          .select('*')
          .gte('event_date', new Date().toISOString())
          .in('artist_id', scene.participating_artists)
          .not('artist_id', 'is', null)
          .order('event_date', { ascending: true })
          .limit(50);
        eventQueries.push(query);
      }

      // Query by venues - use JamBase venue_id
      if (scene.participating_venues && scene.participating_venues.length > 0) {
        const query = supabase
          .from('events')
          .select('*')
          .gte('event_date', new Date().toISOString())
          .in('venue_id', scene.participating_venues)
          .not('venue_id', 'is', null)
          .order('event_date', { ascending: true })
          .limit(50);
        eventQueries.push(query);
      }

      // Query by cities
      if (scene.participating_cities && scene.participating_cities.length > 0) {
        const query = supabase
        .from('events')
        .select('*')
        .gte('event_date', new Date().toISOString())
          .in('venue_city', scene.participating_cities)
        .order('event_date', { ascending: true })
          .limit(50);
        eventQueries.push(query);
      }

      // Query by genres
      if (scene.participating_genres && scene.participating_genres.length > 0) {
        const query = supabase
        .from('events')
          .select('*')
        .gte('event_date', new Date().toISOString())
          .overlaps('genres', scene.participating_genres)
          .order('event_date', { ascending: true })
          .limit(50);
        eventQueries.push(query);
      }

      // Execute all queries and combine results
      if (eventQueries.length > 0) {
        const results = await Promise.all(eventQueries);
        results.forEach((result) => {
          if (result.data) {
            result.data.forEach((event: any) => {
              if (!eventSet.has(event.id)) {
                eventSet.add(event.id);
                allEvents.push(event);
              }
            });
          }
        });
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

